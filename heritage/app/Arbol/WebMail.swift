import Foundation
import WebKit
import AppKit
import CryptoKit

enum GmailExperimentResource: String {
    case navigation
    case action
    case javascriptEvaluation
}

struct GmailExperimentSafetyLimits: Equatable {
    let cooldown: TimeInterval
    let maximumElapsed: TimeInterval
    let maximumNavigations: Int
    let maximumActions: Int
    let maximumJavaScriptEvaluations: Int

    // Deliberately conservative: one live feasibility attempt per day, at most
    // six navigation commits across the conversation and print popup, two
    // semantic UI actions (More + Print all), and bounded observation work.
    static let printView = GmailExperimentSafetyLimits(
        cooldown: 24 * 60 * 60, maximumElapsed: 15,
        maximumNavigations: 6, maximumActions: 2,
        maximumJavaScriptEvaluations: 32
    )
}

enum GmailExperimentAdmission: Equatable {
    case admitted
    case coalesced
    case denied(String)
}

/// Process-local serialization plus durable cooldown/provider-challenge state.
/// This coordinator performs no network work. It is intentionally testable with
/// an isolated UserDefaults suite and injected clock.
@MainActor
final class GmailExperimentSafetyCoordinator {
    private struct ActiveOperation {
        let id: String
        let startedAt: Date
        var navigationCount = 0
        var actionCount = 0
        var javascriptEvaluationCount = 0
    }

    private let defaults: UserDefaults
    private let keyPrefix: String
    private let clock: () -> Date
    let limits: GmailExperimentSafetyLimits
    private var active: ActiveOperation?

    init(defaults: UserDefaults = .standard,
         keyPrefix: String = "arbol.willo.gmail-experiment-safety-v1",
         limits: GmailExperimentSafetyLimits = .printView,
         clock: @escaping () -> Date = Date.init) {
        self.defaults = defaults
        self.keyPrefix = keyPrefix
        self.limits = limits
        self.clock = clock
    }

    private var lastAttemptKey: String { "\(keyPrefix).last-attempt-at" }
    private var challengeKey: String { "\(keyPrefix).provider-challenge-at" }
    private var reviewedRecoveryKey: String { "\(keyPrefix).reviewed-recovery-id" }

    private func storedDate(_ key: String) -> Date? {
        let value = defaults.double(forKey: key)
        return value > 0 ? Date(timeIntervalSince1970: value) : nil
    }

    private func store(_ date: Date, key: String) {
        defaults.set(date.timeIntervalSince1970, forKey: key)
    }

    func status(now suppliedNow: Date? = nil) -> [String: Any] {
        let now = suppliedNow ?? clock()
        let lastAttempt = storedDate(lastAttemptKey)
        let challenge = storedDate(challengeKey)
        let cooldownRemaining = lastAttempt.map {
            max(0, Int(ceil(limits.cooldown - now.timeIntervalSince($0))))
        } ?? 0
        return [
            "provider_challenge_detected": challenge != nil,
            "running": active != nil,
            "cooldown_remaining_seconds": cooldownRemaining,
            "maximum_elapsed_seconds": Int(limits.maximumElapsed),
            "maximum_navigations": limits.maximumNavigations,
            "maximum_actions": limits.maximumActions,
            "maximum_javascript_evaluations": limits.maximumJavaScriptEvaluations,
            "navigation_count": active?.navigationCount ?? 0,
            "action_count": active?.actionCount ?? 0,
            "javascript_evaluation_count": active?.javascriptEvaluationCount ?? 0,
        ]
    }

    func beginExplicitPrintViewExperiment(operationID: String) -> GmailExperimentAdmission {
        let now = clock()
        guard UUID(uuidString: operationID) != nil else { return .denied("invalid_authorization") }
        if let active {
            return active.id == operationID ? .coalesced : .denied("operation_in_flight")
        }
        guard storedDate(challengeKey) == nil else { return .denied("provider_challenge_circuit_open") }
        if let lastAttempt = storedDate(lastAttemptKey),
           now.timeIntervalSince(lastAttempt) < limits.cooldown {
            return .denied("cooldown_active")
        }
        store(now, key: lastAttemptKey)
        active = ActiveOperation(id: operationID, startedAt: now)
        return .admitted
    }

    func consume(_ resource: GmailExperimentResource, operationID: String) -> GmailExperimentAdmission {
        guard var operation = active, operation.id == operationID else {
            return .denied("operation_not_authorized")
        }
        guard clock().timeIntervalSince(operation.startedAt) <= limits.maximumElapsed else {
            active = nil
            return .denied("elapsed_budget_exhausted")
        }
        switch resource {
        case .navigation:
            guard operation.navigationCount < limits.maximumNavigations else {
                active = nil
                return .denied("navigation_budget_exhausted")
            }
            operation.navigationCount += 1
        case .action:
            guard operation.actionCount < limits.maximumActions else {
                active = nil
                return .denied("action_budget_exhausted")
            }
            operation.actionCount += 1
        case .javascriptEvaluation:
            guard operation.javascriptEvaluationCount < limits.maximumJavaScriptEvaluations else {
                active = nil
                return .denied("javascript_budget_exhausted")
            }
            operation.javascriptEvaluationCount += 1
        }
        active = operation
        return .admitted
    }

    func checkpoint(operationID: String) -> GmailExperimentAdmission {
        guard let operation = active, operation.id == operationID else {
            return .denied("operation_not_authorized")
        }
        if clock().timeIntervalSince(operation.startedAt) > limits.maximumElapsed {
            active = nil
            return .denied("elapsed_budget_exhausted")
        }
        return .admitted
    }

    func recordProviderChallenge(operationID: String) {
        guard active?.id == operationID else { return }
        openProviderChallengeCircuit()
    }

    func openProviderChallengeCircuit() {
        store(clock(), key: challengeKey)
        active = nil
    }

    func finish(operationID: String) {
        guard active?.id == operationID else { return }
        active = nil
    }

    // No renderer/native command exposes this reset. A reviewed source change
    // supplies a new immutable recovery ID once, after the user confirms account
    // recovery. Reusing that ID can never clear a later provider challenge.
    @discardableResult
    func applyReviewedRecovery(id: String) -> Bool {
        guard !id.isEmpty, id.count <= 120,
              defaults.string(forKey: reviewedRecoveryKey) != id else { return false }
        defaults.set(id, forKey: reviewedRecoveryKey)
        defaults.removeObject(forKey: challengeKey)
        return true
    }
}

/// Persistent, isolated Gmail session for Willo Emails.
///
/// Login happens in an Arbol-owned WKWebView. Gmail access is currently
/// fail-closed after Google temporarily locked the test account for unusual
/// activity. Passwords are never observed or stored by Arbol; WebKit owns any
/// previously authenticated cookies.
@MainActor
final class WebMailBridge: NSObject, WKUIDelegate, WKNavigationDelegate, NSWindowDelegate, NSSplitViewDelegate, WKScriptMessageHandler {
    static let shared = WebMailBridge()

    static func emailsFeatureEnabled() async -> Bool {
        guard let result = try? await CoreClient.shared.call(method: "feature_toggles.list", params: [:]),
              let features = result["features"] as? [[String: Any]] else { return false }
        return features.first { $0["key"] as? String == "willo.emails" }?["enabled"] as? Bool == true
    }

    func refreshFeatureStatus() async -> Bool {
        let enabled = await Self.emailsFeatureEnabled()
        if !enabled {
            userMediatedWebView?.stopLoading()
            loginWindow?.close()
        }
        return enabled
    }

    static let emailSnapshotDidChangeNotification = Notification.Name(
        "arbol.willo.email-snapshot-did-change"
    )
    static let emailSyncProgressDidChangeNotification = Notification.Name(
        "arbol.willo.email-sync-progress-did-change"
    )
    static let automaticSyncAfterUserMessageRequestNotification = Notification.Name(
        "arbol.willo.automatic-email-sync-after-user-message"
    )

    private static let accountID = "gmail-web"
    private static let defaultURL = URL(string: "https://mail.google.com/mail/u/0/#inbox")!
    private static let interval: TimeInterval = 5 * 60
    nonisolated static let userMessageSyncMinimumInterval: TimeInterval = 5 * 60
    private static let userMessageSyncThrottleDefaultsKey =
        "arbol.willo.gmail-sync-all.last-started-at-v1"
    private static let pendingUserMessageSyncDefaultsKey =
        "arbol.willo.gmail-sync-all.pending-user-message-at-v1"
    private static let maximumMessages = 2000
    // Emergency safety stop after Google temporarily locked the account for
    // unusual activity. Re-enabling Gmail requires a reviewed source change;
    // there is intentionally no renderer or UserDefaults bypass.
    static let gmailAccessIsSuspended = false
    // Even after the incident suspension is reviewed, the former hidden Sync,
    // Force recheck, diagnostics, and scripted-navigation paths stay disabled.
    // Only the visible, user-mediated capture surface may be enabled.
    static let legacyAutomatedGmailAccessIsDisabled = true
    private static let gmailAccessSuspendedError =
        "Gmail capture is unavailable because its account-safety gate is closed."
    // The previous detector inspected all mailbox text and treated phrases in
    // email content (for example “try again later”) as provider challenges. This
    // reviewed classifier correction clears that false-positive circuit once;
    // the immutable ID cannot clear a later, genuinely detected challenge.
    private static let reviewedRecoveryID = "2026-07-29-provider-challenge-classifier-v2"
    private static let legacyAutomationDisabledError =
        "Hidden or automated Gmail access is permanently disabled. Use Synchronise Emails and the visible Gmail capture window."
    private static let userSelectionMessageHandler = "arbolGmailUserSelection"

    private var store: WKWebsiteDataStore!
    private var scraper: WKWebView?
    private var fullMessageScraper: WKWebView?
    private struct DetailNavigationContext {
        let attemptID: String
        let trigger: String
        let surfaceMessageID: String
        let routeAttempt: Int
        let commandID: String
        let startedAt: TimeInterval
        var documentGeneration: Int
        var requestedNavigationID: ObjectIdentifier?
        var requestedDocumentGeneration: Int
        var requestedNavigationCommitted: Bool
    }

    private var detailNavigationContexts: [ObjectIdentifier: DetailNavigationContext] = [:]
    private var detailInFlight = false
    private let experimentSafety = GmailExperimentSafetyCoordinator()
    private var printCaptureParents = Set<ObjectIdentifier>()
    private var printCapturePopups: [ObjectIdentifier: WKWebView] = [:]
    private var loginWindow: NSWindow?
    private weak var userMediatedSplitView: NSSplitView?
    private var userMediatedSplitHasInitialPosition = false
    private weak var userMediatedWebView: WKWebView?
    private weak var userMediatedStatusLabel: NSTextField?
    private weak var captureConversationButton: NSButton?
    private weak var selectAllDiscoveriesButton: NSButton?
    private weak var syncSelectedButton: NSButton?
    private weak var discoverySummaryLabel: NSTextField?
    private weak var discoveryStackView: NSStackView?
    private var userMediatedDiscoveredMessages: [String: [String: Any]] = [:]
    private var userMediatedDiscoveryOrder: [String] = []
    private var userMediatedSelectedDiscoveryIDs = Set<String>()
    private var userMediatedSyncedDiscoveryIDs = Set<String>()
    // Ignore Rules remove a selected Surface row from Core. Remember that
    // result for the lifetime of the visible Gmail window so the same mailbox
    // row is not immediately offered as an “unsynchronised” retry.
    private var userMediatedIgnoredDiscoveryIDs = Set<String>()
    private var userMediatedAccount: [String: Any] = [:]
    private var userMediatedBatchInFlight = false
    private var automaticSyncRequested = false
    private var automaticSyncBatchStarted = false
    // Sync All must wait for Core's durable incomplete queue as well as the
    // currently visible Gmail page. Otherwise only page one is selectable.
    private var automaticDurableCandidatesLoaded = false
    private var automaticSyncRunID = ""
    static let maximumSelectedThreadMessageCount = 50
    private var userMediatedListPageRevision = 0
    private var userMediatedListRoute = ""
    private var automaticListCaptureScheduledKey = ""
    private var pendingAutomaticListPageRevision = 0
    private var pendingAutomaticListRoute = ""
    private var userSelectedSurfaceMessageID = ""
    private var userSelectedConversationRoute = ""
    private var userMediatedSelectionRevision = 0
    private var automaticCaptureScheduledRevision = 0
    private var pendingAutomaticCaptureRevision = 0
    private var pendingAutomaticCaptureRoute = ""
    private var userMediatedCaptureInFlight = false
    private var userMediatedCaptureRevision = 0
    private var syncInFlight = false
    private var lastSuccessfulSync: Date?
    private var syncProgress: [String: Any] = ["running": false, "phase": "idle", "current": 0, "total": 0]

    /// Notify the Willo renderer only after Core has accepted a synchronized
    /// Email Surface or Source change. The visible Gmail window and Willo's Emails page
    /// live in the same app process, so this is an immediate dirty signal; the
    /// renderer still re-reads Core's authoritative snapshot rather than
    /// treating notification payload as email state.
    private func publishEmailSnapshotChange() {
        userMediatedCaptureRevision += 1
        NotificationCenter.default.post(
            name: Self.emailSnapshotDidChangeNotification,
            object: self,
            userInfo: ["revision": userMediatedCaptureRevision]
        )
    }

    private func publishEmailSyncProgressChange() {
        NotificationCenter.default.post(
            name: Self.emailSyncProgressDidChangeNotification,
            object: self
        )
    }

    private override init() {
        super.init()
        if #available(macOS 14.0, *) {
            store = WKWebsiteDataStore(forIdentifier: Self.stableUUID())
        } else {
            store = .default()
        }
        // Apply the explicitly reviewed account recovery exactly once. A later
        // provider challenge remains durable because the same recovery ID is a
        // no-op on every subsequent launch.
        experimentSafety.applyReviewedRecovery(id: Self.reviewedRecoveryID)
        // Gmail access must never start from a timer. All access remains
        // explicitly user initiated through one visible window.
    }

    private static func stableUUID() -> UUID {
        // Gmail gets its own data store so a session from the abandoned Outlook
        // implementation cannot affect login detection or cookie persistence.
        let digest = Array(SHA256.hash(data: Data("arbol-willo-gmail-web-mail".utf8)))
        let bytes: uuid_t = (digest[0], digest[1], digest[2], digest[3], digest[4], digest[5], digest[6], digest[7],
                             digest[8], digest[9], digest[10], digest[11], digest[12], digest[13], digest[14], digest[15])
        return UUID(uuid: bytes)
    }

    private func webView() -> WKWebView {
        if let scraper { return scraper }
        let view = makeScraperWebView()
        scraper = view
        return view
    }

    private func detailWebView() -> WKWebView {
        // A Gmail hash load in a reused WKWebView can be a same-document SPA
        // transition and emit no WKNavigation commit. It also leaves the prior
        // conversation DOM available. Give every acquisition its own view while
        // retaining the shared authenticated website data store.
        makeScraperWebView()
    }

    private func fullMessageWebView() -> WKWebView {
        if let fullMessageScraper { return fullMessageScraper }
        let view = makeScraperWebView()
        fullMessageScraper = view
        return view
    }

    private func makeScraperWebView() -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = store
        let view = WKWebView(frame: NSRect(x: 0, y: 0, width: 1440, height: 1000), configuration: configuration)
        view.uiDelegate = self
        view.navigationDelegate = self
        if #available(macOS 13.3, *) { view.isInspectable = true }
        return view
    }

    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                 for navigationAction: WKNavigationAction,
                 windowFeatures: WKWindowFeatures) -> WKWebView? {
        let parentKey = ObjectIdentifier(webView)
        if printCaptureParents.contains(parentKey) {
            guard let context = detailNavigationContexts[parentKey],
                  case .admitted = experimentSafety.consume(
                    .navigation, operationID: context.commandID
                  ) else {
                webView.stopLoading()
                return nil
            }
            // Gmail's printer-friendly conversation normally opens through
            // window.open. Capture that authenticated document in-process and
            // suppress the native print dialog at document start.
            configuration.websiteDataStore = store
            configuration.userContentController.addUserScript(WKUserScript(
                source: Self.suppressWindowPrintScript, injectionTime: .atDocumentStart,
                forMainFrameOnly: false
            ))
            let popup = WKWebView(
                frame: NSRect(x: 0, y: 0, width: 1440, height: 1000),
                configuration: configuration
            )
            popup.uiDelegate = self
            popup.navigationDelegate = self
            if #available(macOS 13.3, *) { popup.isInspectable = true }
            detailNavigationContexts[ObjectIdentifier(popup)] = context
            printCapturePopups[parentKey] = popup
            return popup
        }
        // Never turn a popup request into a native scripted navigation on the
        // visible capture surface. The user may navigate the main Gmail page;
        // unsupported popups fail closed instead of being followed by Willo.
        return nil
    }

    private func recordNavigationEvent(_ webView: WKWebView, navigation: WKNavigation?, event: String,
                                       error: Error? = nil) {
        let key = ObjectIdentifier(webView)
        guard var context = detailNavigationContexts[key] else { return }
        let navigationID = navigation.map { ObjectIdentifier($0) }
        let isRequestedNavigation = navigationID != nil && navigationID == context.requestedNavigationID
        if event == "committed" {
            context.documentGeneration += 1
            if Self.isGmailProviderChallengeURL(webView.url), !context.commandID.isEmpty {
                experimentSafety.recordProviderChallenge(operationID: context.commandID)
                webView.stopLoading()
            }
            if context.trigger == "print_view_dry" {
                if case .denied = experimentSafety.consume(
                    .navigation, operationID: context.commandID
                ) {
                    webView.stopLoading()
                }
            }
            // Gmail commonly cancels the requested hash navigation after its
            // first commit and completes the same load through a redirecting
            // WKNavigation. Once the requested token has committed, follow that
            // committed navigation chain. Each acquisition owns a fresh view, so
            // no prior conversation document can enter this chain.
            if isRequestedNavigation || context.requestedNavigationCommitted {
                context.requestedDocumentGeneration = context.documentGeneration
                context.requestedNavigationCommitted = true
            }
        }
        detailNavigationContexts[key] = context
        var fields = Self.gmailRouteTraceMetadata(webView.url?.absoluteString ?? "")
        fields["navigation_event"] = event
        fields["route_attempt"] = context.routeAttempt
        fields["document_generation"] = context.documentGeneration
        fields["requested_document_generation"] = context.requestedDocumentGeneration
        fields["requested_navigation_event"] = isRequestedNavigation
        fields["navigation_eligible"] = Self.gmailRequestedDocumentIsEligible(
            requestedNavigationCommitted: context.requestedNavigationCommitted,
            currentGeneration: context.documentGeneration,
            requestedGeneration: context.requestedDocumentGeneration
        )
        fields["elapsed_ms"] = Int(max(0, (ProcessInfo.processInfo.systemUptime - context.startedAt) * 1_000))
        if !context.commandID.isEmpty { fields["command_id"] = context.commandID }
        if let error { fields.merge(Self.gmailAcquisitionErrorFields(error, stage: "navigation")) { _, new in new } }
        Task { @MainActor [weak self] in
            await self?.recordAcquisitionTrace(
                attemptID: context.attemptID, trigger: context.trigger, stage: "navigation",
                surfaceMessageID: context.surfaceMessageID, fields: fields
            )
        }
    }

    private func stopUserMediatedCaptureForProviderChallenge(_ webView: WKWebView) {
        guard webView === userMediatedWebView else { return }
        experimentSafety.openProviderChallengeCircuit()
        webView.stopLoading()
        captureConversationButton?.isEnabled = false
        syncSelectedButton?.isEnabled = false
        userMediatedBatchInFlight = false
        pendingAutomaticCaptureRevision = 0
        pendingAutomaticCaptureRoute = ""
        userMediatedStatusLabel?.stringValue =
            "Gmail reported a security or usage challenge. Capture stopped and is blocked pending reviewed recovery."
    }

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        if webView === userMediatedWebView {
            if Self.isGmailProviderChallengeURL(navigationAction.request.url) {
                stopUserMediatedCaptureForProviderChallenge(webView)
                decisionHandler(.cancel)
                return
            }
            // Do not synthesize or redirect this navigation. The visible page
            // owns normal SSO redirects and Gmail SPA transitions; Willo only
            // observes provider-challenge destinations here.
        }
        decisionHandler(.allow)
    }

    func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
        if webView === userMediatedWebView, Self.isGmailProviderChallengeURL(webView.url) {
            stopUserMediatedCaptureForProviderChallenge(webView)
            return
        }
        recordNavigationEvent(webView, navigation: navigation, event: "provisional_started")
    }

    func webView(_ webView: WKWebView, didReceiveServerRedirectForProvisionalNavigation navigation: WKNavigation!) {
        recordNavigationEvent(webView, navigation: navigation, event: "redirect")
    }

    func webView(_ webView: WKWebView, didCommit navigation: WKNavigation!) {
        if webView === userMediatedWebView, Self.isGmailProviderChallengeURL(webView.url) {
            stopUserMediatedCaptureForProviderChallenge(webView)
            return
        }
        recordNavigationEvent(webView, navigation: navigation, event: "committed")
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        recordNavigationEvent(webView, navigation: navigation, event: "finished")
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!,
                 withError error: Error) {
        recordNavigationEvent(webView, navigation: navigation, event: "provisional_failed", error: error)
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        recordNavigationEvent(webView, navigation: navigation, event: "navigation_failed", error: error)
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        recordNavigationEvent(webView, navigation: nil, event: "process_terminated")
    }

    func status() async -> [String: Any] {
        do {
            let remote = try await CoreClient.shared.call(method: "email.surface.overview", params: [
                "account_id": Self.accountID,
            ])
            var result: [String: Any] = ["ok": true]
            result.merge(remote) { _, new in new }
            result["logged_in"] = !Self.gmailAccessIsSuspended && loginWindow != nil
            result["gmail_access_suspended"] = Self.gmailAccessIsSuspended
            result["legacy_automation_disabled"] = Self.legacyAutomatedGmailAccessIsDisabled
            result["user_mediated_capture_available"] = !Self.gmailAccessIsSuspended
                && !(experimentSafety.status()["provider_challenge_detected"] as? Bool ?? false)
            result["user_mediated_window_open"] = loginWindow != nil
            result["user_mediated_capture_revision"] = userMediatedCaptureRevision
            result["user_mediated_discovered_count"] = userMediatedDiscoveryOrder.count
            result["user_mediated_selected_count"] = userMediatedSelectedDiscoveryIDs.count
            result["user_mediated_batch_running"] = userMediatedBatchInFlight
            result["automatic_sync_running"] = automaticSyncRequested
            result["gmail_experiment_safety"] = experimentSafety.status()
            result["provider"] = "gmail-web"
            return result
        } catch {
            return ["ok": false, "error": "Could not read synchronized Gmail status: \(error)"]
        }
    }

    func login() -> [String: Any] {
        ["ok": false, "error": Self.legacyAutomationDisabledError]
    }

    static func defaultAuxiliaryPanelDividerPosition(
        totalWidth: CGFloat, dividerThickness: CGFloat
    ) -> CGFloat {
        max(0, (totalWidth - max(0, dividerThickness)) / 2)
    }

    static func automaticSyncWindowOrigin(
        windowFrame: NSRect, screenFrames: [NSRect]
    ) -> NSPoint {
        let desktop = screenFrames.reduce(NSRect.null) { $0.union($1) }
        let leftEdge = desktop.isNull ? 0 : desktop.minX
        let bottomEdge = desktop.isNull ? 0 : desktop.minY
        return NSPoint(
            x: leftEdge - windowFrame.width - 100,
            y: bottomEdge - windowFrame.height - 100
        )
    }

    private static func orderAutomaticSyncWindowOffscreen(_ window: NSWindow) {
        // A 10×10 window would make Gmail switch to a different responsive DOM,
        // breaking the same observer that automatic Sync All needs. Preserve the
        // normal layout while making the ordered-in WebKit host imperceptible.
        window.alphaValue = 0
        window.hasShadow = false
        window.ignoresMouseEvents = true
        window.collectionBehavior.insert([.transient, .ignoresCycle])
        let origin = automaticSyncWindowOrigin(
            windowFrame: window.frame, screenFrames: NSScreen.screens.map(\.frame)
        )
        window.setFrameOrigin(origin)
        window.orderFront(nil)
        // AppKit may constrain a newly ordered window back toward a display.
        // Reassert the off-screen frame after ordering; alpha=0 prevents a flash.
        window.setFrameOrigin(origin)
    }

    private static func restoreUserMediatedWindowPresentation(_ window: NSWindow) {
        window.alphaValue = 1
        window.hasShadow = true
        window.ignoresMouseEvents = false
        window.collectionBehavior.remove([.transient, .ignoresCycle])
    }

    /// Open the only supported Gmail surface: one visible, user-operated window.
    /// Native code performs one initial inbox navigation. Every later Gmail
    /// navigation must result from a trusted user action inside this window.
    func openUserMediatedCapture(hidden: Bool = false) -> [String: Any] {
        guard !Self.gmailAccessIsSuspended else {
            return ["ok": false, "access_suspended": true, "error": Self.gmailAccessSuspendedError]
        }
        let safety = experimentSafety.status()
        guard safety["provider_challenge_detected"] as? Bool != true else {
            return ["ok": false, "error": "Gmail capture is blocked because a provider challenge was detected. A reviewed recovery is required."]
        }
        if let loginWindow {
            if hidden {
                // WKWebView suspends page loading and injected scripts when its
                // containing window is ordered out. Sync All relies on the Gmail
                // list observer, so keep the window ordered in while placing it
                // outside the visible desktop instead of hiding it.
                Self.orderAutomaticSyncWindowOffscreen(loginWindow)
            } else {
                Self.restoreUserMediatedWindowPresentation(loginWindow)
                loginWindow.center()
                loginWindow.makeKeyAndOrderFront(nil)
                NSApp.activate(ignoringOtherApps: true)
            }
            return ["ok": true, "opened": true, "existing_window": true]
        }

        let controller = WKUserContentController()
        controller.add(self, name: Self.userSelectionMessageHandler)
        controller.addUserScript(WKUserScript(
            source: Self.trustedInboxSelectionObserverScript,
            injectionTime: .atDocumentStart,
            forMainFrameOnly: true
        ))
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = store
        configuration.userContentController = controller
        let view = WKWebView(frame: NSRect(x: 0, y: 0, width: 1180, height: 760), configuration: configuration)
        view.uiDelegate = self
        view.navigationDelegate = self
        if #available(macOS 13.3, *) { view.isInspectable = true }

        let statusLabel = NSTextField(labelWithString: "Navigate Gmail manually. Each stable list page is saved and added to the supervised queue; no pagination is performed.")
        statusLabel.lineBreakMode = .byTruncatingTail
        statusLabel.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        let conversationButton = NSButton(title: "Capture again after manual expansion", target: self, action: #selector(captureCurrentConversationPressed(_:)))
        conversationButton.bezelStyle = .rounded
        conversationButton.isEnabled = false
        let closeButton = NSButton(title: "Close", target: self, action: #selector(closeUserMediatedCapturePressed(_:)))
        closeButton.bezelStyle = .rounded

        let controls = NSStackView(views: [statusLabel, conversationButton, closeButton])
        controls.orientation = .horizontal
        controls.alignment = .centerY
        controls.spacing = 10
        controls.edgeInsets = NSEdgeInsets(top: 8, left: 10, bottom: 8, right: 10)
        controls.translatesAutoresizingMaskIntoConstraints = false

        let queueTitle = NSTextField(labelWithString: "Email threads")
        queueTitle.font = .boldSystemFont(ofSize: 17)
        let queueHelp = NSTextField(wrappingLabelWithString: "Browse Gmail manually. New and partial threads on every page you visit are saved for the next Sync All. Already parsed threads are disabled. Select any number of threads; each selected thread is expanded and captured up to a hard limit of 50 emails.")
        queueHelp.textColor = .secondaryLabelColor
        queueHelp.font = .systemFont(ofSize: 13)
        let queueSummary = NSTextField(labelWithString: "No email rows discovered yet")
        queueSummary.textColor = .secondaryLabelColor
        queueSummary.font = .monospacedSystemFont(ofSize: 11, weight: .regular)
        let queueStack = NSStackView()
        queueStack.orientation = .vertical
        queueStack.alignment = .leading
        queueStack.spacing = 8
        queueStack.edgeInsets = NSEdgeInsets(top: 10, left: 10, bottom: 10, right: 10)
        queueStack.translatesAutoresizingMaskIntoConstraints = false
        let queueDocument = NSView()
        queueDocument.translatesAutoresizingMaskIntoConstraints = false
        queueDocument.addSubview(queueStack)
        NSLayoutConstraint.activate([
            queueStack.leadingAnchor.constraint(equalTo: queueDocument.leadingAnchor),
            queueStack.trailingAnchor.constraint(equalTo: queueDocument.trailingAnchor),
            queueStack.topAnchor.constraint(equalTo: queueDocument.topAnchor),
            queueStack.bottomAnchor.constraint(equalTo: queueDocument.bottomAnchor),
        ])
        let queueScroll = NSScrollView()
        queueScroll.hasVerticalScroller = true
        queueScroll.autohidesScrollers = true
        queueScroll.borderType = .bezelBorder
        queueScroll.documentView = queueDocument
        queueScroll.translatesAutoresizingMaskIntoConstraints = false
        let selectAll = NSButton(title: "Select All", target: self, action: #selector(selectAllDiscoveriesPressed(_:)))
        selectAll.bezelStyle = .rounded
        selectAll.isEnabled = false
        let syncSelected = NSButton(title: "Sync selected", target: self, action: #selector(syncSelectedDiscoveriesPressed(_:)))
        syncSelected.bezelStyle = .rounded
        syncSelected.isEnabled = false
        let queueActions = NSStackView(views: [selectAll, syncSelected])
        queueActions.orientation = .horizontal
        queueActions.alignment = .centerY
        queueActions.distribution = .fillEqually
        queueActions.spacing = 8
        let queuePanel = NSView()
        queuePanel.translatesAutoresizingMaskIntoConstraints = false
        for child in [queueTitle, queueHelp, queueSummary, queueScroll, queueActions] {
            child.translatesAutoresizingMaskIntoConstraints = false
            queuePanel.addSubview(child)
        }
        NSLayoutConstraint.activate([
            queueTitle.leadingAnchor.constraint(equalTo: queuePanel.leadingAnchor, constant: 12),
            queueTitle.trailingAnchor.constraint(equalTo: queuePanel.trailingAnchor, constant: -12),
            queueTitle.topAnchor.constraint(equalTo: queuePanel.topAnchor, constant: 12),
            queueHelp.leadingAnchor.constraint(equalTo: queueTitle.leadingAnchor),
            queueHelp.trailingAnchor.constraint(equalTo: queueTitle.trailingAnchor),
            queueHelp.topAnchor.constraint(equalTo: queueTitle.bottomAnchor, constant: 6),
            queueSummary.leadingAnchor.constraint(equalTo: queueTitle.leadingAnchor),
            queueSummary.trailingAnchor.constraint(equalTo: queueTitle.trailingAnchor),
            queueSummary.topAnchor.constraint(equalTo: queueHelp.bottomAnchor, constant: 8),
            queueScroll.leadingAnchor.constraint(equalTo: queuePanel.leadingAnchor, constant: 8),
            queueScroll.trailingAnchor.constraint(equalTo: queuePanel.trailingAnchor, constant: -8),
            queueScroll.topAnchor.constraint(equalTo: queueSummary.bottomAnchor, constant: 8),
            queueScroll.bottomAnchor.constraint(equalTo: queueActions.topAnchor, constant: -8),
            queueActions.leadingAnchor.constraint(equalTo: queuePanel.leadingAnchor, constant: 12),
            queueActions.trailingAnchor.constraint(equalTo: queuePanel.trailingAnchor, constant: -12),
            queueActions.bottomAnchor.constraint(equalTo: queuePanel.bottomAnchor, constant: -12),
            queueActions.heightAnchor.constraint(greaterThanOrEqualToConstant: 30),
            queueDocument.widthAnchor.constraint(equalTo: queueScroll.contentView.widthAnchor),
        ])

        let splitView = NSSplitView()
        splitView.isVertical = true
        // NSSplitView owns its panes' frames. Do not put Auto Layout width
        // constraints on arranged subviews: those constraints fight the divider
        // during a mouse drag and can pin the auxiliary pane near its intrinsic
        // content width. Minimum widths are enforced by the split-view delegate.
        splitView.dividerStyle = .paneSplitter
        splitView.delegate = self
        splitView.translatesAutoresizingMaskIntoConstraints = false
        view.translatesAutoresizingMaskIntoConstraints = true
        queuePanel.translatesAutoresizingMaskIntoConstraints = true
        splitView.addArrangedSubview(view)
        splitView.addArrangedSubview(queuePanel)

        let container = NSView(frame: NSRect(x: 0, y: 0, width: 1740, height: 900))
        container.addSubview(splitView)
        container.addSubview(controls)
        NSLayoutConstraint.activate([
            controls.leadingAnchor.constraint(equalTo: container.leadingAnchor),
            controls.trailingAnchor.constraint(equalTo: container.trailingAnchor),
            controls.bottomAnchor.constraint(equalTo: container.bottomAnchor),
            controls.heightAnchor.constraint(greaterThanOrEqualToConstant: 46),
            splitView.leadingAnchor.constraint(equalTo: container.leadingAnchor),
            splitView.trailingAnchor.constraint(equalTo: container.trailingAnchor),
            splitView.topAnchor.constraint(equalTo: container.topAnchor),
            splitView.bottomAnchor.constraint(equalTo: controls.topAnchor),
        ])

        let window = NSWindow(contentRect: container.frame,
                              styleMask: [.titled, .closable, .miniaturizable, .resizable],
                              backing: .buffered, defer: false)
        window.title = "Gmail — Supervised email synchronisation — Willo Station"
        window.contentView = container
        window.minSize = NSSize(width: 760, height: 520)
        container.layoutSubtreeIfNeeded()
        window.center()
        Self.configureUserMediatedWindowLifetime(window)
        window.delegate = self
        loginWindow = window
        userMediatedSplitView = splitView
        userMediatedSplitHasInitialPosition = false
        userMediatedWebView = view
        userMediatedStatusLabel = statusLabel
        captureConversationButton = conversationButton
        selectAllDiscoveriesButton = selectAll
        syncSelectedButton = syncSelected
        discoverySummaryLabel = queueSummary
        discoveryStackView = queueStack
        userMediatedDiscoveredMessages = [:]
        userMediatedDiscoveryOrder = []
        userMediatedSelectedDiscoveryIDs = []
        userMediatedSyncedDiscoveryIDs = []
        userMediatedIgnoredDiscoveryIDs = []
        userMediatedAccount = [:]
        userMediatedBatchInFlight = false
        userMediatedListPageRevision = 0
        userMediatedListRoute = ""
        automaticListCaptureScheduledKey = ""
        pendingAutomaticListPageRevision = 0
        pendingAutomaticListRoute = ""
        userSelectedSurfaceMessageID = ""
        userSelectedConversationRoute = ""
        userMediatedSelectionRevision = 0
        automaticCaptureScheduledRevision = 0
        pendingAutomaticCaptureRevision = 0
        pendingAutomaticCaptureRoute = ""
        userMediatedCaptureInFlight = false
        if hidden {
            // Ordering the window out makes WebKit suspend Gmail before the
            // injected list observer can report `list_bound`. Keep the fully
            // sized window ordered in but outside the visible desktop instead.
            Self.orderAutomaticSyncWindowOffscreen(window)
        } else {
            window.makeKeyAndOrderFront(nil)
            NSApp.activate(ignoringOtherApps: true)
        }
        // Positioning is finalized from windowDidBecomeKey, after AppKit has
        // completed the visible window's first layout. The one-shot guard means
        // later key-window changes and layouts never undo a mouse drag.
        applyInitialUserMediatedSplitPositionIfNeeded()
        // Exactly one native navigation is allowed: opening the visible inbox.
        // Authentication and every later route transition are user-controlled.
        view.load(URLRequest(url: mailboxURL()))
        return ["ok": true, "opened": true, "existing_window": false]
    }

    /// Successful RPCs that submit user-authored chat content. Keep this
    /// recognition native so legacy and atomic Turn surfaces share one email-sync
    /// policy. Creating an empty Chat Session is intentionally not a message;
    /// its first `chat_session.send` triggers synchronization instead.
    nonisolated static func coreRequestSubmitsUserMessage(
        method: String, params _: [String: Any]
    ) -> Bool {
        method == "chat_session.send"
            || method == "turn.submit"
            || method == "chat_session.edit_turn"
    }

    /// Pure admission rule used by the durable five-minute throttle.
    nonisolated static func userMessageAutomaticSyncAdmission(
        lastStartedAt: Date?, now: Date = Date(),
        minimumInterval: TimeInterval = userMessageSyncMinimumInterval
    ) -> (allowed: Bool, retryAfterSeconds: Int) {
        guard let lastStartedAt else { return (true, 0) }
        let remaining = minimumInterval - now.timeIntervalSince(lastStartedAt)
        guard remaining > 0 else { return (true, 0) }
        return (false, max(1, Int(ceil(remaining))))
    }

    private static var sharedAutomationDefaults: UserDefaults {
        UserDefaults(suiteName: "group.arbol") ?? .standard
    }

    private func lastSyncAllStartedAt() -> Date? {
        // Older builds wrote into the bundle-specific domain of whichever UI
        // submitted the message. Prefer the process-independent app-group value,
        // but retain the local value as a one-release migration fallback.
        let sharedValue = Self.sharedAutomationDefaults.double(
            forKey: Self.userMessageSyncThrottleDefaultsKey
        )
        let localValue = UserDefaults.standard.double(
            forKey: Self.userMessageSyncThrottleDefaultsKey
        )
        let value = max(sharedValue, localValue)
        return value > 0 ? Date(timeIntervalSince1970: value) : nil
    }

    private func recordSyncAllStarted(at date: Date) {
        let value = date.timeIntervalSince1970
        Self.sharedAutomationDefaults.set(value, forKey: Self.userMessageSyncThrottleDefaultsKey)
        UserDefaults.standard.set(value, forKey: Self.userMessageSyncThrottleDefaultsKey)
    }

    /// Chat messages are normally submitted by Elma, while the authenticated
    /// Gmail view and Station progress indicator are owned by Willo. Persist the
    /// request before broadcasting it so a temporarily closed Willo can consume
    /// it at its next launch instead of running a second, invisible WebMailBridge
    /// inside the Elma process.
    /// Requests the same throttled automatic Gmail synchronization after a
    /// user-initiated Chat Session open. Empty IDs represent closing a session
    /// and therefore must not start synchronization.
    nonisolated static func activeChatSessionChangeRequestsAutomaticEmailSync(
        _ sessionID: String
    ) -> Bool {
        !sessionID.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    static func requestAutomaticSyncAfterUserMessage() {
        Task { @MainActor in
            guard await emailsFeatureEnabled() else { return }
            postAutomaticSyncAfterUserMessage()
        }
    }

    private static func postAutomaticSyncAfterUserMessage() {
        if ARBOL_UI_KEY == "willo" {
            _ = shared.synchroniseAllUnfetchedAfterUserMessage()
            return
        }
        sharedAutomationDefaults.set(
            Date().timeIntervalSince1970,
            forKey: pendingUserMessageSyncDefaultsKey
        )
        sharedAutomationDefaults.synchronize()
        DistributedNotificationCenter.default().postNotificationName(
            automaticSyncAfterUserMessageRequestNotification,
            object: nil,
            userInfo: nil,
            deliverImmediately: true
        )
    }

    /// Called only by the Willo process, from its distributed-notification
    /// listener and launch recovery path.
    func consumePendingAutomaticSyncAfterUserMessage() -> [String: Any] {
        Self.sharedAutomationDefaults.removeObject(forKey: Self.pendingUserMessageSyncDefaultsKey)
        Task { @MainActor [weak self] in
            guard let self, await self.refreshFeatureStatus() else { return }
            _ = self.synchroniseAllUnfetchedAfterUserMessage()
        }
        return ["ok": true, "started": false]
    }

    static func hasPendingAutomaticSyncAfterUserMessage() -> Bool {
        sharedAutomationDefaults.double(forKey: pendingUserMessageSyncDefaultsKey) > 0
    }

    /// One-click counterpart to the supervised controls. It intentionally uses
    /// the same visible-window DOM, classifier, Select All eligibility, and
    /// selected-batch capture code; only a newly-created native window is hidden.
    func synchroniseAllUnfetched() -> [String: Any] {
        startSynchroniseAllUnfetched(triggeredByUserMessage: false)
    }

    /// Fire-and-forget entry point used after Core accepts any user message. A
    /// durable timestamp coalesces message bursts across every Arbol renderer and
    /// across application relaunches.
    func synchroniseAllUnfetchedAfterUserMessage() -> [String: Any] {
        startSynchroniseAllUnfetched(triggeredByUserMessage: true)
    }

    private func startSynchroniseAllUnfetched(
        triggeredByUserMessage: Bool
    ) -> [String: Any] {
        if automaticSyncRequested || userMediatedBatchInFlight {
            if triggeredByUserMessage {
                return ["ok": true, "started": false, "reason": "already_syncing"]
            }
            return ["ok": false, "error": "Email synchronization is already in progress"]
        }
        let now = Date()
        if triggeredByUserMessage {
            let admission = Self.userMessageAutomaticSyncAdmission(
                lastStartedAt: lastSyncAllStartedAt(), now: now
            )
            guard admission.allowed else {
                return [
                    "ok": true, "started": false, "reason": "recently_synchronized",
                    "retry_after_seconds": admission.retryAfterSeconds,
                ]
            }
        }

        // Never make an already-visible supervised Gmail window disappear. A
        // normal one-click/Chat-Session run still creates its window off-screen.
        let shouldHideWindow = !(loginWindow?.isVisible ?? false)
        let opened = openUserMediatedCapture(hidden: shouldHideWindow)
        guard opened["ok"] as? Bool == true else { return opened }
        automaticSyncRequested = true
        automaticSyncBatchStarted = false
        automaticDurableCandidatesLoaded = false
        automaticSyncRunID = UUID().uuidString.lowercased()
        recordSyncAllStarted(at: now)
        setAutomaticSyncProgress(phase: "loading_inbox", message: "Opening Gmail and loading saved incomplete threads…")
        let runID = automaticSyncRunID
        Task { @MainActor [weak self] in
            await self?.beginAutomaticSync(runID: runID)
        }
        // An already-open supervised window may already have a classified list.
        if userMediatedListPageRevision > 0 { maybeStartAutomaticSyncAfterDiscovery() }
        return ["ok": true, "started": true, "run_id": automaticSyncRunID]
    }

    private func setAutomaticSyncProgress(
        phase: String, message: String, current: Int = 0, total: Int = 0,
        complete: Int = 0, partial: Int = 0, failed: Int = 0, ignored: Int = 0
    ) {
        syncProgress = [
            "running": automaticSyncRequested, "phase": phase,
            "current": current, "total": total, "message": message,
            "complete": complete, "partial": partial, "failed": failed,
            "ignored": ignored, "run_id": automaticSyncRunID,
        ]
        publishEmailSyncProgressChange()
    }

    /// Convert Core's durable acquisition record back into the bounded queue
    /// shape consumed by the selected-thread capture loop. These rows may have
    /// been discovered on page two (or later) in an earlier supervised session.
    static func automaticDiscoveryFromDurableCandidate(_ candidate: [String: Any]) -> [String: Any]? {
        guard let id = candidate["surface_message_id"] as? String,
              isSafeSurfaceMessageID(id),
              let rawURL = candidate["remote_url"] as? String,
              let url = URL(string: rawURL), gmailConversationID(from: url) != nil else { return nil }
        let conversationID = gmailConversationID(from: url) ?? ""
        return [
            "id": id,
            "message_id": conversationID.isEmpty ? id : conversationID,
            // Keep the canonical provider-message identity separate from the
            // persisted Gmail route suffix. Legacy #inbox URLs can contain a
            // message ID or conversation alias, neither of which is guaranteed
            // to be the current thread route used for recovery.
            "provider_message_id": gmailProviderMessageID(from: candidate),
            "conversation_id": conversationID,
            "mailbox": "Inbox",
            "sender": candidate["sender"] as? String ?? "",
            "subject": candidate["subject"] as? String ?? "",
            "preview": "",
            "body": "",
            "body_truncated": true,
            "date_received": candidate["date_received"] ?? 0,
            "date_sent": candidate["date_received"] ?? 0,
            "is_read": true,
            "is_flagged": false,
            "has_attachments": false,
            "message_size": 0,
            "reply_to": "",
            "to": [], "cc": [], "bcc": [], "attachments": [],
            "remote_url": rawURL,
            "thread_message_count_hint": max(1, bridgeInt(candidate["thread_message_count_hint"], default: 1)),
            "persisted_content_state": "partial",
            // Avoid rewriting an already durable Surface/preview before capture.
            "durable_acquisition_candidate": true,
        ]
    }

    private func beginAutomaticSync(runID: String) async {
        guard await refreshFeatureStatus() else { return }
        guard automaticSyncRequested, automaticSyncRunID == runID else { return }
        do {
            _ = try await CoreClient.shared.call(method: "email.surface.sync.started", params: [
                "account_id": Self.accountID,
            ])
        } catch {
            guard automaticSyncRequested, automaticSyncRunID == runID else { return }
            finishAutomaticSync(
                complete: 0, partial: 0, failed: 1, ignored: 0,
                message: "Could not start email synchronization."
            )
            return
        }
        guard automaticSyncRequested, automaticSyncRunID == runID else { return }
        Task { @MainActor [weak self] in
            try? await Task.sleep(nanoseconds: 20_000_000_000)
            guard let self, self.automaticSyncRequested,
                  !self.automaticSyncBatchStarted, self.automaticSyncRunID == runID else { return }
            self.finishAutomaticSync(
                complete: 0, partial: 0, failed: 1, ignored: 0,
                message: "Gmail did not expose an inbox list. Open Synchronise Emails once to check the session."
            )
        }
        await loadAutomaticDurableCandidates(runID: runID)
    }

    private func loadAutomaticDurableCandidates(runID: String) async {
        guard automaticSyncRequested, automaticSyncRunID == runID else { return }
        do {
            let result = try await CoreClient.shared.call(
                method: "email.surface.acquisition_candidates",
                params: ["account_id": Self.accountID, "limit": Self.maximumMessages]
            )
            guard automaticSyncRequested, automaticSyncRunID == runID else { return }
            let candidates = (result["candidates"] as? [[String: Any]] ?? []).compactMap {
                Self.automaticDiscoveryFromDurableCandidate($0)
            }
            _ = mergeUserMediatedDiscoveries(candidates)
            automaticDurableCandidatesLoaded = true
            setAutomaticSyncProgress(
                phase: "discovering",
                message: candidates.isEmpty
                    ? "Checking the current Gmail page…"
                    : "Loaded \(candidates.count) saved incomplete thread\(candidates.count == 1 ? "" : "s"); checking the current Gmail page…"
            )
            maybeStartAutomaticSyncAfterDiscovery()
        } catch {
            guard automaticSyncRequested, automaticSyncRunID == runID else { return }
            finishAutomaticSync(
                complete: 0, partial: 0, failed: 1, ignored: 0,
                message: "Could not load saved incomplete email threads."
            )
        }
    }

    private func maybeStartAutomaticSyncAfterDiscovery() {
        guard automaticSyncRequested, automaticDurableCandidatesLoaded,
              userMediatedListPageRevision > 0, !automaticSyncBatchStarted,
              !userMediatedCaptureInFlight, !userMediatedBatchInFlight else { return }
        let ids = userMediatedSelectableDiscoveryIDs()
        automaticSyncBatchStarted = true
        if ids.isEmpty {
            finishAutomaticSync(
                complete: 0, partial: 0, failed: 0, ignored: 0,
                message: "Inbox is up to date."
            )
            return
        }
        userMediatedSelectedDiscoveryIDs = Set(ids)
        userMediatedBatchInFlight = true
        setAutomaticSyncProgress(
            phase: "fetching", message: "Synchronising \(ids.count) email thread\(ids.count == 1 ? "" : "s")…",
            current: 0, total: ids.count
        )
        rebuildUserMediatedDiscoveryPanel()
        Task { @MainActor [weak self] in await self?.syncSelectedDiscoveries(ids) }
    }

    private func finishAutomaticSync(
        complete: Int, partial: Int, failed: Int, ignored: Int, message: String
    ) {
        guard automaticSyncRequested else { return }
        automaticSyncRequested = false
        let runID = automaticSyncRunID
        syncProgress = [
            "running": false, "phase": "finished", "current": complete + partial + failed + ignored,
            "total": complete + partial + failed + ignored, "message": message,
            "complete": complete, "partial": partial, "failed": failed,
            "ignored": ignored, "run_id": runID,
        ]
        publishEmailSyncProgressChange()
        let terminalMethod = failed > 0
            ? "email.surface.sync.failed" : "email.surface.sync.completed"
        var terminalParams: [String: Any] = ["account_id": Self.accountID]
        if failed > 0 {
            terminalParams["error"] = message
            terminalParams["needs_login"] = message.lowercased().contains("requires attention")
                || message.lowercased().contains("provider challenge")
        } else {
            terminalParams["message_count"] = complete + partial
        }
        let durableTerminalParams = terminalParams
        Task {
            _ = try? await CoreClient.shared.call(
                method: terminalMethod, params: durableTerminalParams
            )
        }
        loginWindow?.close()
    }

    func userContentController(_ userContentController: WKUserContentController,
                               didReceive message: WKScriptMessage) {
        guard message.name == Self.userSelectionMessageHandler,
              message.webView === userMediatedWebView,
              let body = message.body as? [String: Any] else { return }
        let stage = body["stage"] as? String ?? "candidate"
        // During the explicit selected batch, page transitions are owned by that
        // bounded operation. Ignore observer announcements from transitional
        // documents so passive page discovery cannot overlap batch extraction.
        if userMediatedBatchInFlight { return }
        if stage == "list_bound" {
            guard let rawRoute = body["route"] as? String,
                  let route = URL(string: rawRoute), let host = route.host?.lowercased(),
                  Self.allowedHost(host), !Self.isExplicitGoogleLoginURL(route),
                  !Self.isGmailProviderChallengeURL(route) else { return }
            let documentPageRevision = Self.bridgeInt(body["page_revision"])
            guard documentPageRevision > 0, documentPageRevision <= 1_000_000 else { return }
            let pageRevision = userMediatedListPageRevision + 1
            // Returning to a list invalidates any conversation result that is
            // still in flight. The page itself was opened in the one explicit,
            // visible user-mediated window; no synthetic Gmail action occurs.
            userMediatedSelectionRevision += 1
            userSelectedSurfaceMessageID = ""
            userSelectedConversationRoute = ""
            captureConversationButton?.isEnabled = false
            userMediatedListPageRevision = pageRevision
            userMediatedListRoute = route.absoluteString
            userMediatedStatusLabel?.stringValue =
                "Email list opened. Capturing the currently visible rows once…"
            scheduleAutomaticVisibleListCapture(
                pageRevision: pageRevision, route: route.absoluteString
            )
            return
        }
        guard body["trusted"] as? Bool == true,
              let surfaceID = body["surface_id"] as? String,
              Self.isSafeSurfaceMessageID(surfaceID) else { return }
        if stage == "candidate" {
            userMediatedSelectionRevision += 1
            userMediatedListRoute = ""
            userSelectedSurfaceMessageID = surfaceID
            userSelectedConversationRoute = ""
            automaticCaptureScheduledRevision = 0
            pendingAutomaticCaptureRevision = 0
            pendingAutomaticCaptureRoute = ""
            captureConversationButton?.isEnabled = false
            userMediatedStatusLabel?.stringValue = "Opening the conversation from your Gmail click…"
            return
        }
        guard stage == "route_bound", let rawRoute = body["route"] as? String,
              let route = URL(string: rawRoute), let host = route.host?.lowercased(),
              Self.allowedHost(host), !Self.isExplicitGoogleLoginURL(route),
              !Self.isGmailProviderChallengeURL(route),
              surfaceID == userSelectedSurfaceMessageID else { return }
        let selectionRevision = userMediatedSelectionRevision
        userSelectedConversationRoute = route.absoluteString
        captureConversationButton?.isEnabled = !userMediatedCaptureInFlight
        userMediatedStatusLabel?.stringValue =
            "Conversation opened by your Gmail click. Capturing its currently visible messages once…"
        scheduleAutomaticConversationCapture(
            selectionRevision: selectionRevision, route: route.absoluteString
        )
    }

    private func scheduleAutomaticVisibleListCapture(pageRevision: Int, route: String) {
        guard let view = userMediatedWebView,
              Self.shouldScheduleAutomaticVisibleListCapture(
                pageRevision: pageRevision, route: route,
                currentPageRevision: userMediatedListPageRevision,
                currentRoute: userMediatedListRoute,
                documentRoute: view.url?.absoluteString ?? "",
                scheduledKey: automaticListCaptureScheduledKey
              ) else { return }
        automaticListCaptureScheduledKey = "\(pageRevision)|\(route)"
        if userMediatedCaptureInFlight {
            pendingAutomaticListPageRevision = pageRevision
            pendingAutomaticListRoute = route
            return
        }
        Task { @MainActor [weak self] in
            await self?.captureVisibleListFromUserWindow(
                expectedPageRevision: pageRevision, expectedRoute: route
            )
        }
    }

    private func scheduleAutomaticConversationCapture(selectionRevision: Int, route: String) {
        guard Self.shouldScheduleAutomaticConversationCapture(
            selectionRevision: selectionRevision,
            currentSelectionRevision: userMediatedSelectionRevision,
            route: route,
            currentRoute: userSelectedConversationRoute,
            scheduledRevision: automaticCaptureScheduledRevision
        ) else { return }
        automaticCaptureScheduledRevision = selectionRevision
        if userMediatedCaptureInFlight {
            pendingAutomaticCaptureRevision = selectionRevision
            pendingAutomaticCaptureRoute = route
            return
        }
        Task { @MainActor [weak self] in
            await self?.captureCurrentConversationFromUserWindow(
                expectedSelectionRevision: selectionRevision, expectedRoute: route
            )
        }
    }

    private func mergeUserMediatedDiscoveries(_ messages: [[String: Any]]) -> Int {
        var added = 0
        for message in messages {
            guard let id = message["id"] as? String, Self.isSafeSurfaceMessageID(id),
                  (message["persisted_content_state"] as? String ?? "").lowercased() != "ignored",
                  !userMediatedIgnoredDiscoveryIDs.contains(id),
                  let rawURL = message["remote_url"] as? String,
                  let url = URL(string: rawURL), Self.gmailConversationID(from: url) != nil else { continue }
            if userMediatedDiscoveredMessages[id] == nil {
                userMediatedDiscoveryOrder.append(id)
                added += 1
            }
            userMediatedDiscoveredMessages[id] = message
        }
        rebuildUserMediatedDiscoveryPanel()
        return added
    }

    static func userMediatedDiscoveryTimeLabel(_ raw: Any?) -> String {
        let numeric: Double
        if let number = raw as? NSNumber { numeric = number.doubleValue }
        else if let string = raw as? String, let value = Double(string) { numeric = value }
        else { return "—" }
        let seconds = numeric > 100_000_000_000 ? numeric / 1_000 : numeric
        guard seconds > 0 else { return "—" }
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "MMM d, HH:mm"
        return formatter.string(from: Date(timeIntervalSince1970: seconds))
    }

    static func userMediatedThreadLabel(_ rawCount: Any?) -> String {
        let count = max(1, bridgeInt(rawCount, default: 1))
        return "Thread · \(count) \(count == 1 ? "email" : "emails")"
    }

    private func userMediatedSelectableDiscoveryIDs() -> [String] {
        userMediatedDiscoveryOrder.filter { id in
            guard let message = userMediatedDiscoveredMessages[id] else { return false }
            let persistedState = (message["persisted_content_state"] as? String ?? "").lowercased()
            return persistedState != "complete" && !userMediatedSyncedDiscoveryIDs.contains(id)
        }
    }


    static func userMediatedRetryDiscoveryIDs(
        _ requestedIDs: [String], discoveries: [String: [String: Any]],
        ignoredIDs: Set<String> = []
    ) -> [String] {
        requestedIDs.filter { id in
            guard !ignoredIDs.contains(id), let message = discoveries[id] else { return false }
            return (message["persisted_content_state"] as? String ?? "").lowercased() != "complete"
        }
    }

    private func removeIgnoredUserMediatedDiscovery(_ id: String) {
        userMediatedIgnoredDiscoveryIDs.insert(id)
        userMediatedDiscoveredMessages.removeValue(forKey: id)
        userMediatedDiscoveryOrder.removeAll { $0 == id }
        userMediatedSelectedDiscoveryIDs.remove(id)
        userMediatedSyncedDiscoveryIDs.remove(id)
    }

    /// Re-read Core before a retry and after a batch. Local success counters are
    /// informational only: the queue's enabled/disabled state must come from the
    /// durable Source artifacts. Without this reconciliation, a subsequent Gmail
    /// list observation could replace locally marked rows and offer the whole
    /// previous selection again.
    private func reconcileUserMediatedDiscoveryStatesFromCore() async {
        guard loginWindow != nil else { return }
        let visibleMessages = userMediatedDiscoveryOrder.compactMap {
            userMediatedDiscoveredMessages[$0]
        }
        guard let result = try? await CoreClient.shared.call(
            method: "email.surface.supervised.classify",
            params: ["account_id": Self.accountID, "messages": visibleMessages]
        ) else { return }
        let rows = result["states"] as? [[String: Any]] ?? []
        let states = Dictionary(uniqueKeysWithValues: rows.compactMap { row -> (String, String)? in
            guard let id = row["id"] as? String else { return nil }
            return (id, (row["state"] as? String ?? "preview").lowercased())
        })
        for id in userMediatedDiscoveryOrder {
            guard let state = states[id] else { continue }
            if state == "ignored" {
                userMediatedIgnoredDiscoveryIDs.insert(id)
                userMediatedSelectedDiscoveryIDs.remove(id)
                userMediatedSyncedDiscoveryIDs.remove(id)
            } else {
                userMediatedDiscoveredMessages[id]?["persisted_content_state"] = state
                if state == "complete" {
                    userMediatedSyncedDiscoveryIDs.insert(id)
                    userMediatedSelectedDiscoveryIDs.remove(id)
                } else {
                    userMediatedSyncedDiscoveryIDs.remove(id)
                }
            }
        }
        for id in userMediatedIgnoredDiscoveryIDs {
            userMediatedDiscoveredMessages.removeValue(forKey: id)
            userMediatedSelectedDiscoveryIDs.remove(id)
            userMediatedSyncedDiscoveryIDs.remove(id)
        }
        userMediatedDiscoveryOrder.removeAll { userMediatedIgnoredDiscoveryIDs.contains($0) }
    }

    private func rebuildUserMediatedDiscoveryPanel() {
        guard let stack = discoveryStackView else { return }
        stack.arrangedSubviews.forEach { view in
            stack.removeArrangedSubview(view)
            view.removeFromSuperview()
        }

        let timeHeader = NSTextField(labelWithString: "Time")
        let conversationHeader = NSTextField(labelWithString: "Email thread")
        let statusHeader = NSTextField(labelWithString: "Status")
        for label in [timeHeader, conversationHeader, statusHeader] {
            label.font = .boldSystemFont(ofSize: 11)
            label.textColor = .secondaryLabelColor
        }
        timeHeader.widthAnchor.constraint(equalToConstant: 108).isActive = true
        statusHeader.widthAnchor.constraint(equalToConstant: 72).isActive = true
        conversationHeader.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        let header = NSStackView(views: [timeHeader, conversationHeader, statusHeader])
        header.orientation = .horizontal
        header.alignment = .centerY
        header.spacing = 10
        stack.addArrangedSubview(header)
        header.widthAnchor.constraint(equalTo: stack.widthAnchor, constant: -20).isActive = true

        for id in userMediatedDiscoveryOrder {
            guard let message = userMediatedDiscoveredMessages[id] else { continue }
            let subject = (message["subject"] as? String ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
            let sender = (message["sender"] as? String ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
            let title = subject.isEmpty ? "(no subject)" : subject
            let persistedState = (message["persisted_content_state"] as? String ?? "").lowercased()
            let parsed = persistedState == "complete"
            let syncedThisWindow = userMediatedSyncedDiscoveryIDs.contains(id)

            let time = NSTextField(labelWithString: Self.userMediatedDiscoveryTimeLabel(message["date_received"]))
            time.font = .monospacedDigitSystemFont(ofSize: 11, weight: .regular)
            time.textColor = parsed ? .tertiaryLabelColor : .secondaryLabelColor
            time.widthAnchor.constraint(equalToConstant: 108).isActive = true

            let button = NSButton(checkboxWithTitle: title, target: self, action: #selector(discoverySelectionChanged(_:)))
            button.identifier = NSUserInterfaceItemIdentifier(id)
            button.toolTip = sender.isEmpty ? title : "\(sender) — \(title)"
            button.state = userMediatedSelectedDiscoveryIDs.contains(id) ? .on : .off
            button.isEnabled = !userMediatedBatchInFlight && !parsed && !syncedThisWindow
            button.lineBreakMode = .byTruncatingTail
            button.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)

            let threadLabel = NSTextField(labelWithString: Self.userMediatedThreadLabel(message["thread_message_count_hint"]))
            threadLabel.font = .systemFont(ofSize: 11, weight: .medium)
            threadLabel.textColor = parsed ? .tertiaryLabelColor : .secondaryLabelColor
            threadLabel.lineBreakMode = .byTruncatingTail
            let conversation = NSStackView(views: [button, threadLabel])
            conversation.orientation = .vertical
            conversation.alignment = .leading
            conversation.spacing = 2
            conversation.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)

            let status = NSTextField(labelWithString: parsed ? "Parsed" : (syncedThisWindow ? "Synced" : (persistedState == "partial" ? "Partial" : "New")))
            status.alignment = .right
            status.font = .systemFont(ofSize: 11, weight: parsed ? .medium : .regular)
            status.textColor = parsed ? .tertiaryLabelColor : (persistedState == "partial" ? .systemOrange : .secondaryLabelColor)
            status.widthAnchor.constraint(equalToConstant: 72).isActive = true

            let row = NSStackView(views: [time, conversation, status])
            row.orientation = .horizontal
            row.alignment = .centerY
            row.spacing = 10
            row.toolTip = button.toolTip
            stack.addArrangedSubview(row)
            row.widthAnchor.constraint(equalTo: stack.widthAnchor, constant: -20).isActive = true
            row.heightAnchor.constraint(greaterThanOrEqualToConstant: 42).isActive = true
        }
        let selected = userMediatedSelectedDiscoveryIDs.count
        let discovered = userMediatedDiscoveryOrder.count
        let parsed = userMediatedDiscoveryOrder.filter {
            (userMediatedDiscoveredMessages[$0]?["persisted_content_state"] as? String ?? "").lowercased() == "complete"
        }.count
        discoverySummaryLabel?.stringValue = discovered == 0
            ? "No email rows discovered yet"
            : "\(discovered) discovered · \(selected) selected · \(parsed) already parsed"
        let selectable = userMediatedSelectableDiscoveryIDs()
        selectAllDiscoveriesButton?.isEnabled = !userMediatedBatchInFlight
            && selectable.contains { !userMediatedSelectedDiscoveryIDs.contains($0) }
        syncSelectedButton?.title = selected > 0 ? "Sync selected (\(selected))" : "Sync selected"
        syncSelectedButton?.isEnabled = !userMediatedBatchInFlight && selected > 0
    }

    @objc private func selectAllDiscoveriesPressed(_ sender: NSButton) {
        guard !userMediatedBatchInFlight else { return }
        userMediatedSelectedDiscoveryIDs.formUnion(userMediatedSelectableDiscoveryIDs())
        rebuildUserMediatedDiscoveryPanel()
    }

    @objc private func discoverySelectionChanged(_ sender: NSButton) {
        guard !userMediatedBatchInFlight, let id = sender.identifier?.rawValue,
              userMediatedDiscoveredMessages[id] != nil else { return }
        if sender.state == .on {
            userMediatedSelectedDiscoveryIDs.insert(id)
        } else {
            userMediatedSelectedDiscoveryIDs.remove(id)
        }
        rebuildUserMediatedDiscoveryPanel()
    }

    @objc private func syncSelectedDiscoveriesPressed(_ sender: NSButton) {
        let ids = userMediatedDiscoveryOrder.filter { userMediatedSelectedDiscoveryIDs.contains($0) }
        guard !userMediatedBatchInFlight, !ids.isEmpty else { return }
        userMediatedBatchInFlight = true
        rebuildUserMediatedDiscoveryPanel()
        Task { @MainActor [weak self] in await self?.syncSelectedDiscoveries(ids) }
    }

    private func syncSelectedDiscoveries(_ ids: [String]) async {
        guard await refreshFeatureStatus() else { return }
        guard let view = userMediatedWebView, loginWindow != nil,
              !Self.gmailAccessIsSuspended,
              experimentSafety.status()["provider_challenge_detected"] as? Bool != true else {
            userMediatedBatchInFlight = false
            rebuildUserMediatedDiscoveryPanel()
            if automaticSyncRequested {
                finishAutomaticSync(
                    complete: 0, partial: 0, failed: 1, ignored: 0,
                    message: "Gmail is unavailable or requires attention."
                )
            }
            return
        }
        // Selection may have been made from a list observation racing the prior
        // batch's last native repaint. Verify every requested row against Core so
        // a retry can never reacquire conversations already durably complete.
        await reconcileUserMediatedDiscoveryStatesFromCore()
        let retryIDs = Self.userMediatedRetryDiscoveryIDs(
            ids, discoveries: userMediatedDiscoveredMessages,
            ignoredIDs: userMediatedIgnoredDiscoveryIDs
        )
        let alreadyComplete = ids.count - retryIDs.count
        var complete = 0
        var partial = 0
        var failed = 0
        var ignored = 0
        for (index, id) in retryIDs.enumerated() {
            guard await refreshFeatureStatus() else { break }
            guard loginWindow != nil, userMediatedWebView === view,
                  experimentSafety.status()["provider_challenge_detected"] as? Bool != true else { break }
            guard let message = userMediatedDiscoveredMessages[id],
                  let rawURL = message["remote_url"] as? String, let url = URL(string: rawURL),
                  Self.gmailConversationID(from: url) != nil else { failed += 1; continue }
            userMediatedStatusLabel?.stringValue =
                "Synchronising selected conversation \(index + 1) of \(retryIDs.count)…"
            if automaticSyncRequested {
                setAutomaticSyncProgress(
                    phase: "fetching",
                    message: "Synchronising conversation \(index + 1) of \(retryIDs.count)…",
                    current: index, total: retryIDs.count,
                    complete: complete, partial: partial, failed: failed, ignored: ignored
                )
            }
            do {
                var account = userMediatedAccount
                account["id"] = Self.accountID
                account["provider"] = "gmail-web"
                account["mailbox_url"] = view.url?.absoluteString ?? ""
                let surfaceResult = try await CoreClient.shared.call(
                    method: "email.surface.ingest", params: [
                        "account": account, "messages": [message],
                    ]
                )
                if Self.bridgeStrings(surfaceResult["ignored_ids"]).contains(id) {
                    removeIgnoredUserMediatedDiscovery(id)
                    ignored += 1
                    publishEmailSnapshotChange()
                    continue
                }
                // The Surface row is already durable at this boundary. Publish
                // now so a newly discovered email appears in Willo even if the
                // subsequent full-thread capture is partial or fails.
                publishEmailSnapshotChange()
                if Self.hasMailbox(message["sender"] as? String ?? "") {
                    var preview = message
                    preview["account_id"] = Self.accountID
                    preview["provider"] = "gmail-web"
                    preview["surface_message_id"] = id
                    preview["provider_thread_id"] = message["conversation_id"] ?? message["message_id"]
                    preview["provider_message_id"] = message["provider_message_id"] ?? message["message_id"] ?? id
                    preview["content_state"] = "preview"
                    preview["capture_method"] = "gmail_dom_user_selected_preview"
                    preview["capture_version"] = 1
                    preview["body_text"] = message["body"] ?? message["preview"] ?? ""
                    preview["body_html"] = ""
                    let previewResult = try await CoreClient.shared.call(
                        method: "email.source.ingest", params: ["captures": [preview]]
                    )
                    if Self.bridgeInt(previewResult["accepted"]) == 0,
                       Self.bridgeInt(previewResult["ignored"]) > 0 {
                            removeIgnoredUserMediatedDiscovery(id)
                        ignored += 1
                        publishEmailSnapshotChange()
                        continue
                    }
                }
            } catch {
                failed += 1
                continue
            }
            let attemptID = UUID().uuidString.lowercased()
            let priorRoute = view.url?.absoluteString ?? ""
            let priorThreadID = await selectedConversationThreadID(view)
            var captureURL = url
            var navigationFields = Self.gmailRouteTraceMetadata(url.absoluteString)
            navigationFields["route_attempt"] = 1
            navigationFields["recovered"] = false
            navigationFields["ingest_called"] = false
            await recordAcquisitionTrace(
                attemptID: attemptID, trigger: "user_selected_batch",
                stage: "supervised_navigation_started", surfaceMessageID: id,
                fields: navigationFields
            )
            view.load(URLRequest(url: captureURL))
            var observation = await waitForSelectedConversation(
                view, expectedURL: captureURL, priorRoute: priorRoute,
                priorThreadID: priorThreadID
            )

            // Gmail list rows do not always expose a conversation route. In
            // particular, older pages can persist #inbox/<message-id>; loading
            // that value changes the hash but never creates a thread owner, so
            // the batch used to time out and retry the same unusable route on
            // every Sync All. Recover once through an identity-checked Gmail
            // search, exactly as Force refetch already does, then bind capture
            // to the recovered provider thread owner.
            if !observation.ready,
               experimentSafety.status()["provider_challenge_detected"] as? Bool != true {
                // Recovery must run in the authenticated supervised view. Record
                // both boundaries: previously a failed search vanished between
                // route_attempt=1 and the terminal event, making live diagnosis
                // indistinguishable from recovery not running at all.
                await recordAcquisitionTrace(
                    attemptID: attemptID, trigger: "user_selected_batch",
                    stage: "route_recovery_started", surfaceMessageID: id,
                    fields: ["route_attempt": 1, "recovered": false,
                             "ingest_called": false]
                )
                let recoveredValue = await resolveCandidateURL(message, in: view)
                if let recoveredValue,
                   let recoveredURL = Self.selectedConversationRecoveryURL(
                        recoveredValue, replacing: captureURL
                   ) {
                    // Search recovery can finish by clicking a verified Gmail
                    // result. In that case the active view is already showing the
                    // recovered conversation. Do not bind the readiness baseline
                    // to that newly opened owner: doing so required the owner to
                    // change away from itself and made every click-based recovery
                    // time out on route_attempt=2. Keep the owner that existed
                    // before the original failed navigation as the stale-DOM
                    // boundary instead.
                    let recoveredDocumentThreadID = await selectedConversationThreadID(view)
                    let recoveredDocumentAlreadyOpen = Self.recoveredConversationDocumentIsAlreadyOpen(
                        currentURL: view.url, recoveredURL: recoveredURL,
                        currentThreadID: recoveredDocumentThreadID
                    )
                    let recoveryPriorRoute = recoveredDocumentAlreadyOpen
                        ? priorRoute : (view.url?.absoluteString ?? "")
                    let recoveryPriorThreadID = priorThreadID
                    captureURL = recoveredURL
                    var recoveryFields = Self.gmailRouteTraceMetadata(recoveredURL.absoluteString)
                    recoveryFields["route_attempt"] = 2
                    recoveryFields["recovered"] = true
                    recoveryFields["recovered_document_already_open"] = recoveredDocumentAlreadyOpen
                    recoveryFields["ingest_called"] = false
                    await recordAcquisitionTrace(
                        attemptID: attemptID, trigger: "user_selected_batch",
                        stage: "supervised_navigation_started", surfaceMessageID: id,
                        fields: recoveryFields
                    )
                    if !recoveredDocumentAlreadyOpen {
                        view.load(URLRequest(url: captureURL))
                    }
                    observation = await waitForSelectedConversation(
                        view, expectedURL: captureURL, priorRoute: recoveryPriorRoute,
                        priorThreadID: recoveryPriorThreadID,
                        allowNewThreadOwner: recoveryPriorThreadID.isEmpty
                    )
                } else {
                    await recordAcquisitionTrace(
                        attemptID: attemptID, trigger: "user_selected_batch",
                        stage: "route_recovery_observed", surfaceMessageID: id,
                        fields: ["outcome": "inconclusive", "route_attempt": 1,
                                 "recovered": false, "ingest_called": false,
                                 "terminal_reason": "no_identity_matching_search_result"]
                    )
                }
            }
            let capturedRoute = observation.route
            let capturedThreadID = observation.threadID
            guard observation.ready, !capturedRoute.isEmpty, !capturedThreadID.isEmpty,
                  await userMediatedDocumentIsSafe(view) else {
                if experimentSafety.status()["provider_challenge_detected"] as? Bool == true { break }
                var failureFields = Self.gmailRouteTraceMetadata(captureURL.absoluteString)
                failureFields["route_attempt"] = captureURL == url ? 1 : 2
                failureFields["recovered"] = captureURL != url
                failureFields["outcome"] = "failed"
                failureFields["terminal_reason"] = "conversation_route_not_ready"
                failureFields["ingest_called"] = false
                await recordAcquisitionTrace(
                    attemptID: attemptID, trigger: "user_selected_batch",
                    stage: "terminal", surfaceMessageID: id, fields: failureFields
                )
                failed += 1
                continue
            }
            do {
                let threadHint = max(1, Self.bridgeInt(message["thread_message_count_hint"], default: 1))
                await recordAcquisitionTrace(
                    attemptID: attemptID, trigger: "user_selected_batch",
                    stage: "supervised_materialization_started", surfaceMessageID: id,
                    fields: ["expected_thread_count": threadHint, "ingest_called": false]
                )
                guard threadHint <= Self.maximumSelectedThreadMessageCount else {
                    failed += 1
                    userMediatedStatusLabel?.stringValue =
                        "Skipped a selected thread because its Gmail count exceeds the 50-message safety limit."
                    continue
                }
                let materialized = (try await view.callAsyncJavaScript(
                    Self.supervisedThreadMaterializationScript,
                    arguments: [
                        "expectedThreadCount": threadHint,
                        "maximumThreadMessages": Self.maximumSelectedThreadMessageCount,
                    ], contentWorld: .page
                )) as? [String: Any] ?? [:]
                await recordAcquisitionTrace(
                    attemptID: attemptID, trigger: "user_selected_batch",
                    stage: "supervised_materialization_observed", surfaceMessageID: id,
                    fields: [
                        "expected_thread_count": threadHint,
                        "materialization_initial_candidate_count": Self.bridgeInt(materialized["initial_candidate_count"]),
                        "materialization_initial_body_count": Self.bridgeInt(materialized["initial_body_count"]),
                        "materialization_initial_bodyless_count": Self.bridgeInt(materialized["initial_bodyless_count"]),
                        "materialization_final_candidate_count": Self.bridgeInt(materialized["candidate_count"]),
                        "materialization_final_body_count": Self.bridgeInt(materialized["body_count"]),
                        "materialization_final_bodyless_count": Self.bridgeInt(materialized["bodyless_count"]),
                        "expand_all_candidate_count": Self.bridgeInt(materialized["expand_all_candidate_count"]),
                        "expand_all_clicked": materialized["expand_all_clicked"] as? Bool ?? false,
                        "clicked_message_header": Self.bridgeInt(materialized["clicked_count"]),
                        "message_header_click_attempt_count": Self.bridgeInt(materialized["header_click_attempt_count"]),
                        "stabilization_samples": Self.bridgeInt(materialized["stabilization_samples"]),
                        "ingest_called": false,
                    ]
                )
                // Gmail canonicalizes a message URL to its conversation URL while
                // Expand all is running. Raw route equality therefore rejects a
                // correctly materialized thread. Conversely, accepting any card
                // on the new URL can capture the previous conversation while the
                // SPA is replacing its DOM. Revalidate the requested Gmail
                // message identity on both sides of extraction instead.
                guard materialized["over_limit"] as? Bool != true,
                      await selectedConversationDocumentMatches(
                        view, expectedURL: captureURL, expectedThreadID: capturedThreadID
                      ),
                      await userMediatedDocumentIsSafe(view) else { failed += 1; continue }
                let raw = (try await view.callAsyncJavaScript(
                    Self.detailScript, arguments: ["expectedThreadCount": threadHint], contentWorld: .page
                )) as? [String: Any] ?? [:]
                guard await selectedConversationDocumentMatches(
                    view, expectedURL: captureURL, expectedThreadID: capturedThreadID
                ) else {
                    failed += 1
                    continue
                }
                let allItems = raw["messages"] as? [[String: Any]] ?? []
                guard allItems.count <= Self.maximumSelectedThreadMessageCount else { failed += 1; continue }
                let items = Array(allItems.prefix(Self.maximumSelectedThreadMessageCount))
                let expected = max(threadHint, Self.bridgeInt(raw["expected_message_count"], default: items.count))
                let collapsed = Self.bridgeInt(raw["collapsed_message_count"])
                await recordAcquisitionTrace(
                    attemptID: attemptID, trigger: "user_selected_batch",
                    stage: "supervised_extraction_observed", surfaceMessageID: id,
                    fields: [
                        "expected_message_count": expected,
                        "js_message_count": allItems.count,
                        "swift_message_count": items.count,
                        "collapsed_message_count": collapsed,
                        "ingest_called": false,
                    ]
                )
                let captures: [[String: Any]] = items.compactMap { item in
                    guard Self.hasMailbox(item["sender"] as? String ?? "") else { return nil }
                    var capture = item
                    capture["account_id"] = Self.accountID
                    capture["provider"] = "gmail-web"
                    capture["surface_message_id"] = id
                    capture["capture_method"] = "gmail_dom_user_selected_batch"
                    capture["capture_version"] = 1
                    capture["thread_capture_version"] = items.count >= expected && collapsed == 0 ? 1 : 0
                    if items.count < expected || collapsed > 0 { capture["content_state"] = "partial" }
                    capture.removeValue(forKey: "full_message_url")
                    return capture
                }
                guard !captures.isEmpty else { failed += 1; continue }
                let result = try await CoreClient.shared.call(
                    method: "email.source.ingest", params: ["captures": captures]
                )
                let accepted = Self.bridgeInt(result["accepted"])
                let ignoredCaptures = Self.bridgeInt(result["ignored"])
                await recordAcquisitionTrace(
                    attemptID: attemptID, trigger: "user_selected_batch",
                    stage: "supervised_ingest_completed", surfaceMessageID: id,
                    fields: [
                        "expected_message_count": expected,
                        "capture_count": captures.count,
                        "accepted_count": accepted,
                        "rejected_count": result["rejected"] as? Int ?? 0,
                        "ignored_count": ignoredCaptures,
                        "ingest_called": true,
                    ]
                )
                if ignoredCaptures > 0 {
                    // Ignore matching is conversation-scoped at the Surface:
                    // Core purges the row even when sibling captures in this
                    // batch were accepted. Never leave that Gmail row available
                    // for another supervised retry.
                    removeIgnoredUserMediatedDiscovery(id)
                    ignored += 1
                    publishEmailSnapshotChange()
                } else if accepted > 0 {
                    userMediatedSelectedDiscoveryIDs.remove(id)
                    let threadComplete = items.count >= expected && collapsed == 0
                    userMediatedDiscoveredMessages[id]?["persisted_content_state"] = threadComplete ? "complete" : "partial"
                    if threadComplete {
                        userMediatedSyncedDiscoveryIDs.insert(id)
                        complete += 1
                    } else {
                        // Partial rows remain enabled so the user can expand the
                        // conversation manually and explicitly select it again.
                        userMediatedSyncedDiscoveryIDs.remove(id)
                        partial += 1
                    }
                    publishEmailSnapshotChange()
                } else { failed += 1 }
            } catch {
                failed += 1
            }
            if index + 1 < retryIDs.count {
                try? await Task.sleep(nanoseconds: 750_000_000)
            }
        }
        // Use durable Core state—not the just-finished loop's in-memory
        // counters—to decide which rows are available for another attempt and
        // what the user sees in the summary. A DOM-perfect extraction can still
        // be rejected by Core for an identity conflict; conversely, an unchanged
        // already-complete capture is accepted but must not be counted as a new
        // completion. Reconcile the attempted IDs and derive final outcomes from
        // the authoritative states.
        await reconcileUserMediatedDiscoveryStatesFromCore()
        var durableComplete = 0
        var durablePartial = 0
        var durableIgnored = 0
        for id in retryIDs {
            if userMediatedIgnoredDiscoveryIDs.contains(id) {
                durableIgnored += 1
                continue
            }
            let state = (userMediatedDiscoveredMessages[id]?["persisted_content_state"]
                as? String ?? "preview").lowercased()
            if state == "complete" { durableComplete += 1 }
            else if state == "partial" { durablePartial += 1 }
        }
        complete = durableComplete
        partial = durablePartial
        ignored = max(ignored, durableIgnored)
        failed = max(0, retryIDs.count - complete - partial - ignored)
        userMediatedBatchInFlight = false
        rebuildUserMediatedDiscoveryPanel()
        let providerChallenge = experimentSafety.status()["provider_challenge_detected"] as? Bool == true
        if !automaticSyncRequested {
            if providerChallenge || failed > 0 {
                _ = try? await CoreClient.shared.call(method: "email.surface.sync.failed", params: [
                    "account_id": Self.accountID,
                    "needs_login": providerChallenge,
                    "error": providerChallenge
                        ? "Gmail stopped synchronization because a provider challenge was detected."
                        : "Email synchronization failed for \(failed) selected conversation\(failed == 1 ? "" : "s").",
                ])
            } else {
                _ = try? await CoreClient.shared.call(method: "email.surface.sync.completed", params: [
                    "account_id": Self.accountID, "message_count": complete + partial,
                ])
            }
        }
        if !providerChallenge {
            var summary = "Sync selected finished: \(complete) complete, \(partial) partial, \(failed) failed"
            if ignored > 0 { summary += ", \(ignored) ignored" }
            if alreadyComplete > 0 { summary += ", \(alreadyComplete) already complete" }
            userMediatedStatusLabel?.stringValue = summary + ". No retry was attempted."
            if automaticSyncRequested {
                finishAutomaticSync(
                    complete: complete, partial: partial, failed: failed,
                    ignored: ignored, message: summary
                )
            }
        } else if automaticSyncRequested {
            finishAutomaticSync(
                complete: complete, partial: partial, failed: max(1, failed), ignored: ignored,
                message: "Gmail stopped synchronization because a provider challenge was detected."
            )
        }
    }

    private func selectedConversationThreadID(_ view: WKWebView) async -> String {
        (try? await view.callAsyncJavaScript(
            Self.selectedConversationThreadIdentityScript,
            arguments: [:], contentWorld: .page
        )) as? String ?? ""
    }

    private func selectedConversationDocumentMatches(
        _ view: WKWebView, expectedURL: URL, priorThreadID: String = "",
        expectedThreadID: String = "", allowNewThreadOwner: Bool = false
    ) async -> Bool {
        guard Self.sameGmailAccount(view.url, expectedURL),
              let expectedConversationID = Self.gmailConversationID(from: expectedURL) else { return false }
        return (try? await view.callAsyncJavaScript(
            Self.selectedConversationPassiveProbe,
            arguments: [
                "expectedConversationID": expectedConversationID,
                "previousThreadID": priorThreadID,
                "expectedThreadID": expectedThreadID,
                "allowNewThreadOwner": allowNewThreadOwner,
            ],
            contentWorld: .page
        )) as? Bool ?? false
    }

    private func waitForSelectedConversation(
        _ view: WKWebView, expectedURL: URL, priorRoute: String,
        priorThreadID: String, allowNewThreadOwner explicitAllowNewThreadOwner: Bool? = nil
    ) async -> (ready: Bool, route: String, threadID: String) {
        var observedRoute = ""
        var stableSamples = 0
        // Gmail often needs more than the former three-second boundary to
        // replace the list document with a selected conversation. This remains
        // a passive, bounded wait; no retry or additional navigation occurs.
        for _ in 0..<32 {
            if Self.isGmailProviderChallengeURL(view.url) {
                stopUserMediatedCaptureForProviderChallenge(view)
                return (false, "", "")
            }
            if let current = view.url, Self.sameGmailAccount(current, expectedURL),
               Self.gmailConversationID(from: current) != nil,
               current.absoluteString != priorRoute || current.absoluteString == expectedURL.absoluteString {
                if current.absoluteString == observedRoute { stableSamples += 1 }
                else { observedRoute = current.absoluteString; stableSamples = 1 }
                let priorRouteHasConversation = URL(string: priorRoute).flatMap {
                    Self.gmailConversationID(from: $0)
                } != nil
                let allowNewThreadOwner = explicitAllowNewThreadOwner ?? !priorRouteHasConversation
                let ready = await selectedConversationDocumentMatches(
                    view, expectedURL: expectedURL, priorThreadID: priorThreadID,
                    allowNewThreadOwner: allowNewThreadOwner
                )
                if ready && stableSamples >= 2 {
                    let threadID = await selectedConversationThreadID(view)
                    if !threadID.isEmpty { return (true, current.absoluteString, threadID) }
                }
            }
            try? await Task.sleep(nanoseconds: 250_000_000)
        }
        return (false, "", "")
    }

    @objc private func captureCurrentConversationPressed(_ sender: NSButton) {
        Task { @MainActor [weak self] in await self?.captureCurrentConversationFromUserWindow() }
    }

    @objc private func closeUserMediatedCapturePressed(_ sender: NSButton) {
        loginWindow?.close()
    }

    private func applyInitialUserMediatedSplitPositionIfNeeded() {
        guard !userMediatedSplitHasInitialPosition,
              let splitView = userMediatedSplitView,
              splitView.window?.isVisible == true else { return }
        splitView.superview?.layoutSubtreeIfNeeded()
        guard splitView.bounds.width > 0 else { return }
        splitView.setPosition(
            Self.defaultAuxiliaryPanelDividerPosition(
                totalWidth: splitView.bounds.width,
                dividerThickness: splitView.dividerThickness
            ),
            ofDividerAt: 0
        )
        userMediatedSplitHasInitialPosition = true
    }

    func windowDidBecomeKey(_ notification: Notification) {
        guard let window = notification.object as? NSWindow, window === loginWindow else { return }
        applyInitialUserMediatedSplitPositionIfNeeded()
    }

    func splitView(_ splitView: NSSplitView, constrainMinCoordinate proposedMinimumPosition: CGFloat,
                   ofSubviewAt dividerIndex: Int) -> CGFloat {
        guard splitView === userMediatedSplitView, dividerIndex == 0 else {
            return proposedMinimumPosition
        }
        return max(proposedMinimumPosition, 420)
    }

    func splitView(_ splitView: NSSplitView, constrainMaxCoordinate proposedMaximumPosition: CGFloat,
                   ofSubviewAt dividerIndex: Int) -> CGFloat {
        guard splitView === userMediatedSplitView, dividerIndex == 0 else {
            return proposedMaximumPosition
        }
        let maximumKeepingAuxiliaryPanelUsable = splitView.bounds.width
            - splitView.dividerThickness - 320
        return min(proposedMaximumPosition, maximumKeepingAuxiliaryPanelUsable)
    }

    /// Programmatic NSWindows default to `isReleasedWhenClosed = true`. This
    /// bridge also owns the window strongly, so allowing AppKit to release it
    /// during `windowWillClose` can race ARC/WebKit teardown and over-release the
    /// native window at the event autorelease-pool boundary. Retain it explicitly
    /// and release our ownership only after AppKit finishes the close callback.
    static func configureUserMediatedWindowLifetime(_ window: NSWindow) {
        window.isReleasedWhenClosed = false
    }

    func windowWillClose(_ notification: Notification) {
        guard let closingWindow = notification.object as? NSWindow, closingWindow === loginWindow else { return }
        userMediatedWebView?.configuration.userContentController.removeScriptMessageHandler(
            forName: Self.userSelectionMessageHandler
        )
        userMediatedWebView?.navigationDelegate = nil
        userMediatedWebView?.uiDelegate = nil
        userMediatedWebView?.stopLoading()
        userMediatedSplitView?.delegate = nil
        userMediatedSplitView = nil
        userMediatedSplitHasInitialPosition = false
        userMediatedWebView = nil
        userMediatedStatusLabel = nil
        captureConversationButton = nil
        selectAllDiscoveriesButton = nil
        syncSelectedButton = nil
        discoverySummaryLabel = nil
        discoveryStackView = nil
        userMediatedDiscoveredMessages = [:]
        userMediatedDiscoveryOrder = []
        userMediatedSelectedDiscoveryIDs = []
        userMediatedSyncedDiscoveryIDs = []
        userMediatedIgnoredDiscoveryIDs = []
        userMediatedAccount = [:]
        userMediatedBatchInFlight = false
        if automaticSyncRequested {
            automaticSyncRequested = false
            syncProgress = [
                "running": false, "phase": "finished", "current": 0, "total": 0,
                "message": "Automatic email synchronization was cancelled.",
                "complete": 0, "partial": 0, "failed": 1, "ignored": 0,
                "run_id": automaticSyncRunID,
            ]
            Task {
                _ = try? await CoreClient.shared.call(method: "email.surface.sync.failed", params: [
                    "account_id": Self.accountID,
                    "error": "Automatic email synchronization was cancelled.",
                ])
            }
            publishEmailSyncProgressChange()
        }
        automaticSyncBatchStarted = false
        automaticDurableCandidatesLoaded = false
        automaticSyncRunID = ""
        userMediatedListPageRevision = 0
        userMediatedListRoute = ""
        automaticListCaptureScheduledKey = ""
        pendingAutomaticListPageRevision = 0
        pendingAutomaticListRoute = ""
        userSelectedSurfaceMessageID = ""
        userSelectedConversationRoute = ""
        userMediatedSelectionRevision = 0
        automaticCaptureScheduledRevision = 0
        pendingAutomaticCaptureRevision = 0
        pendingAutomaticCaptureRoute = ""
        userMediatedCaptureInFlight = false
        // Keep the non-auto-released NSWindow alive until AppKit has returned
        // from its close notification. Releasing the final owner synchronously
        // from `windowWillClose` recreates the same lifetime race.
        DispatchQueue.main.async { [weak self, weak closingWindow] in
            guard let self, let closingWindow, self.loginWindow === closingWindow else { return }
            self.loginWindow = nil
        }
        // Do not extend session-cookie lifetimes and do not start Sync. WebKit
        // owns its normal cookie policy; closing the window performs no Gmail work.
    }

    private func beginUserMediatedCapture(_ label: String) -> WKWebView? {
        guard !Self.gmailAccessIsSuspended, !userMediatedCaptureInFlight,
              let view = userMediatedWebView, loginWindow != nil else { return nil }
        userMediatedCaptureInFlight = true
        captureConversationButton?.isEnabled = false
        userMediatedStatusLabel?.stringValue = label
        return view
    }

    private func finishUserMediatedCapture(_ message: String) {
        userMediatedCaptureInFlight = false
        let challengeOpen = experimentSafety.status()["provider_challenge_detected"] as? Bool == true
        captureConversationButton?.isEnabled = !challengeOpen
            && !userSelectedSurfaceMessageID.isEmpty
            && !userSelectedConversationRoute.isEmpty
        userMediatedStatusLabel?.stringValue = message
        if automaticSyncRequested {
            setAutomaticSyncProgress(phase: "discovering", message: message)
        }

        let pendingRevision = pendingAutomaticCaptureRevision
        let pendingRoute = pendingAutomaticCaptureRoute
        pendingAutomaticCaptureRevision = 0
        pendingAutomaticCaptureRoute = ""
        if !challengeOpen, pendingRevision == userMediatedSelectionRevision,
           !pendingRoute.isEmpty, pendingRoute == userSelectedConversationRoute {
            Task { @MainActor [weak self] in
                await self?.captureCurrentConversationFromUserWindow(
                    expectedSelectionRevision: pendingRevision, expectedRoute: pendingRoute
                )
            }
            return
        }

        let pendingListRevision = pendingAutomaticListPageRevision
        let pendingListRoute = pendingAutomaticListRoute
        pendingAutomaticListPageRevision = 0
        pendingAutomaticListRoute = ""
        guard !challengeOpen, pendingListRevision == userMediatedListPageRevision,
              !pendingListRoute.isEmpty, pendingListRoute == userMediatedListRoute else { return }
        Task { @MainActor [weak self] in
            await self?.captureVisibleListFromUserWindow(
                expectedPageRevision: pendingListRevision, expectedRoute: pendingListRoute
            )
        }
    }

    private func userMediatedDocumentIsSafe(_ view: WKWebView) async -> Bool {
        guard let url = view.url, let host = url.host?.lowercased(), Self.allowedHost(host),
              !Self.isExplicitGoogleLoginURL(url), !Self.isGmailProviderChallengeURL(url) else {
            if Self.isGmailProviderChallengeURL(view.url) { stopUserMediatedCaptureForProviderChallenge(view) }
            return false
        }
        let challenged = (try? await view.callAsyncJavaScript(
            Self.providerChallengeProbeScript, arguments: [:], contentWorld: .page
        )) as? Bool ?? true
        if challenged {
            stopUserMediatedCaptureForProviderChallenge(view)
            return false
        }
        return true
    }

    private func captureVisibleListFromUserWindow(
        expectedPageRevision: Int, expectedRoute: String
    ) async {
        guard expectedPageRevision == userMediatedListPageRevision,
              expectedRoute == userMediatedListRoute,
              let view = beginUserMediatedCapture("Reading the visible email list once…") else { return }
        guard await userMediatedDocumentIsSafe(view) else {
            if experimentSafety.status()["provider_challenge_detected"] as? Bool != true {
                finishUserMediatedCapture("Open a Gmail email-list page manually before capturing.")
            } else {
                userMediatedCaptureInFlight = false
            }
            if automaticSyncRequested {
                finishAutomaticSync(
                    complete: 0, partial: 0, failed: 1, ignored: 0,
                    message: "Gmail is unavailable or requires attention."
                )
            }
            return
        }
        do {
            let raw = (try await view.callAsyncJavaScript(
                Self.extractScript, arguments: [:], contentWorld: .page
            )) as? [String: Any] ?? [:]
            guard expectedPageRevision == userMediatedListPageRevision,
                  expectedRoute == userMediatedListRoute,
                  view.url?.absoluteString == expectedRoute else {
                finishUserMediatedCapture("The Gmail page changed before list capture completed; nothing was saved.")
                return
            }
            guard raw["parser_ready"] as? Bool == true else {
                finishUserMediatedCapture("This page is not a visible Gmail email list. Navigate to an email list page.")
                if automaticSyncRequested {
                    finishAutomaticSync(
                        complete: 0, partial: 0, failed: 1, ignored: 0,
                        message: "Gmail did not expose an inbox list. Open Synchronise Emails once to check the session."
                    )
                }
                return
            }
            let messages = Array((raw["messages"] as? [[String: Any]] ?? []).prefix(Self.maximumMessages))
            var account = raw["account"] as? [String: Any] ?? [:]
            account["id"] = Self.accountID
            account["provider"] = "gmail-web"
            account["mailbox_url"] = view.url?.absoluteString ?? ""
            userMediatedAccount = account
            // Persist every row as soon as its Gmail list page is observed. The
            // supervised window deliberately does not paginate by itself, so
            // page-two (and later) rows must survive closing this window. On a
            // later Sync All, Core's acquisition-candidate queue can then return
            // those preview/partial conversations even though Gmail opens on
            // page one. Persist complete rows too: a larger current Gmail thread
            // count can turn a formerly complete conversation back into durable
            // partial work without replacing any acquired Source Artifact.
            let surfaceResult = try await CoreClient.shared.call(
                method: "email.surface.ingest", params: [
                    "account": account, "messages": messages,
                ]
            )
            let surfaceIgnoredIDs = Set(Self.bridgeStrings(surfaceResult["ignored_ids"]))
            for id in surfaceIgnoredIDs {
                userMediatedIgnoredDiscoveryIDs.insert(id)
            }
            if Self.bridgeInt(surfaceResult["ingested"]) > 0 || !surfaceIgnoredIDs.isEmpty {
                publishEmailSnapshotChange()
            }

            // Classify only after persistence. In particular, ingesting a newer
            // thread-count hint may have changed an old complete row to partial.
            // This lookup also distinguishes “absent because ignored” from
            // genuinely new, preventing ignored rows from being resurrected.
            let persistedResult = try await CoreClient.shared.call(
                method: "email.surface.supervised.classify", params: [
                    "account_id": Self.accountID, "messages": messages,
                ]
            )
            let persistedRows = persistedResult["states"] as? [[String: Any]] ?? []
            let persistedByID = Dictionary(uniqueKeysWithValues: persistedRows.compactMap { row -> (String, String)? in
                guard let id = row["id"] as? String else { return nil }
                return (id, row["state"] as? String ?? "preview")
            })
            let reconciled = messages.compactMap { message -> [String: Any]? in
                var value = message
                if let id = message["id"] as? String {
                    let state = (persistedByID[id] ?? "preview").lowercased()
                    if state == "ignored" {
                        userMediatedIgnoredDiscoveryIDs.insert(id)
                        return nil
                    }
                    value["persisted_content_state"] = state
                }
                return value
            }
            let addedToQueue = mergeUserMediatedDiscoveries(reconciled)
            finishUserMediatedCapture("Saved \(messages.count) visible email row\(messages.count == 1 ? "" : "s") for future Sync All and added \(addedToQueue) new item\(addedToQueue == 1 ? "" : "s") to the supervised queue. Already parsed conversations are disabled.")
            maybeStartAutomaticSyncAfterDiscovery()
        } catch {
            finishUserMediatedCapture("Could not capture the visible email list. No retry was attempted.")
            if automaticSyncRequested {
                finishAutomaticSync(
                    complete: 0, partial: 0, failed: 1, ignored: 0,
                    message: "Could not read the Gmail inbox."
                )
            }
        }
    }

    private func captureCurrentConversationFromUserWindow(
        expectedSelectionRevision: Int? = nil, expectedRoute: String? = nil
    ) async {
        guard await refreshFeatureStatus() else { return }
        if let expectedSelectionRevision, expectedSelectionRevision != userMediatedSelectionRevision { return }
        if let expectedRoute, expectedRoute != userSelectedConversationRoute { return }
        guard let view = beginUserMediatedCapture("Reading the current conversation once…") else { return }
        let surfaceMessageID = userSelectedSurfaceMessageID
        let selectionRevision = userMediatedSelectionRevision
        let selectedRoute = userSelectedConversationRoute
        guard Self.isSafeSurfaceMessageID(surfaceMessageID),
              !selectedRoute.isEmpty,
              view.url?.absoluteString == selectedRoute,
              await userMediatedDocumentIsSafe(view) else {
            if experimentSafety.status()["provider_challenge_detected"] as? Bool != true {
                finishUserMediatedCapture("Open a conversation by clicking its Gmail inbox row before capturing.")
            } else {
                userMediatedCaptureInFlight = false
            }
            return
        }
        do {
            let raw = (try await view.callAsyncJavaScript(
                Self.detailScript, arguments: ["expectedThreadCount": 0], contentWorld: .page
            )) as? [String: Any] ?? [:]
            guard Self.shouldAcceptAutomaticConversationCaptureResult(
                selectionRevision: selectionRevision,
                currentSelectionRevision: userMediatedSelectionRevision,
                surfaceMessageID: surfaceMessageID,
                currentSurfaceMessageID: userSelectedSurfaceMessageID,
                route: selectedRoute,
                currentRoute: userSelectedConversationRoute,
                documentRoute: view.url?.absoluteString ?? ""
            ) else {
                finishUserMediatedCapture("The Gmail conversation changed before capture completed; nothing was saved.")
                return
            }
            let items = raw["messages"] as? [[String: Any]] ?? []
            let expected = Self.bridgeInt(raw["expected_message_count"], default: items.count)
            let collapsed = Self.bridgeInt(raw["collapsed_message_count"])
            guard !items.isEmpty, expected > 0, items.count >= expected, collapsed == 0 else {
                finishUserMediatedCapture("Gmail currently exposes only part of this conversation. Expand it manually and capture again if appropriate.")
                return
            }
            let captures: [[String: Any]] = items.compactMap { message in
                guard Self.hasMailbox(message["sender"] as? String ?? "") else { return nil }
                var capture = message
                capture["account_id"] = Self.accountID
                capture["provider"] = "gmail-web"
                capture["surface_message_id"] = surfaceMessageID
                capture["capture_method"] = "gmail_dom_user_visible_conversation"
                capture["capture_version"] = 3
                capture["thread_capture_version"] = 1
                capture.removeValue(forKey: "full_message_url")
                return capture
            }
            guard !captures.isEmpty else {
                finishUserMediatedCapture("The visible conversation did not expose a sender-bearing message body.")
                return
            }
            let result = try await CoreClient.shared.call(method: "email.source.ingest", params: ["captures": captures])
            let accepted = result["accepted"] as? Int ?? 0
            let ignored = result["ignored"] as? Int ?? 0
            if accepted > 0 || ignored > 0 { publishEmailSnapshotChange() }
            if accepted > 0 {
                finishUserMediatedCapture("Captured \(accepted) visible message\(accepted == 1 ? "" : "s") from this conversation.")
            } else if ignored > 0 {
                finishUserMediatedCapture("The visible messages matched an existing Ignore Rule; no email was added.")
            } else {
                finishUserMediatedCapture("Core accepted no visible message. No retry was attempted.")
            }
        } catch {
            finishUserMediatedCapture("Could not capture the current conversation. No retry was attempted.")
        }
    }

    static func shouldScheduleAutomaticVisibleListCapture(
        pageRevision: Int, route: String, currentPageRevision: Int,
        currentRoute: String, documentRoute: String, scheduledKey: String
    ) -> Bool {
        pageRevision > 0 && pageRevision == currentPageRevision
            && !route.isEmpty && route == currentRoute && route == documentRoute
            && scheduledKey != "\(pageRevision)|\(route)"
    }

    static func shouldScheduleAutomaticConversationCapture(
        selectionRevision: Int, currentSelectionRevision: Int,
        route: String, currentRoute: String, scheduledRevision: Int
    ) -> Bool {
        selectionRevision > 0
            && selectionRevision == currentSelectionRevision
            && !route.isEmpty && route == currentRoute
            && scheduledRevision != selectionRevision
    }

    static func shouldAcceptAutomaticConversationCaptureResult(
        selectionRevision: Int, currentSelectionRevision: Int,
        surfaceMessageID: String, currentSurfaceMessageID: String,
        route: String, currentRoute: String, documentRoute: String
    ) -> Bool {
        selectionRevision > 0
            && selectionRevision == currentSelectionRevision
            && isSafeSurfaceMessageID(surfaceMessageID)
            && surfaceMessageID == currentSurfaceMessageID
            && !route.isEmpty && route == currentRoute && route == documentRoute
    }

    static func sameGmailAccount(_ current: URL?, _ expected: URL) -> Bool {
        guard let current else { return false }
        return gmailAccountPath(from: current) == gmailAccountPath(from: expected)
            && !gmailAccountPath(from: current).isEmpty
    }

    static func sameSelectedConversation(_ current: URL?, _ expected: URL) -> Bool {
        guard sameGmailAccount(current, expected), let current,
              let currentID = gmailConversationID(from: current),
              let expectedID = gmailConversationID(from: expected) else { return false }
        return currentID == expectedID
    }

    static func selectedConversationRecoveryURL(
        _ recoveredValue: String, replacing originalURL: URL
    ) -> URL? {
        guard let recoveredURL = URL(string: recoveredValue),
              recoveredURL.scheme?.lowercased() == "https",
              let recoveredHost = recoveredURL.host?.lowercased(), allowedHost(recoveredHost),
              sameGmailAccount(recoveredURL, originalURL),
              gmailConversationID(from: recoveredURL) != nil,
              recoveredURL.absoluteString != originalURL.absoluteString else { return nil }
        return recoveredURL
    }

    static func recoveredConversationDocumentIsAlreadyOpen(
        currentURL: URL?, recoveredURL: URL, currentThreadID: String
    ) -> Bool {
        !currentThreadID.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            && sameSelectedConversation(currentURL, recoveredURL)
    }

    static func isSafeSurfaceMessageID(_ value: String) -> Bool {
        !value.isEmpty && value.count <= 240
            && value.unicodeScalars.allSatisfy { scalar in
                CharacterSet.alphanumerics.contains(scalar) || "-_:".unicodeScalars.contains(scalar)
            }
    }

    func logout() async -> [String: Any] {
        // Explicit logout must not trigger the normal "window closed → sync" path.
        loginWindow?.delegate = nil
        loginWindow?.close()
        loginWindow = nil
        await store.removeData(ofTypes: WKWebsiteDataStore.allWebsiteDataTypes(),
                               modifiedSince: Date(timeIntervalSince1970: 0))
        scraper = nil
        fullMessageScraper = nil
        detailInFlight = false
        lastSuccessfulSync = nil
        do {
            _ = try await CoreClient.shared.call(method: "email.surface.sync.failed", params: [
                "account_id": Self.accountID, "needs_login": true, "error": "Logged out of Gmail",
            ])
        } catch { /* local cookies are already cleared */ }
        return ["ok": true]
    }

    func progress() -> [String: Any] {
        var result = syncProgress
        result["ok"] = true
        return result
    }

    private func setProgress(phase: String, current: Int = 0, total: Int = 0,
                             subject: String = "", sender: String = "") {
        syncProgress = [
            "running": true, "phase": phase, "current": current, "total": total,
            "subject": subject, "sender": sender,
        ]
    }

    func sync(force: Bool) async -> [String: Any] {
        guard !Self.gmailAccessIsSuspended else {
            return ["ok": false, "access_suspended": true, "error": Self.gmailAccessSuspendedError]
        }
        return ["ok": false, "error": Self.legacyAutomationDisabledError]
    }

    /* Legacy hidden Sync implementation retained temporarily for fixture-backed removal.
    private func disabledLegacySync(force: Bool) async -> [String: Any] {
        if syncInFlight {
            // A second renderer request must not be mistaken for a completed
            // no-op. Willo used to turn this response into “all complete” even
            // while the first synchronization was still loading Gmail.
            return ["ok": false, "accepted": false, "reason": "already_syncing",
                    "error": "Gmail synchronization is already in progress"]
        }
        if !force, let lastSuccessfulSync, Date().timeIntervalSince(lastSuccessfulSync) < Self.interval - 5 {
            return ["ok": true, "accepted": false, "reason": "recently synchronized"]
        }
        syncInFlight = true
        setProgress(phase: "discovering")
        defer {
            syncInFlight = false
            syncProgress = ["running": false, "phase": "idle", "current": 0, "total": 0]
        }

        do {
            _ = try await CoreClient.shared.call(method: "email.surface.sync.started", params: [
                "account_id": Self.accountID,
            ])
        } catch {
            return ["ok": false, "error": "Could not start Gmail synchronization: \(error)"]
        }

        setProgress(phase: "loading_inbox")
        let view = webView()
        _ = await store.httpCookieStore.allCookies() // warm persisted store/network process
        view.load(URLRequest(url: mailboxURL()))
        let ready = await waitForInbox(view)
        guard ready else {
            let hasCookies = await hasGoogleSessionCookies()
            let explicitLogin = isLoginURL(view.url)
            let needsLogin = explicitLogin || !hasCookies
            let error = needsLogin
                ? "Your Gmail session is not logged in. Use Login to mail."
                : "Timed out while waiting for the Gmail inbox."
            // Failure to recover the previous WebKit cookie store after an app
            // replacement is not authoritative logout evidence. Preserve the
            // durable prior session state unless Gmail explicitly navigated to
            // a login surface (or cookies remain present and the failure is a
            // normal timeout rather than missing local session material).
            if explicitLogin || hasCookies {
                await recordFailure(error, needsLogin: needsLogin)
            }
            return ["ok": false, "needs_login": needsLogin, "error": error]
        }

        setProgress(phase: "reading_inbox")
        let raw: [String: Any]
        do {
            raw = (try await view.callAsyncJavaScript(Self.extractScript, arguments: [:], contentWorld: .page)) as? [String: Any] ?? [:]
        } catch {
            let message = "Could not parse the Gmail inbox: \(error)"
            await recordFailure(message, needsLogin: false)
            return ["ok": false, "error": message]
        }
        guard raw["parser_ready"] as? Bool == true else {
            let message = "Gmail loaded, but its current layout did not expose the inbox. The parser may need an update."
            await recordFailure(message, needsLogin: false)
            return ["ok": false, "error": message]
        }
        let discoveredMessages = raw["messages"] as? [[String: Any]] ?? []
        // Discovery must remain passive: do not click unresolved rows or search
        // Gmail as a side effect of Sync. Their remote_url stays empty until one
        // separately authorized, single-conversation operation resolves it.
        let messages = discoveredMessages
        var account = raw["account"] as? [String: Any] ?? [:]
        account["id"] = Self.accountID
        account["provider"] = "gmail-web"
        account["mailbox_url"] = mailboxURL().absoluteString

        do {
            let boundedMessages = Array(messages.prefix(Self.maximumMessages))
            let ingested = try await CoreClient.shared.call(method: "email.surface.ingest", params: [
                "account": account,
                "messages": boundedMessages,
            ])
            // Discovery rows are explicitly preview-only Email Source Items. Core
            // performs Ignore checks before writing the exact capture beneath
            // ~/Artifacts/mirrors/emails and normalizing it under ~/Artifacts/emails.
            let captures: [[String: Any]] = boundedMessages.map { message in
                var capture = message
                capture["account_id"] = Self.accountID
                capture["provider"] = "gmail-web"
                capture["surface_message_id"] = message["id"]
                capture["provider_thread_id"] = message["conversation_id"] ?? message["message_id"]
                capture["provider_message_id"] = message["message_id"] ?? message["id"]
                capture["content_state"] = "preview"
                capture["capture_method"] = "gmail_dom_discovery"
                capture["capture_version"] = 1
                capture["body_text"] = message["body"] ?? message["preview"] ?? ""
                capture["body_html"] = ""
                return capture
            }
            // Gmail occasionally renders a sender display name before its email
            // address is attached to the row. Such a preview is still useful in
            // the Surface, but it is not a valid Source Item. Skip it here and
            // let detail acquisition retry with the richer conversation DOM.
            let validCaptures = captures.filter { Self.hasMailbox($0["sender"] as? String ?? "") }
            if !validCaptures.isEmpty {
                _ = try await CoreClient.shared.call(method: "email.source.ingest", params: [
                    "captures": validCaptures,
                ])
            }

            // Safety contract: explicit Sync is discovery-only. It performs one
            // inbox load and one bounded extraction, then stops. It never loops
            // over incomplete detail candidates; full-content work requires a
            // separately authorized one-conversation operation.
            _ = try await CoreClient.shared.call(method: "email.surface.sync.completed", params: [
                "account_id": Self.accountID,
                "message_count": boundedMessages.count,
            ])
            lastSuccessfulSync = Date()
            await persistSessionCookies()
            var result: [String: Any] = [
                "ok": true, "accepted": true,
                "acquisition_requested": 0, "acquired_conversations": 0,
                "complete": 0, "partial": 0, "acquisition_failed": 0,
                "remaining_incomplete": 0, "discovery_only": true,
            ]
            result.merge(ingested) { _, new in new }
            return result
        } catch {
            let message = "Could not save synchronized Gmail messages: \(error)"
            await recordFailure(message, needsLogin: false)
            return ["ok": false, "error": message]
        }
    }
    */

    func enrich(remoteURL: String, surfaceMessageID: String) async -> [String: Any] {
        guard !Self.legacyAutomatedGmailAccessIsDisabled else {
            return ["ok": false, "error": Self.legacyAutomationDisabledError]
        }
        guard !Self.gmailAccessIsSuspended else {
            return ["ok": false, "access_suspended": true, "error": Self.gmailAccessSuspendedError]
        }
        guard !detailInFlight else {
            return ["ok": false, "error": "Another Gmail conversation is already loading"]
        }
        detailInFlight = true
        defer { detailInFlight = false }
        return await acquireConversation(remoteURL: remoteURL, surfaceMessageID: surfaceMessageID)
    }

    private static let viewportDiagnosticSurfaceID = "gmail-19f4d51b2bdb1300"

    static func gmailViewportDiagnosticTargetIsAvailable(
        surfaceMessageID: String, contentState: String
    ) -> Bool {
        surfaceMessageID == viewportDiagnosticSurfaceID
            && (contentState == "partial" || contentState == "preview")
    }

    func viewportDiagnostic(remoteURL: String, surfaceMessageID: String,
                            expectedThreadCount: Int = 0,
                            commandID suppliedCommandID: String = "",
                            rendererSequence: Int = 0) async -> [String: Any] {
        guard !Self.legacyAutomatedGmailAccessIsDisabled else {
            return ["ok": false, "error": Self.legacyAutomationDisabledError]
        }
        guard !Self.gmailAccessIsSuspended else {
            return ["ok": false, "access_suspended": true, "error": Self.gmailAccessSuspendedError]
        }
        let commandID = suppliedCommandID.isEmpty ? UUID().uuidString.lowercased() : suppliedCommandID
        let attemptID = commandID
        let trigger = "force_refetch_scroll_dry"
        await recordAcquisitionTrace(
            attemptID: attemptID, trigger: trigger, stage: "command_received",
            surfaceMessageID: surfaceMessageID, fields: [
                "command_id": commandID, "renderer_sequence": rendererSequence,
                "command_in_flight": detailInFlight,
                "renderer_expected_count": max(0, expectedThreadCount),
            ]
        )
        guard !detailInFlight else {
            await recordAcquisitionTrace(
                attemptID: attemptID, trigger: trigger, stage: "terminal",
                surfaceMessageID: surfaceMessageID,
                fields: ["outcome": "failed", "terminal_reason": "detail_already_in_flight",
                         "command_id": commandID, "renderer_sequence": rendererSequence,
                         "command_in_flight": true, "ingest_called": false]
            )
            return ["ok": false, "error": "Another Gmail conversation is already loading",
                    "attempt_id": attemptID]
        }
        detailInFlight = true
        defer { detailInFlight = false }

        var candidate: [String: Any] = [:]
        if let response = try? await CoreClient.shared.call(method: "email.surface.message.get", params: [
            "message_id": surfaceMessageID,
        ]) {
            candidate = response["message"] as? [String: Any] ?? [:]
        }
        let persistedHint = candidate["thread_message_count_hint"] as? Int ?? 0
        let hint = max(expectedThreadCount, persistedHint)
        let contentState = candidate["content_state"] as? String ?? ""
        guard Self.gmailViewportDiagnosticTargetIsAvailable(
            surfaceMessageID: surfaceMessageID, contentState: contentState
        ) else {
            await recordAcquisitionTrace(
                attemptID: attemptID, trigger: trigger, stage: "terminal",
                surfaceMessageID: surfaceMessageID,
                fields: ["outcome": "failed", "terminal_reason": "diagnostic_target_unavailable",
                         "expected_thread_count": hint, "ingest_called": false]
            )
            return ["ok": false, "error": "The bounded Gmail diagnostic target is no longer available",
                    "attempt_id": attemptID, "terminal_reason": "diagnostic_target_unavailable"]
        }
        let storedURL = remoteURL.isEmpty ? (candidate["remote_url"] as? String ?? "") : remoteURL
        await recordAcquisitionTrace(
            attemptID: attemptID, trigger: trigger, stage: "route_resolution_started",
            surfaceMessageID: surfaceMessageID,
            fields: ["expected_thread_count": hint,
                     "renderer_expected_count": max(0, expectedThreadCount),
                     "persisted_hint_count": max(0, persistedHint),
                     "effective_hint_count": hint,
                     "expected_count_provenance": Self.expectedCountProvenance(
                        renderer: expectedThreadCount, persisted: persistedHint
                     ), "stored_route_present": !storedURL.isEmpty,
                     "command_id": commandID, "renderer_sequence": rendererSequence,
                     "command_in_flight": false]
        )
        return await acquireConversation(
            remoteURL: storedURL, surfaceMessageID: surfaceMessageID,
            fallbackSender: candidate["sender"] as? String ?? "",
            fallbackSubject: candidate["subject"] as? String ?? "",
            expectedThreadCount: hint, attemptID: attemptID,
            trigger: trigger, routeAttempt: 1,
            comparisonID: attemptID, commandID: commandID
        )
    }

    func identityDiagnostic(surfaceMessageID: String,
                            expectedThreadCount: Int = 0,
                            commandID suppliedCommandID: String = "",
                            rendererSequence: Int = 0) async -> [String: Any] {
        guard !Self.legacyAutomatedGmailAccessIsDisabled else {
            return ["ok": false, "error": Self.legacyAutomationDisabledError]
        }
        guard !Self.gmailAccessIsSuspended else {
            return ["ok": false, "access_suspended": true, "error": Self.gmailAccessSuspendedError]
        }
        let commandID = suppliedCommandID.isEmpty ? UUID().uuidString.lowercased() : suppliedCommandID
        let attemptID = commandID
        let trigger = "force_refetch_identity_dry"
        // The identity comparison owns fresh inbox and detail WKWebViews, so a
        // background Sync cannot replace either document. Serialize only with
        // another explicit detail/diagnostic operation; do not reject merely
        // because startup or periodic Sync is traversing its own views.
        let commandInFlight = detailInFlight
        await recordAcquisitionTrace(
            attemptID: attemptID, trigger: trigger, stage: "command_received",
            surfaceMessageID: surfaceMessageID, fields: [
                "command_id": commandID, "renderer_sequence": rendererSequence,
                "command_in_flight": commandInFlight,
                "renderer_expected_count": max(0, expectedThreadCount),
            ]
        )
        guard !commandInFlight else {
            await recordAcquisitionTrace(
                attemptID: attemptID, trigger: trigger, stage: "terminal",
                surfaceMessageID: surfaceMessageID,
                fields: ["outcome": "failed", "terminal_reason": "diagnostic_already_in_flight",
                         "command_id": commandID, "renderer_sequence": rendererSequence,
                         "command_in_flight": true, "ingest_called": false]
            )
            return ["ok": false, "error": "Another Gmail operation is already loading",
                    "attempt_id": attemptID, "terminal_reason": "diagnostic_already_in_flight"]
        }
        // This diagnostic reads both the inbox and a fresh detail document.
        // detailInFlight prevents a second explicit detail command from
        // overlapping it; Sync remains independent and need not be stopped.
        detailInFlight = true
        defer { detailInFlight = false }

        var candidate: [String: Any] = [:]
        if let response = try? await CoreClient.shared.call(method: "email.surface.message.get", params: [
            "message_id": surfaceMessageID,
        ]) {
            candidate = response["message"] as? [String: Any] ?? [:]
        }
        let persistedHint = candidate["thread_message_count_hint"] as? Int ?? 0
        let hint = max(expectedThreadCount, persistedHint)
        let contentState = candidate["content_state"] as? String ?? ""
        guard Self.gmailViewportDiagnosticTargetIsAvailable(
            surfaceMessageID: surfaceMessageID, contentState: contentState
        ) else {
            await recordAcquisitionTrace(
                attemptID: attemptID, trigger: trigger, stage: "terminal",
                surfaceMessageID: surfaceMessageID,
                fields: ["outcome": "failed", "terminal_reason": "diagnostic_target_unavailable",
                         "expected_thread_count": hint, "ingest_called": false]
            )
            return ["ok": false, "error": "The bounded Gmail diagnostic target is no longer available",
                    "attempt_id": attemptID, "terminal_reason": "diagnostic_target_unavailable"]
        }
        let storedURL = candidate["remote_url"] as? String ?? ""
        guard let stored = URL(string: storedURL), let host = stored.host?.lowercased(),
              Self.allowedHost(host), let storedThreadID = Self.gmailConversationID(from: stored) else {
            await recordAcquisitionTrace(
                attemptID: attemptID, trigger: trigger, stage: "terminal",
                surfaceMessageID: surfaceMessageID,
                fields: ["outcome": "inconclusive", "terminal_reason": "unsafe_or_missing_detail_url",
                         "ingest_called": false]
            )
            return ["ok": false, "error": "The target has no stable Gmail conversation route",
                    "attempt_id": attemptID, "terminal_reason": "unsafe_or_missing_detail_url"]
        }
        await recordAcquisitionTrace(
            attemptID: attemptID, trigger: trigger, stage: "route_resolution_started",
            surfaceMessageID: surfaceMessageID,
            fields: ["expected_thread_count": hint,
                     "renderer_expected_count": max(0, expectedThreadCount),
                     "persisted_hint_count": max(0, persistedHint),
                     "effective_hint_count": hint,
                     "expected_count_provenance": Self.expectedCountProvenance(
                        renderer: expectedThreadCount, persisted: persistedHint
                     ), "stored_route_present": true,
                     "stored_thread_fingerprint": Self.gmailThreadIdentityFingerprint([storedThreadID]),
                     "command_id": commandID, "renderer_sequence": rendererSequence,
                     "command_in_flight": false]
        )

        // Do not reuse the scraper owned by Sync. A dedicated view makes the
        // read-only inbox observation safe even while Sync is loading/searching
        // in its own scraper.
        let inboxView = makeScraperWebView()
        _ = await store.httpCookieStore.allCookies()
        inboxView.load(URLRequest(url: mailboxURL()))
        guard await waitForInbox(inboxView) else {
            await recordAcquisitionTrace(
                attemptID: attemptID, trigger: trigger, stage: "terminal",
                surfaceMessageID: surfaceMessageID,
                fields: ["outcome": "inconclusive", "terminal_reason": "identity_inbox_timeout",
                         "ingest_called": false]
            )
            return ["ok": false, "error": "Gmail inbox did not become ready for identity comparison",
                    "attempt_id": attemptID, "terminal_reason": "identity_inbox_timeout"]
        }

        let inboxValue = await evaluateDetailJavaScript(
            Self.inboxThreadIdentityDiagnosticScript,
            arguments: ["expectedURL": storedURL], view: inboxView,
            attemptID: attemptID, trigger: trigger, surfaceMessageID: surfaceMessageID,
            routeAttempt: 1, commandID: commandID, errorStage: "identity_inbox"
        )
        let inboxObservation = Self.bridgeDictionary(inboxValue) ?? [:]
        let inboxThreadIDs = Self.bridgeStrings(inboxObservation["inbox_thread_ids"], limit: 10)
        let inboxFound = inboxObservation["inbox_target_found"] as? Bool == true
        let inboxComparison = Self.gmailThreadIdentityComparison(
            storedRawID: storedThreadID, inboxRawIDs: inboxThreadIDs,
            detailRawIDs: [], detailRouteRawID: ""
        )
        var inboxFields: [String: Any] = [
            "outcome": inboxFound ? "observed" : "inconclusive",
            "inbox_candidate_row_count": Self.bridgeInt(inboxObservation["inbox_candidate_row_count"]),
            "inbox_matching_row_count": Self.bridgeInt(inboxObservation["inbox_matching_row_count"]),
            "inbox_thread_identity_count": inboxThreadIDs.count,
            "inbox_target_found": inboxFound,
            "inbox_thread_attribute_present": inboxObservation["inbox_thread_attribute_present"] as? Bool ?? false,
            "inbox_thread_href_present": inboxObservation["inbox_thread_href_present"] as? Bool ?? false,
            "command_id": commandID,
        ]
        inboxFields.merge(inboxComparison) { _, new in new }
        await recordAcquisitionTrace(
            attemptID: attemptID, trigger: trigger, stage: "identity_inbox_observation",
            surfaceMessageID: surfaceMessageID, fields: inboxFields
        )
        guard inboxFound, !inboxThreadIDs.isEmpty else {
            await recordAcquisitionTrace(
                attemptID: attemptID, trigger: trigger, stage: "terminal",
                surfaceMessageID: surfaceMessageID,
                fields: ["outcome": "inconclusive", "terminal_reason": "identity_inbox_owner_missing",
                         "inbox_target_found": inboxFound, "inbox_thread_identity_count": inboxThreadIDs.count,
                         "ingest_called": false, "command_id": commandID]
            )
            return ["ok": true, "diagnostic_only": true, "attempt_id": attemptID,
                    "terminal_reason": "identity_inbox_owner_missing"]
        }

        // The direct stored-route comparison proved that the inbox thread ID,
        // detail route ID, and detail `data-thread-perm-id` all differ. That can
        // mean either a wrong direct route or distinct Gmail identity namespaces.
        // Navigate from the exact matched inbox row in this dedicated view and
        // observe only its resulting route/owner identities. The installation-
        // local fingerprints can be compared with the prior direct-route trace.
        return await runExactInboxRowNavigationDiagnostic(
            view: inboxView, remoteURL: storedURL,
            surfaceMessageID: surfaceMessageID, attemptID: attemptID,
            trigger: trigger, commandID: commandID,
            inboxThreadIdentities: inboxThreadIDs,
            storedThreadIdentity: storedThreadID,
            expectedThreadCount: hint
        )
    }

    func countDiagnostic(surfaceMessageID: String,
                         expectedThreadCount: Int = 0,
                         commandID suppliedCommandID: String = "",
                         rendererSequence: Int = 0) async -> [String: Any] {
        guard !Self.legacyAutomatedGmailAccessIsDisabled else {
            return ["ok": false, "error": Self.legacyAutomationDisabledError]
        }
        guard !Self.gmailAccessIsSuspended else {
            return ["ok": false, "access_suspended": true, "error": Self.gmailAccessSuspendedError]
        }
        let commandID = suppliedCommandID.isEmpty ? UUID().uuidString.lowercased() : suppliedCommandID
        let attemptID = commandID
        let trigger = "force_refetch_count_dry"
        let commandInFlight = detailInFlight || syncInFlight
        await recordAcquisitionTrace(
            attemptID: attemptID, trigger: trigger, stage: "command_received",
            surfaceMessageID: surfaceMessageID, fields: [
                "command_id": commandID, "renderer_sequence": rendererSequence,
                "command_in_flight": commandInFlight,
                "renderer_expected_count": max(0, expectedThreadCount),
            ]
        )
        guard !commandInFlight else {
            await recordAcquisitionTrace(
                attemptID: attemptID, trigger: trigger, stage: "terminal",
                surfaceMessageID: surfaceMessageID,
                fields: ["outcome": "failed", "terminal_reason": "diagnostic_already_in_flight",
                         "command_id": commandID, "renderer_sequence": rendererSequence,
                         "command_in_flight": true, "ingest_called": false]
            )
            return ["ok": false, "error": "Another Gmail operation is already loading",
                    "attempt_id": attemptID, "terminal_reason": "diagnostic_already_in_flight"]
        }
        // Own both native Gmail paths so the five-minute timer cannot start Sync
        // while this read-only inbox observation is identifying the exact row.
        detailInFlight = true
        syncInFlight = true
        defer {
            detailInFlight = false
            syncInFlight = false
        }

        var candidate: [String: Any] = [:]
        if let response = try? await CoreClient.shared.call(method: "email.surface.message.get", params: [
            "message_id": surfaceMessageID,
        ]) {
            candidate = response["message"] as? [String: Any] ?? [:]
        }
        let persistedHint = candidate["thread_message_count_hint"] as? Int ?? 0
        let hint = max(expectedThreadCount, persistedHint)
        let contentState = candidate["content_state"] as? String ?? ""
        guard Self.gmailViewportDiagnosticTargetIsAvailable(
            surfaceMessageID: surfaceMessageID, contentState: contentState
        ) else {
            await recordAcquisitionTrace(
                attemptID: attemptID, trigger: trigger, stage: "terminal",
                surfaceMessageID: surfaceMessageID,
                fields: ["outcome": "failed", "terminal_reason": "diagnostic_target_unavailable",
                         "expected_thread_count": hint, "ingest_called": false]
            )
            return ["ok": false, "error": "The bounded Gmail diagnostic target is no longer available",
                    "attempt_id": attemptID, "terminal_reason": "diagnostic_target_unavailable"]
        }
        let storedURL = candidate["remote_url"] as? String ?? ""
        await recordAcquisitionTrace(
            attemptID: attemptID, trigger: trigger, stage: "route_resolution_started",
            surfaceMessageID: surfaceMessageID,
            fields: ["expected_thread_count": hint,
                     "renderer_expected_count": max(0, expectedThreadCount),
                     "persisted_hint_count": max(0, persistedHint),
                     "effective_hint_count": hint,
                     "expected_count_provenance": Self.expectedCountProvenance(
                        renderer: expectedThreadCount, persisted: persistedHint
                     ), "stored_route_present": !storedURL.isEmpty,
                     "command_id": commandID, "renderer_sequence": rendererSequence,
                     "command_in_flight": false]
        )
        guard !storedURL.isEmpty else {
            await recordAcquisitionTrace(
                attemptID: attemptID, trigger: trigger, stage: "terminal",
                surfaceMessageID: surfaceMessageID,
                fields: ["outcome": "inconclusive", "terminal_reason": "unsafe_or_missing_detail_url",
                         "ingest_called": false]
            )
            return ["ok": false, "error": "The target has no stable Gmail conversation route",
                    "attempt_id": attemptID, "terminal_reason": "unsafe_or_missing_detail_url"]
        }

        let view = webView()
        _ = await store.httpCookieStore.allCookies()
        view.load(URLRequest(url: mailboxURL()))
        guard await waitForInbox(view) else {
            await recordAcquisitionTrace(
                attemptID: attemptID, trigger: trigger, stage: "terminal",
                surfaceMessageID: surfaceMessageID,
                fields: ["outcome": "inconclusive", "terminal_reason": "count_inbox_timeout",
                         "ingest_called": false]
            )
            return ["ok": false, "error": "Gmail inbox did not become ready for the count observation",
                    "attempt_id": attemptID, "terminal_reason": "count_inbox_timeout"]
        }

        let value: Any?
        do {
            value = try await view.callAsyncJavaScript(
                Self.inboxCountDiagnosticScript,
                arguments: ["expectedURL": storedURL], contentWorld: .page
            )
        } catch {
            await recordAcquisitionTrace(
                attemptID: attemptID, trigger: trigger, stage: "javascript_error",
                surfaceMessageID: surfaceMessageID,
                fields: Self.gmailAcquisitionErrorFields(error, stage: "count_observation")
            )
            await recordAcquisitionTrace(
                attemptID: attemptID, trigger: trigger, stage: "terminal",
                surfaceMessageID: surfaceMessageID,
                fields: ["outcome": "inconclusive", "terminal_reason": "count_observation_failed",
                         "ingest_called": false]
            )
            return ["ok": false, "error": "Gmail count observation failed",
                    "attempt_id": attemptID, "terminal_reason": "count_observation_failed"]
        }
        let observation = Self.bridgeDictionary(value) ?? [:]
        var fields: [String: Any] = [
            "outcome": "observed",
            "expected_thread_count": hint,
            "inbox_candidate_row_count": Self.bridgeInt(observation["inbox_candidate_row_count"]),
            "inbox_matching_row_count": Self.bridgeInt(observation["inbox_matching_row_count"]),
            "inbox_primary_count": Self.bridgeInt(observation["inbox_primary_count"]),
            "inbox_dedicated_count": Self.bridgeInt(observation["inbox_dedicated_count"]),
            "inbox_sender_suffix_count": Self.bridgeInt(observation["inbox_sender_suffix_count"]),
            "inbox_aria_count": Self.bridgeInt(observation["inbox_aria_count"]),
            "inbox_selected_count": Self.bridgeInt(observation["inbox_selected_count"]),
            "inbox_target_found": observation["inbox_target_found"] as? Bool ?? false,
            "inbox_thread_attribute_match": observation["inbox_thread_attribute_match"] as? Bool ?? false,
            "inbox_href_match": observation["inbox_href_match"] as? Bool ?? false,
            "inbox_primary_is_dedicated": observation["inbox_primary_is_dedicated"] as? Bool ?? false,
            "inbox_primary_is_semantic": observation["inbox_primary_is_semantic"] as? Bool ?? false,
            "inbox_dedicated_present": observation["inbox_dedicated_present"] as? Bool ?? false,
            "inbox_sender_suffix_present": observation["inbox_sender_suffix_present"] as? Bool ?? false,
            "inbox_aria_present": observation["inbox_aria_present"] as? Bool ?? false,
            "inbox_count_sources_agree": observation["inbox_count_sources_agree"] as? Bool ?? false,
            "inbox_selected_matches_hint": Self.bridgeInt(observation["inbox_selected_count"]) == hint,
            "command_id": commandID,
        ]
        await recordAcquisitionTrace(
            attemptID: attemptID, trigger: trigger, stage: "count_observation",
            surfaceMessageID: surfaceMessageID, fields: fields
        )
        let found = observation["inbox_target_found"] as? Bool == true
        let terminalReason = found ? "count_dry_observed" : "count_target_not_found"
        fields = ["outcome": found ? "observed" : "inconclusive",
                  "terminal_reason": terminalReason, "ingest_called": false,
                  "inbox_target_found": found,
                  "inbox_selected_count": Self.bridgeInt(observation["inbox_selected_count"]),
                  "expected_thread_count": hint, "command_id": commandID]
        await recordAcquisitionTrace(
            attemptID: attemptID, trigger: trigger, stage: "terminal",
            surfaceMessageID: surfaceMessageID, fields: fields
        )
        return ["ok": found, "diagnostic_only": true, "attempt_id": attemptID,
                "terminal_reason": terminalReason]
    }

    func forceRefetch(remoteURL: String, surfaceMessageID: String,
                      expectedThreadCount: Int = 0, commandID suppliedCommandID: String = "",
                      rendererSequence: Int = 0) async -> [String: Any] {
        guard !Self.legacyAutomatedGmailAccessIsDisabled else {
            return ["ok": false, "error": Self.legacyAutomationDisabledError]
        }
        guard !Self.gmailAccessIsSuspended else {
            return ["ok": false, "access_suspended": true, "error": Self.gmailAccessSuspendedError]
        }
        let commandID = suppliedCommandID.isEmpty ? UUID().uuidString.lowercased() : suppliedCommandID
        let attemptID = commandID
        await recordAcquisitionTrace(
            attemptID: attemptID, trigger: "force_refetch", stage: "command_received",
            surfaceMessageID: surfaceMessageID, fields: [
                "command_id": commandID, "renderer_sequence": rendererSequence,
                "command_in_flight": detailInFlight, "renderer_expected_count": max(0, expectedThreadCount),
            ]
        )
        guard !detailInFlight else {
            await recordAcquisitionTrace(
                attemptID: attemptID, trigger: "force_refetch", stage: "terminal",
                surfaceMessageID: surfaceMessageID,
                fields: ["outcome": "failed", "terminal_reason": "detail_already_in_flight",
                         "command_id": commandID, "renderer_sequence": rendererSequence,
                         "command_in_flight": true, "ingest_called": false]
            )
            return ["ok": false, "error": "Another Gmail conversation is already loading",
                    "attempt_id": attemptID]
        }
        detailInFlight = true
        defer { detailInFlight = false }

        // A Surface URL can be a Gmail message route masquerading as a thread
        // route. Force refetch must not blindly repeat that known-bad URL. Load
        // the durable row, try its route first, then recover the real thread by
        // sender/subject/date exactly as normal Sync does.
        var candidate: [String: Any] = [:]
        if let response = try? await CoreClient.shared.call(method: "email.surface.message.get", params: [
            "message_id": surfaceMessageID,
        ]) {
            candidate = response["message"] as? [String: Any] ?? [:]
        }
        let hint = max(expectedThreadCount, candidate["thread_message_count_hint"] as? Int ?? 0)
        let storedURL = remoteURL.isEmpty ? (candidate["remote_url"] as? String ?? "") : remoteURL
        await recordAcquisitionTrace(
            attemptID: attemptID, trigger: "force_refetch", stage: "route_resolution_started",
            surfaceMessageID: surfaceMessageID,
            fields: ["expected_thread_count": hint, "renderer_expected_count": max(0, expectedThreadCount),
                     "persisted_hint_count": max(0, candidate["thread_message_count_hint"] as? Int ?? 0),
                     "effective_hint_count": hint, "expected_count_provenance": Self.expectedCountProvenance(
                        renderer: expectedThreadCount, persisted: candidate["thread_message_count_hint"] as? Int ?? 0
                     ), "stored_route_present": !storedURL.isEmpty, "command_id": commandID,
                     "renderer_sequence": rendererSequence, "command_in_flight": false]
        )
        // Force refetch is explicitly allowed to spend extra work validating
        // identity. Search first to replace legacy message-ID routes with the
        // current Gmail thread route even when the legacy route happens to open
        // one body and would otherwise produce a false success.
        let recoveredURL = await resolveCandidateURL(candidate, in: webView())
        let preferredURL = recoveredURL ?? storedURL
        var routeFields = Self.gmailRouteTraceMetadata(preferredURL)
        routeFields["recovered"] = recoveredURL != nil
        routeFields["route_changed"] = recoveredURL != nil && recoveredURL != storedURL
        await recordAcquisitionTrace(
            attemptID: attemptID, trigger: "force_refetch", stage: "route_resolved",
            surfaceMessageID: surfaceMessageID, fields: routeFields
        )
        // Every other selected Force refetch first runs a route-only no-op
        // control, then the unchanged production attempt.
        let noOpAttemptID = UUID().uuidString.lowercased()
        _ = await acquireConversation(
            remoteURL: preferredURL, surfaceMessageID: surfaceMessageID,
            fallbackSender: candidate["sender"] as? String ?? "",
            fallbackSubject: candidate["subject"] as? String ?? "",
            expectedThreadCount: hint, attemptID: noOpAttemptID,
            trigger: "force_refetch_noop_prepare", routeAttempt: 1,
            comparisonID: attemptID, commandID: commandID
        )
        var result = await acquireConversation(
            remoteURL: preferredURL, surfaceMessageID: surfaceMessageID,
            fallbackSender: candidate["sender"] as? String ?? "",
            fallbackSubject: candidate["subject"] as? String ?? "",
            expectedThreadCount: hint, attemptID: attemptID,
            trigger: "force_refetch", routeAttempt: 1,
            comparisonID: attemptID, commandID: commandID
        )
        if result["ok"] as? Bool == true { return result }
        if preferredURL != storedURL, !storedURL.isEmpty {
            result = await acquireConversation(
                remoteURL: storedURL, surfaceMessageID: surfaceMessageID,
                fallbackSender: candidate["sender"] as? String ?? "",
                fallbackSubject: candidate["subject"] as? String ?? "",
                expectedThreadCount: hint, attemptID: attemptID,
                trigger: "force_refetch", routeAttempt: 2,
                comparisonID: attemptID, commandID: commandID
            )
        }
        return result
    }

    private func resolveMissingConversationURLs(_ messages: [[String: Any]],
                                                in view: WKWebView) async -> [[String: Any]] {
        var resolved = messages
        for index in resolved.indices where (resolved[index]["remote_url"] as? String ?? "").isEmpty {
            let rowIndex = resolved[index]["row_index"] as? Int ?? index
            let subject = resolved[index]["subject"] as? String ?? ""
            let before = view.url?.absoluteString ?? ""
            let clicked = (try? await view.callAsyncJavaScript(
                Self.openInboxRowScript,
                arguments: ["rowIndex": rowIndex, "expectedSubject": subject],
                contentWorld: .page
            )) as? Bool ?? false
            guard clicked else { continue }

            var detailURL: URL?
            for _ in 0..<60 {
                if let current = view.url,
                   current.absoluteString != before,
                   let host = current.host?.lowercased(), Self.allowedHost(host),
                   Self.gmailConversationID(from: current) != nil {
                    detailURL = current
                    break
                }
                try? await Task.sleep(nanoseconds: 200_000_000)
            }
            if let detailURL, let stableID = Self.gmailConversationID(from: detailURL) {
                resolved[index]["remote_url"] = detailURL.absoluteString
                resolved[index]["conversation_id"] = stableID
                resolved[index]["message_id"] = stableID
                resolved[index]["id"] = "gmail-" + stableID.replacingOccurrences(
                    of: "[^a-zA-Z0-9_-]", with: "-", options: .regularExpression
                )
            }

            // A row click leaves the scraper on the conversation. Restore the
            // inbox before resolving the next row and before full acquisition.
            view.load(URLRequest(url: mailboxURL()))
            guard await waitForInbox(view) else { break }
        }

        // A synthetic row may resolve to an ID already exposed by another DOM
        // path. Keep one canonical row, preferring the one with a detail URL.
        var byID: [String: [String: Any]] = [:]
        var order: [String] = []
        for message in resolved {
            let id = message["id"] as? String ?? ""
            if byID[id] == nil { order.append(id) }
            if byID[id] == nil || (byID[id]?["remote_url"] as? String ?? "").isEmpty {
                byID[id] = message
            }
        }
        return order.compactMap { byID[$0] }
    }

    private func resolveCandidateURL(_ candidate: [String: Any], in view: WKWebView) async -> String? {
        let subject = (candidate["subject"] as? String ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        let sender = candidate["sender"] as? String ?? ""
        // Preserve the 64-bit epoch value across every CoreClient JSON bridge
        // representation. The sender/day search is the reliable first recovery
        // route for punctuation-heavy or truncated Gmail list subjects.
        let receivedAt = Self.bridgeTimestampMilliseconds(candidate["date_received"])
        guard !subject.isEmpty, Self.gmailSearchURL(
            mailboxURL: mailboxURL(), subject: subject, sender: sender, dateReceived: receivedAt
        ) != nil else { return nil }

        // Gmail search syntax and tokenization vary between Workspace builds.
        // Prefer the narrow sender/day query, then retry with exact-subject
        // routes. The visible row is identity-checked before every click, so the
        // broader fallback cannot silently attach an unrelated conversation.
        let searches = Self.gmailCandidateSearchURLs(
            mailboxURL: mailboxURL(), subject: subject, sender: sender,
            dateReceived: receivedAt
        )
        let providerMessageID = Self.gmailProviderMessageID(from: candidate)
        for searchURL in searches {
            view.load(URLRequest(url: searchURL))
            // Require this exact search route before selecting a result. Gmail
            // keeps the prior DOM alive while a hash navigation commits, so a
            // generic mailbox probe can inspect and click the previous query.
            guard await waitForGmailSurface(view, expectedURL: searchURL) else { continue }
            let before = view.url?.absoluteString ?? ""

            // A Gmail search route becomes visible before its result rows are
            // inserted. `expectedSurfaceProbe` deliberately admits the stable
            // main surface, so selecting only once here raced the async row
            // render and made every recovery silently return nil. Poll for one
            // identity-matching row while the same search document settles.
            var selection = ""
            for _ in 0..<60 {
                selection = (try? await view.callAsyncJavaScript(
                    Self.openInboxRowScript,
                    arguments: [
                        "rowIndex": 0, "expectedSubject": subject, "expectedSender": sender,
                        "expectedTimestamp": receivedAt,
                        "expectedProviderMessageID": providerMessageID,
                        "rejectedConversationURL": candidate["remote_url"] as? String ?? "",
                        "requireIdentityMatch": true,
                        // Search results often expose a stable thread attribute even
                        // when Gmail suppresses the anchor href. Return that route
                        // directly instead of depending only on click navigation.
                        "returnConversationURL": true,
                    ],
                    contentWorld: .page
                )) as? String ?? ""
                if !selection.isEmpty { break }
                if Self.isExplicitGoogleLoginURL(view.url) { break }
                try? await Task.sleep(nanoseconds: 250_000_000)
            }
            if selection != "clicked", let selectedURL = URL(string: selection),
               Self.gmailConversationID(from: selectedURL) != nil {
                return selectedURL.absoluteString
            }
            guard selection == "clicked" else { continue }

            for _ in 0..<60 {
                if let current = view.url,
                   current.absoluteString != before,
                   Self.gmailConversationID(from: current) != nil {
                    return current.absoluteString
                }
                try? await Task.sleep(nanoseconds: 200_000_000)
            }
        }
        return nil
    }

    static func gmailProviderMessageID(from candidate: [String: Any]) -> String {
        for key in ["provider_message_id", "message_id"] {
            let value = (candidate[key] as? String ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
            if !value.isEmpty { return value }
        }
        // Acquisition candidates are Surface projections and currently expose
        // `surface_message_id`, not `message_id`. Canonical Gmail preview rows
        // use gmail-<provider-message-id>; recover that exact identity rather
        // than falling back unnecessarily to display subject/sender matching.
        let surfaceID = (candidate["surface_message_id"] as? String ?? "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        guard surfaceID.lowercased().hasPrefix("gmail-"), surfaceID.count > 6 else { return "" }
        return String(surfaceID.dropFirst(6))
    }

    static func gmailCandidateSearchURLs(mailboxURL: URL, subject: String, sender: String,
                                         dateReceived: Int64) -> [URL] {
        let variants = [
            gmailSearchURL(mailboxURL: mailboxURL, subject: subject, sender: sender,
                           dateReceived: dateReceived),
            gmailSearchURL(mailboxURL: mailboxURL, subject: subject, sender: sender),
            gmailSearchURL(mailboxURL: mailboxURL, subject: subject, sender: ""),
        ].compactMap { $0 }
        var seen = Set<String>()
        return variants.filter { seen.insert($0.absoluteString).inserted }
    }

    static func gmailSearchURL(mailboxURL: URL, subject: String, sender: String,
                               dateReceived: Int64 = 0) -> URL? {
        let trimmedSubject = subject.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedSubject.isEmpty, let host = mailboxURL.host?.lowercased(), allowedHost(host) else { return nil }
        let mailbox = sender.split(whereSeparator: { $0.isWhitespace || $0 == "<" || $0 == ">" })
            .map({ $0.trimmingCharacters(in: CharacterSet(charactersIn: "\"(),;")) })
            .first(where: { $0.contains("@") })

        var terms: [String] = []
        if let mailbox { terms.append("from:\(mailbox)") }
        if dateReceived > 0 {
            let calendar = Calendar(identifier: .gregorian)
            let received = Date(timeIntervalSince1970: Double(dateReceived) / 1000.0)
            let start = calendar.startOfDay(for: received)
            let end = calendar.date(byAdding: .day, value: 1, to: start) ?? start.addingTimeInterval(86_400)
            let formatter = DateFormatter()
            formatter.calendar = calendar
            formatter.locale = Locale(identifier: "en_US_POSIX")
            formatter.timeZone = .current
            formatter.dateFormat = "yyyy/MM/dd"
            terms.append("after:\(formatter.string(from: start))")
            terms.append("before:\(formatter.string(from: end))")
        } else {
            // Preserve the exact-subject route for callers without discovery
            // time. Runtime recovery deliberately uses sender + received day,
            // then validates the visible subject: exact Gmail subject queries
            // were returning no rows for many punctuation-heavy legacy values.
            let escapedSubject = trimmedSubject.replacingOccurrences(of: "\\", with: "\\\\")
                .replacingOccurrences(of: "\"", with: "\\\"")
            terms.insert("subject:\"\(escapedSubject)\"", at: 0)
        }
        guard !terms.isEmpty else { return nil }
        let query = terms.joined(separator: " ")
        var allowed = CharacterSet.urlPathAllowed
        allowed.remove(charactersIn: "/?#")
        guard let encoded = query.addingPercentEncoding(withAllowedCharacters: allowed) else { return nil }
        var components = URLComponents(url: mailboxURL, resolvingAgainstBaseURL: false)
        components?.percentEncodedFragment = "search/\(encoded)"
        return components?.url
    }

    static func gmailThreadCountHint(countText: String, senderCellText: String,
                                     ariaLabel: String = "") -> Int {
        let candidates = [countText, senderCellText, ariaLabel]
        let patterns = [
            #"(?:^|\()\s*(\d{1,4})\s*\)?$"#,
            #"(?:,|\s)\s*\(?(\d{1,4})\)?\s*$"#,
            #"(?:conversation|thread)[^0-9]{0,20}(\d{1,4})\s*(?:messages?|emails?)"#,
        ]
        for (value, pattern) in zip(candidates, patterns) {
            guard let expression = try? NSRegularExpression(pattern: pattern, options: [.caseInsensitive]),
                  let match = expression.firstMatch(
                    in: value, range: NSRange(value.startIndex..., in: value)
                  ), match.numberOfRanges > 1,
                  let range = Range(match.range(at: 1), in: value),
                  let count = Int(value[range]), count > 0 else { continue }
            return count
        }
        return 1
    }

    static func gmailConversationID(from url: URL) -> String? {
        guard let host = url.host?.lowercased(), allowedHost(host),
              let fragment = url.fragment, !fragment.isEmpty else { return nil }
        let path = fragment.split(separator: "?", maxSplits: 1).first.map(String.init) ?? fragment
        let parts = path.split(separator: "/", omittingEmptySubsequences: true)
        guard let route = parts.first.map({ String($0).lowercased() }) else { return nil }
        // `#search/<query>` is a search page; only
        // `#search/<query>/<thread-id>` is a conversation. Previously the query
        // was accepted as an ID, allowing a hash normalization with no row click
        // to masquerade as successful URL recovery.
        if route == "search" {
            guard parts.count >= 3 else { return nil }
        } else {
            guard ["inbox", "all"].contains(route), parts.count >= 2 else { return nil }
        }
        let candidate = String(parts.last!)
        guard !candidate.isEmpty else { return nil }
        return candidate.removingPercentEncoding ?? candidate
    }

    private static func shortFingerprint(_ value: String) -> String {
        let digest = SHA256.hash(data: Data(value.utf8))
        return digest.prefix(8).map { String(format: "%02x", $0) }.joined()
    }

    private static func gmailAccountPath(from url: URL) -> String {
        let pathParts = url.path.split(separator: "/", omittingEmptySubsequences: true)
        guard pathParts.count >= 3, pathParts[0] == "mail", pathParts[1] == "u",
              Int(pathParts[2]) != nil else { return "" }
        return "/mail/u/" + pathParts[2]
    }

    private static func gmailConversationFingerprint(from url: URL) -> String {
        guard let conversationID = gmailConversationID(from: url) else { return "" }
        // Include the non-sensitive account path so identical provider IDs in
        // different signed-in Gmail accounts are not treated as one identity.
        return shortFingerprint(gmailAccountPath(from: url) + "\u{0}" + conversationID)
    }

    static func gmailDOMIdentityFingerprint(_ rawIDs: [String]) -> String {
        let ids = Set(rawIDs.compactMap { raw -> String? in
            let value = raw.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !value.isEmpty else { return nil }
            return String(value.prefix(300))
        })
        guard !ids.isEmpty else { return "" }
        return shortFingerprint(ids.sorted().joined(separator: "\u{0}"))
    }

    private static func diagnosticFingerprintKey() -> SymmetricKey {
        let defaultsKey = "arbol.willo.gmail-diagnostic-fingerprint-key-v1"
        if let encoded = UserDefaults.standard.string(forKey: defaultsKey),
           let data = Data(base64Encoded: encoded), data.count == 32 {
            return SymmetricKey(data: data)
        }
        let key = SymmetricKey(size: .bits256)
        let data = key.withUnsafeBytes { Data($0) }
        UserDefaults.standard.set(data.base64EncodedString(), forKey: defaultsKey)
        return key
    }

    static func gmailDiagnosticFingerprint(_ rawSeed: String) -> String {
        guard !rawSeed.isEmpty else { return "" }
        let code = HMAC<SHA256>.authenticationCode(
            for: Data(rawSeed.utf8), using: diagnosticFingerprintKey()
        )
        return code.prefix(8).map { String(format: "%02x", $0) }.joined()
    }

    private static func normalizedGmailThreadIdentity(_ raw: String) -> String? {
        var value = (raw.removingPercentEncoding ?? raw)
            .trimmingCharacters(in: .whitespacesAndNewlines)
        while value.hasPrefix("#") { value.removeFirst() }
        let lower = value.lowercased()
        for prefix in ["thread-f:", "thread-a:"] where lower.hasPrefix(prefix) {
            value = String(value.dropFirst(prefix.count))
            break
        }
        value = value.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !value.isEmpty else { return nil }
        return String(value.prefix(300))
    }

    static func gmailThreadIdentityFingerprint(_ rawIDs: [String]) -> String {
        let values = Set(rawIDs.compactMap(normalizedGmailThreadIdentity))
        guard !values.isEmpty else { return "" }
        return gmailDiagnosticFingerprint(values.sorted().joined(separator: "\u{0}"))
    }

    static func gmailThreadIdentityComparison(storedRawID: String,
                                              inboxRawIDs: [String],
                                              detailRawIDs: [String],
                                              detailRouteRawID: String) -> [String: Any] {
        let stored = Set([storedRawID].compactMap(normalizedGmailThreadIdentity))
        let inbox = Set(inboxRawIDs.compactMap(normalizedGmailThreadIdentity))
        let detail = Set(detailRawIDs.compactMap(normalizedGmailThreadIdentity))
        let detailRoute = Set([detailRouteRawID].compactMap(normalizedGmailThreadIdentity))
        let intersects: (Set<String>, Set<String>) -> Bool = { left, right in
            !left.isEmpty && !right.isEmpty && !left.isDisjoint(with: right)
        }
        return [
            "stored_thread_fingerprint": gmailThreadIdentityFingerprint(Array(stored)),
            "inbox_thread_fingerprint": gmailThreadIdentityFingerprint(Array(inbox)),
            "detail_thread_fingerprint": gmailThreadIdentityFingerprint(Array(detail)),
            "detail_route_thread_fingerprint": gmailThreadIdentityFingerprint(Array(detailRoute)),
            "stored_thread_identity_present": !stored.isEmpty,
            "inbox_thread_identity_present": !inbox.isEmpty,
            "detail_thread_identity_present": !detail.isEmpty,
            "detail_route_thread_identity_present": !detailRoute.isEmpty,
            "stored_inbox_thread_identity_matches": intersects(stored, inbox),
            "inbox_detail_thread_identity_matches": intersects(inbox, detail),
            "inbox_detail_route_identity_matches": intersects(inbox, detailRoute),
            "detail_owner_route_identity_matches": intersects(detail, detailRoute),
        ]
    }

    static func gmailAcquisitionErrorFields(_ error: Error, stage: String) -> [String: Any] {
        let value = error as NSError
        let domainKind: String
        if value.domain == WKError.errorDomain { domainKind = "webkit" }
        else if value.domain == NSURLErrorDomain { domainKind = "url" }
        else if value.domain == NSCocoaErrorDomain { domainKind = "cocoa" }
        else { domainKind = "other" }
        return [
            "error_domain_kind": domainKind, "error_stage": stage,
            "error_code": min(abs(value.code), 1_000_000),
            "error_code_negative": value.code < 0,
        ]
    }

    static func gmailDetailRouteGuardAllows(routeMatches: Bool, accountPathMatches: Bool,
                                            domIdentityMatches: Bool) -> Bool {
        accountPathMatches && (routeMatches || domIdentityMatches)
    }

    static func expectedCountProvenance(renderer: Int, persisted: Int) -> String {
        let renderer = max(0, renderer)
        let persisted = max(0, persisted)
        if renderer == 0 && persisted == 0 { return "none" }
        if persisted == 0 { return "renderer" }
        if renderer == 0 { return "persisted" }
        if renderer == persisted { return "both_equal" }
        return renderer > persisted ? "max_renderer" : "max_persisted"
    }

    static func gmailRouteTraceMetadata(_ rawURL: String) -> [String: Any] {
        guard let url = URL(string: rawURL), let host = url.host?.lowercased(), allowedHost(host) else {
            return ["route_kind": "invalid", "route_fingerprint": "",
                    "conversation_fingerprint": ""]
        }
        let fragment = url.fragment ?? ""
        let parts = fragment.split(separator: "/", omittingEmptySubsequences: true)
        let rawRouteKind = parts.first.map { String($0).lowercased() } ?? "none"
        // A malformed hash can put arbitrary mailbox/search text in the first
        // segment. Emit only a fixed enum; never echo that segment to Core.
        let routeKind = ["inbox", "all", "search", "sent", "drafts", "spam", "trash", "none"]
            .contains(rawRouteKind) ? rawRouteKind : "other"
        let accountPath = gmailAccountPath(from: url)
        // The route can contain a mailbox, subject, or Gmail message/thread ID.
        // Emit only short one-way fingerprints so attempts can be compared
        // without putting route contents or search terms in the Log Journal.
        let fingerprint = shortFingerprint(url.path + "#" + fragment)
        return ["route_kind": routeKind, "account_path": accountPath,
                "route_fingerprint": fingerprint,
                "conversation_fingerprint": gmailConversationFingerprint(from: url)]
    }

    static func gmailPostPrepareRouteTraceMetadata(expectedURL: String,
                                                    currentURL: String) -> [String: Any] {
        var metadata = gmailRouteTraceMetadata(currentURL)
        let expected = URL(string: expectedURL)
        let current = URL(string: currentURL)
        let expectedFingerprint = expected.map(gmailConversationFingerprint(from:)) ?? ""
        let currentFingerprint = current.map(gmailConversationFingerprint(from:)) ?? ""
        metadata["conversation_identity_matches"] = !expectedFingerprint.isEmpty
            && expectedFingerprint == currentFingerprint
        return metadata
    }

    private static func bridgeDictionary(_ value: Any?) -> [String: Any]? {
        if let dictionary = value as? [String: Any] { return dictionary }
        guard let dictionary = value as? NSDictionary else { return nil }
        var result: [String: Any] = [:]
        for (key, value) in dictionary {
            if let key = key as? String { result[key] = value }
        }
        return result
    }

    private static func bridgeDictionaries(_ value: Any?) -> [[String: Any]]? {
        guard let values = value as? [Any] else { return nil }
        var result: [[String: Any]] = []
        for value in values {
            guard let dictionary = bridgeDictionary(value) else { return nil }
            result.append(dictionary)
        }
        return result
    }

    private static func bridgeTypeName(_ value: Any?) -> String {
        guard let value else { return "nil" }
        return String(reflecting: Swift.type(of: value)).prefix(120).description
    }

    private static func bridgeStrings(_ value: Any?, limit: Int = 500) -> [String] {
        guard let values = value as? [Any] else { return [] }
        return values.prefix(max(0, limit)).compactMap { $0 as? String }
    }

    private static func bridgeInt(_ value: Any?, default fallback: Int = 0) -> Int {
        if let value = value as? Int { return value }
        if let value = value as? NSNumber { return value.intValue }
        return fallback
    }

    /// Decode a non-negative epoch-millisecond value without narrowing it
    /// through NSNumber.intValue. CoreClient JSON values can arrive as Int,
    /// Int64, NSNumber, or a decimal string depending on the bridge path.
    static func bridgeTimestampMilliseconds(_ value: Any?) -> Int64 {
        let decoded: Int64?
        if let value = value as? Int64 { decoded = value }
        else if let value = value as? Int { decoded = Int64(value) }
        else if let value = value as? NSNumber { decoded = value.int64Value }
        else if let value = value as? String { decoded = Int64(value) }
        else { decoded = nil }
        return max(0, decoded ?? 0)
    }

    static func gmailAcquisitionTracePayload(attemptID: String, trigger: String, stage: String,
                                             surfaceMessageID: String,
                                             fields: [String: Any] = [:]) -> [String: Any] {
        var candidate: [String: Any] = [
            "attempt_id": attemptID, "trigger": trigger, "stage": stage,
            "surface_message_id": surfaceMessageID,
        ]
        candidate.merge(fields) { _, new in new }

        // Enforce the privacy boundary in Willo before the RPC crosses the
        // process boundary. Core repeats the same whitelist as defense in depth.
        let stringFields: Set<String> = [
            "attempt_id", "comparison_id", "trigger", "stage", "outcome",
            "surface_message_id", "route_kind", "account_path", "route_fingerprint",
            "conversation_fingerprint", "dom_identity_fingerprint", "command_id",
            "snapshot_fingerprint", "candidate_fingerprint", "message_identity_fingerprint",
            "content_fingerprint", "owner_fingerprint", "bridge_type", "message_shape",
            "terminal_reason", "control_kinds", "navigation_event", "error_domain_kind",
            "error_stage", "snapshot_label", "candidate_kind", "native_id_kind",
            "owner_kind", "tag_kind", "role_kind", "expected_count_provenance",
            "item_outcome", "scroll_container_kind",
            "stored_thread_fingerprint", "inbox_thread_fingerprint",
            "detail_thread_fingerprint", "detail_route_thread_fingerprint",
            "print_document_kind",
        ]
        let numberFields: Set<String> = [
            "route_attempt", "expected_thread_count", "probe_iterations", "card_count",
            "body_count", "stack_count", "explicit_stack_count", "kq_stack_count",
            "native_id_count", "zero_size_count", "clicked_total", "clicked_history_stack",
            "clicked_explicit_stack", "clicked_kq_stack", "clicked_message_header",
            "clicked_trimmed_content", "js_message_count", "swift_message_count",
            "capture_count", "dropped_sender_count", "expected_message_count",
            "collapsed_message_count", "collapsed_card_count",
            "unresolved_explicit_stack_count", "unresolved_kq_stack_count",
            "accepted_count", "rejected_count", "ignored_count", "renderer_expected_count",
            "persisted_hint_count", "effective_hint_count", "renderer_sequence",
            "document_generation", "requested_document_generation", "probe_evaluation_count",
            "elapsed_ms", "snapshot_sequence", "mutation_count",
            "mutation_delta", "unique_card_count", "unique_body_owner_count",
            "unique_native_id_count", "raw_kq_count", "qualifying_kq_count",
            "adx_count", "trimmed_control_count", "bodyless_card_count",
            "invisible_count", "dry_message_count", "duplicate_body_count",
            "candidate_index", "candidate_count", "text_length", "html_length",
            "trimmed_count", "ancestor_depth", "width_bucket", "height_bucket",
            "javascript_error_count", "error_code", "item_index",
            "scroll_step", "scroll_target_percent", "scroll_position_percent",
            "scroll_extent_bucket", "viewport_height_bucket",
            "cumulative_unique_native_id_count", "cumulative_snapshot_count",
            "inbox_candidate_row_count", "inbox_matching_row_count", "inbox_primary_count",
            "inbox_dedicated_count", "inbox_sender_suffix_count", "inbox_aria_count",
            "inbox_selected_count", "inbox_thread_identity_count",
            "detail_thread_identity_count", "detail_thread_owner_count",
            "history_control_count", "history_raw_child_count",
            "history_visible_child_count", "history_numeric_child_count",
            "history_first_numeric_control_count", "history_semantic_child_count",
            "history_message_semantic_child_count", "history_history_semantic_child_count",
            "structure_sender_node_count", "structure_visible_sender_node_count",
            "structure_date_node_count", "structure_visible_date_node_count",
            "structure_header_node_count", "structure_visible_header_node_count",
            "structure_owner_count", "structure_visible_owner_count",
            "structure_known_card_owner_count", "structure_native_owner_count",
            "structure_body_owner_count", "structure_unrecognized_owner_count",
            "structure_unowned_sender_count",
            "print_action_candidate_count", "print_section_count",
            "print_native_owner_count", "print_header_group_count",
            "print_body_candidate_count", "print_menu_candidate_count",
            "print_menu_clicked_count",
            "materialization_initial_candidate_count", "materialization_initial_body_count",
            "materialization_initial_bodyless_count", "materialization_final_candidate_count",
            "materialization_final_body_count", "materialization_final_bodyless_count",
            "message_header_click_attempt_count",
            "expand_all_candidate_count", "stabilization_samples",
        ]
        let boolFields: Set<String> = [
            "stored_route_present", "recovered", "route_changed", "probe_ready",
            "explicit_login", "route_matches", "account_path_matches",
            "conversation_identity_matches", "dom_identity_matches",
            "preparation_enabled", "ingest_called", "command_in_flight",
            "stable_with_previous", "native_id_present", "sender_present",
            "date_present", "subject_present", "body_present", "body_visible",
            "clipped", "inside_body", "inside_card", "has_adx",
            "has_numeric_label", "visible", "error_code_negative",
            "requested_navigation_returned", "requested_navigation_event", "navigation_eligible",
            "scroll_container_found", "scroll_changed", "scroll_restored",
            "inbox_target_found", "inbox_thread_attribute_match", "inbox_href_match",
            "inbox_primary_is_dedicated", "inbox_primary_is_semantic",
            "inbox_dedicated_present", "inbox_sender_suffix_present", "inbox_aria_present",
            "inbox_count_sources_agree", "inbox_selected_matches_hint",
            "stored_thread_identity_present", "inbox_thread_identity_present",
            "detail_thread_identity_present", "detail_route_thread_identity_present",
            "stored_inbox_thread_identity_matches", "inbox_detail_thread_identity_matches",
            "inbox_detail_route_identity_matches", "detail_owner_route_identity_matches",
            "inbox_thread_attribute_present", "inbox_thread_href_present",
            "history_child_present", "history_control_matches_hint",
            "history_control_plus_visible_matches_hint",
            "print_action_clicked", "print_popup_created", "print_document_ready",
            "print_invocation_suppressed", "print_menu_opened",
            "expand_all_clicked",
        ]
        var safe: [String: Any] = [:]
        for key in stringFields {
            guard let value = candidate[key] as? String else { continue }
            safe[key] = String(value.prefix(200))
        }
        for key in numberFields {
            guard let raw = candidate[key], !(raw is Bool) else { continue }
            let value: Int?
            if let integer = raw as? Int {
                value = integer
            } else if let number = raw as? NSNumber {
                value = number.intValue
            } else {
                value = nil
            }
            if let value { safe[key] = max(0, min(value, 1_000_000)) }
        }
        for key in boolFields {
            if let value = candidate[key] as? Bool { safe[key] = value }
        }

        let routeKinds: Set<String> = [
            "", "invalid", "none", "other", "inbox", "all", "search", "sent",
            "drafts", "spam", "trash",
        ]
        if let routeKind = safe["route_kind"] as? String, !routeKinds.contains(routeKind) {
            safe.removeValue(forKey: "route_kind")
        }
        if let accountPath = safe["account_path"] as? String, !accountPath.isEmpty {
            let prefix = "/mail/u/"
            let suffix = accountPath.hasPrefix(prefix) ? String(accountPath.dropFirst(prefix.count)) : ""
            if suffix.isEmpty || suffix.contains(where: { !$0.isNumber }) {
                safe.removeValue(forKey: "account_path")
            }
        }
        for key in [
            "route_fingerprint", "conversation_fingerprint", "dom_identity_fingerprint",
            "snapshot_fingerprint", "candidate_fingerprint",
            "message_identity_fingerprint", "content_fingerprint", "owner_fingerprint",
            "stored_thread_fingerprint", "inbox_thread_fingerprint",
            "detail_thread_fingerprint", "detail_route_thread_fingerprint",
        ] {
            guard let value = safe[key] as? String, !value.isEmpty else { continue }
            if value.count != 16 || value.contains(where: { !$0.isHexDigit || $0.isUppercase }) {
                safe.removeValue(forKey: key)
            }
        }
        let enumFields: [String: Set<String>] = [
            "navigation_event": ["load_requested", "provisional_started", "redirect", "committed", "finished", "provisional_failed", "navigation_failed", "process_terminated"],
            "error_domain_kind": ["none", "webkit", "url", "cocoa", "other"],
            "error_stage": ["none", "probe", "inventory_before", "passive_snapshot", "prepare", "post_prepare_probe", "inventory_after", "extraction", "navigation", "scroll_action", "scroll_snapshot", "count_observation", "identity_inbox", "identity_detail", "print_action", "print_observation"],
            "snapshot_label": ["preparation_baseline", "passive_ready", "passive_250ms", "passive_500ms", "passive_1000ms", "post_prepare", "scroll_initial", "scroll_top", "scroll_25", "scroll_50", "scroll_75", "scroll_bottom", "scroll_restored"],
            "candidate_kind": ["kq_raw", "kq_qualifying", "trimmed_content", "bodyless_card"],
            "native_id_kind": ["none", "legacy", "modern", "both"],
            "owner_kind": ["none", "message_card", "native_id_owner", "conversation", "body", "other"],
            "tag_kind": ["none", "div", "span", "button", "a", "tr", "td", "section", "other"],
            "role_kind": ["none", "button", "listitem", "main", "region", "other"],
            "expected_count_provenance": ["none", "renderer", "persisted", "both_equal", "max_renderer", "max_persisted"],
            "item_outcome": ["observed", "accepted", "dropped_sender", "unexpected_shape"],
            "scroll_container_kind": ["none", "nearest_scrollable_ancestor", "thread_owner", "role_main"],
            "print_document_kind": ["none", "popup", "same_view"],
        ]
        for (key, allowed) in enumFields {
            if let value = safe[key] as? String, !allowed.contains(value) {
                safe.removeValue(forKey: key)
            }
        }
        return safe
    }

    private func recordAcquisitionTrace(attemptID: String, trigger: String, stage: String,
                                        surfaceMessageID: String,
                                        fields: [String: Any] = [:]) async {
        let params = Self.gmailAcquisitionTracePayload(
            attemptID: attemptID, trigger: trigger, stage: stage,
            surfaceMessageID: surfaceMessageID, fields: fields
        )
        // Diagnostics must never become another acquisition failure. The native
        // payload is content-free; Core repeats the whitelist before journaling.
        _ = try? await CoreClient.shared.call(
            method: "email.surface.acquisition.trace", params: params
        )
    }

    private func acquisitionSnapshotFields(_ snapshot: [String: Any], label: String,
                                           sequence: Int, elapsedMS: Int,
                                           previousFingerprint: String = "",
                                           previousMutationCount: Int = 0) -> [String: Any] {
        let fingerprint = Self.gmailDiagnosticFingerprint(snapshot["snapshot_seed"] as? String ?? "")
        let mutationCount = Self.bridgeInt(snapshot["mutation_count"])
        return [
            "snapshot_label": label, "snapshot_sequence": sequence, "elapsed_ms": elapsedMS,
            "snapshot_fingerprint": fingerprint,
            "stable_with_previous": !fingerprint.isEmpty && fingerprint == previousFingerprint,
            "mutation_count": mutationCount,
            "mutation_delta": max(0, mutationCount - previousMutationCount),
            "card_count": Self.bridgeInt(snapshot["card_count"]),
            "body_count": Self.bridgeInt(snapshot["body_count"]),
            "native_id_count": Self.bridgeInt(snapshot["native_id_count"]),
            "zero_size_count": Self.bridgeInt(snapshot["zero_size_count"]),
            "unique_card_count": Self.bridgeInt(snapshot["unique_card_count"]),
            "unique_body_owner_count": Self.bridgeInt(snapshot["unique_body_owner_count"]),
            "unique_native_id_count": Self.bridgeInt(snapshot["unique_native_id_count"]),
            "raw_kq_count": Self.bridgeInt(snapshot["raw_kq_count"]),
            "qualifying_kq_count": Self.bridgeInt(snapshot["qualifying_kq_count"]),
            "adx_count": Self.bridgeInt(snapshot["adx_count"]),
            "trimmed_control_count": Self.bridgeInt(snapshot["trimmed_control_count"]),
            "bodyless_card_count": Self.bridgeInt(snapshot["bodyless_card_count"]),
            "invisible_count": Self.bridgeInt(snapshot["invisible_count"]),
            "dry_message_count": Self.bridgeInt(snapshot["dry_message_count"]),
            "duplicate_body_count": Self.bridgeInt(snapshot["duplicate_body_count"]),
            "candidate_count": Self.bridgeInt(snapshot["candidate_count"]),
        ]
    }

    private func recordAcquisitionSnapshot(_ snapshot: [String: Any],
                                           attemptID: String, trigger: String,
                                           surfaceMessageID: String, routeAttempt: Int,
                                           commandID: String, label: String, sequence: Int,
                                           elapsedMS: Int, previousFingerprint: String = "",
                                           previousMutationCount: Int = 0) async -> (String, Int) {
        var fields = acquisitionSnapshotFields(
            snapshot, label: label, sequence: sequence, elapsedMS: elapsedMS,
            previousFingerprint: previousFingerprint,
            previousMutationCount: previousMutationCount
        )
        fields["route_attempt"] = routeAttempt
        if !commandID.isEmpty { fields["command_id"] = commandID }
        await recordAcquisitionTrace(
            attemptID: attemptID, trigger: trigger, stage: "dom_snapshot",
            surfaceMessageID: surfaceMessageID, fields: fields
        )
        let candidates = Self.bridgeDictionaries(snapshot["candidates"]) ?? []
        for candidate in candidates.prefix(100) {
            var item: [String: Any] = [
                "route_attempt": routeAttempt, "snapshot_label": label,
                "snapshot_sequence": sequence,
                "candidate_index": Self.bridgeInt(candidate["candidate_index"]),
                "candidate_count": candidates.count,
                "candidate_kind": candidate["candidate_kind"] as? String ?? "",
                "candidate_fingerprint": Self.gmailDiagnosticFingerprint(candidate["candidate_seed"] as? String ?? ""),
                "owner_fingerprint": Self.gmailDiagnosticFingerprint(candidate["owner_seed"] as? String ?? ""),
                "tag_kind": candidate["tag_kind"] as? String ?? "none",
                "role_kind": candidate["role_kind"] as? String ?? "none",
                "owner_kind": candidate["owner_kind"] as? String ?? "none",
                "inside_body": candidate["inside_body"] as? Bool ?? false,
                "inside_card": candidate["inside_card"] as? Bool ?? false,
                "has_adx": candidate["has_adx"] as? Bool ?? false,
                "has_numeric_label": candidate["has_numeric_label"] as? Bool ?? false,
                "visible": candidate["visible"] as? Bool ?? false,
                "ancestor_depth": Self.bridgeInt(candidate["ancestor_depth"]),
                "width_bucket": Self.bridgeInt(candidate["width_bucket"]),
                "height_bucket": Self.bridgeInt(candidate["height_bucket"]),
            ]
            if !commandID.isEmpty { item["command_id"] = commandID }
            await recordAcquisitionTrace(
                attemptID: attemptID, trigger: trigger, stage: "dom_candidate",
                surfaceMessageID: surfaceMessageID, fields: item
            )
        }
        let dryMessages = Self.bridgeDictionaries(snapshot["dry_messages"]) ?? []
        for message in dryMessages.prefix(100) {
            var item: [String: Any] = [
                "route_attempt": routeAttempt, "snapshot_label": label,
                "snapshot_sequence": sequence,
                "item_index": Self.bridgeInt(message["item_index"]),
                "dry_message_count": dryMessages.count,
                "message_identity_fingerprint": Self.gmailDiagnosticFingerprint(message["identity_seed"] as? String ?? ""),
                "content_fingerprint": Self.gmailDiagnosticFingerprint(message["content_digest"] as? String ?? ""),
                "owner_fingerprint": Self.gmailDiagnosticFingerprint(message["owner_seed"] as? String ?? ""),
                "native_id_present": message["native_id_present"] as? Bool ?? false,
                "native_id_kind": message["native_id_kind"] as? String ?? "none",
                "sender_present": message["sender_present"] as? Bool ?? false,
                "date_present": message["date_present"] as? Bool ?? false,
                "subject_present": message["subject_present"] as? Bool ?? false,
                "body_present": message["body_present"] as? Bool ?? false,
                "body_visible": message["body_visible"] as? Bool ?? false,
                "clipped": message["clipped"] as? Bool ?? false,
                "trimmed_count": Self.bridgeInt(message["trimmed_count"]),
                "text_length": Self.bridgeInt(message["text_length"]),
                "html_length": Self.bridgeInt(message["html_length"]),
                "item_outcome": message["item_outcome"] as? String ?? "observed",
            ]
            if !commandID.isEmpty { item["command_id"] = commandID }
            await recordAcquisitionTrace(
                attemptID: attemptID, trigger: trigger, stage: "dry_extraction_item",
                surfaceMessageID: surfaceMessageID, fields: item
            )
        }
        return (fields["snapshot_fingerprint"] as? String ?? "", Self.bridgeInt(snapshot["mutation_count"]))
    }

    private func evaluateDetailJavaScript(_ script: String, arguments: [String: Any],
                                          view: WKWebView, attemptID: String,
                                          trigger: String, surfaceMessageID: String,
                                          routeAttempt: Int, commandID: String,
                                          errorStage: String) async -> Any? {
        do {
            return try await view.callAsyncJavaScript(script, arguments: arguments, contentWorld: .page)
        } catch {
            var fields = Self.gmailAcquisitionErrorFields(error, stage: errorStage)
            fields["route_attempt"] = routeAttempt
            if !commandID.isEmpty { fields["command_id"] = commandID }
            await recordAcquisitionTrace(
                attemptID: attemptID, trigger: trigger, stage: "javascript_error",
                surfaceMessageID: surfaceMessageID, fields: fields
            )
            return nil
        }
    }

    private func runExactInboxRowNavigationDiagnostic(
        view: WKWebView, remoteURL: String, surfaceMessageID: String,
        attemptID: String, trigger: String, commandID: String,
        inboxThreadIdentities: [String], storedThreadIdentity: String,
        expectedThreadCount: Int
    ) async -> [String: Any] {
        let clickValue = await evaluateDetailJavaScript(
            Self.inboxThreadNavigationDiagnosticScript,
            arguments: ["expectedURL": remoteURL], view: view,
            attemptID: attemptID, trigger: trigger,
            surfaceMessageID: surfaceMessageID, routeAttempt: 1,
            commandID: commandID, errorStage: "identity_inbox"
        )
        let click = Self.bridgeDictionary(clickValue) ?? [:]
        let clicked = click["clicked"] as? Bool == true
        guard clicked else {
            await recordAcquisitionTrace(
                attemptID: attemptID, trigger: trigger, stage: "terminal",
                surfaceMessageID: surfaceMessageID,
                fields: ["outcome": "inconclusive",
                         "terminal_reason": "identity_inbox_click_unavailable",
                         "inbox_target_found": click["inbox_target_found"] as? Bool ?? false,
                         "clicked_total": 0, "ingest_called": false,
                         "command_id": commandID]
            )
            return ["ok": true, "diagnostic_only": true,
                    "attempt_id": attemptID,
                    "terminal_reason": "identity_inbox_click_unavailable"]
        }

        var observation: [String: Any] = [:]
        var probeIterations = 0
        for index in 0..<60 {
            probeIterations = index + 1
            if let value = await evaluateDetailJavaScript(
                Self.detailThreadIdentityDiagnosticScript,
                arguments: ["expectedURL": remoteURL], view: view,
                attemptID: attemptID, trigger: trigger,
                surfaceMessageID: surfaceMessageID, routeAttempt: 1,
                commandID: commandID, errorStage: "identity_detail"
            ), let current = Self.bridgeDictionary(value) {
                observation = current
                let ownerIDs = Self.bridgeStrings(current["detail_thread_ids"], limit: 20)
                let cards = Self.bridgeInt(current["card_count"])
                let bodies = Self.bridgeInt(current["body_count"])
                if !ownerIDs.isEmpty && (cards > 0 || bodies > 0) { break }
            }
            try? await Task.sleep(nanoseconds: 200_000_000)
        }

        let detailThreadIDs = Self.bridgeStrings(observation["detail_thread_ids"], limit: 20)
        let detailRouteID = observation["detail_route_thread_id"] as? String ?? ""
        let accountMatches = observation["account_path_matches"] as? Bool == true
        var fields = Self.gmailThreadIdentityComparison(
            storedRawID: storedThreadIdentity, inboxRawIDs: inboxThreadIdentities,
            detailRawIDs: detailThreadIDs, detailRouteRawID: detailRouteID
        )
        let ready = !detailThreadIDs.isEmpty
            && (Self.bridgeInt(observation["card_count"]) > 0
                || Self.bridgeInt(observation["body_count"]) > 0)
        fields.merge([
            "route_attempt": 1, "outcome": ready ? "observed" : "inconclusive",
            "inbox_thread_identity_count": inboxThreadIdentities.count,
            "detail_thread_identity_count": detailThreadIDs.count,
            "detail_thread_owner_count": Self.bridgeInt(observation["detail_thread_owner_count"]),
            "card_count": Self.bridgeInt(observation["card_count"]),
            "body_count": Self.bridgeInt(observation["body_count"]),
            "native_id_count": Self.bridgeInt(observation["native_id_count"]),
            "account_path_matches": accountMatches,
            "probe_iterations": probeIterations, "probe_ready": ready,
            "clicked_total": 1, "command_id": commandID,
        ]) { _, new in new }
        await recordAcquisitionTrace(
            attemptID: attemptID, trigger: trigger,
            stage: "identity_clicked_row_observation",
            surfaceMessageID: surfaceMessageID, fields: fields
        )

        guard accountMatches, ready else {
            let terminalReason = accountMatches
                ? "identity_click_dry_detail_owner_missing"
                : "identity_click_dry_account_mismatch"
            fields["terminal_reason"] = terminalReason
            fields["outcome"] = "inconclusive"
            fields["ingest_called"] = false
            await recordAcquisitionTrace(
                attemptID: attemptID, trigger: trigger, stage: "terminal",
                surfaceMessageID: surfaceMessageID, fields: fields
            )
            return ["ok": true, "diagnostic_only": true, "complete": 0,
                    "attempt_id": attemptID, "terminal_reason": terminalReason]
        }

        // Row-click and direct loading now converge on the same route/owner pair.
        // Test one materially different action: click the numeric `.adx` child of
        // a conversation-owned `.kQ`, never the already-disproved `.kQ` parent.
        // The action is admitted only when its number equals the inbox hint or
        // equals hint - 1 (the visible message plus hidden-history count).
        return await runMessageStructureDiagnostic(
            view: view, surfaceMessageID: surfaceMessageID,
            attemptID: attemptID, trigger: trigger, commandID: commandID,
            expectedThreadCount: expectedThreadCount
        )
    }

    private func runMessageStructureDiagnostic(
        view: WKWebView, surfaceMessageID: String, attemptID: String,
        trigger: String, commandID: String, expectedThreadCount: Int
    ) async -> [String: Any] {
        let baselineValue = await evaluateDetailJavaScript(
            Self.detailInventoryScript, arguments: [:], view: view,
            attemptID: attemptID, trigger: trigger,
            surfaceMessageID: surfaceMessageID, routeAttempt: 1,
            commandID: commandID, errorStage: "inventory_before"
        )
        let baseline = Self.bridgeDictionary(baselineValue) ?? [:]
        _ = await recordAcquisitionSnapshot(
            baseline, attemptID: attemptID, trigger: trigger,
            surfaceMessageID: surfaceMessageID, routeAttempt: 1,
            commandID: commandID, label: "preparation_baseline", sequence: 1,
            elapsedMS: 0
        )

        // The semantic `.adx` click was accepted by Gmail but produced no new
        // recognized card/body/native message through one second. Stop clicking
        // that control. Instead, ask one smaller read-only question: does the
        // pre-click detail DOM contain message-like metadata owners that the
        // production `.adn.ads`/native-ID/body selectors do not recognize?
        let structureValue = await evaluateDetailJavaScript(
            Self.detailMessageStructureDiagnosticScript,
            arguments: [:], view: view,
            attemptID: attemptID, trigger: trigger,
            surfaceMessageID: surfaceMessageID, routeAttempt: 1,
            commandID: commandID, errorStage: "inventory_before"
        )
        let structure = Self.bridgeDictionary(structureValue) ?? [:]
        var fields: [String: Any] = [
            "outcome": structure.isEmpty ? "inconclusive" : "observed",
            "expected_thread_count": max(0, expectedThreadCount),
            "structure_sender_node_count": Self.bridgeInt(structure["structure_sender_node_count"]),
            "structure_visible_sender_node_count": Self.bridgeInt(structure["structure_visible_sender_node_count"]),
            "structure_date_node_count": Self.bridgeInt(structure["structure_date_node_count"]),
            "structure_visible_date_node_count": Self.bridgeInt(structure["structure_visible_date_node_count"]),
            "structure_header_node_count": Self.bridgeInt(structure["structure_header_node_count"]),
            "structure_visible_header_node_count": Self.bridgeInt(structure["structure_visible_header_node_count"]),
            "structure_owner_count": Self.bridgeInt(structure["structure_owner_count"]),
            "structure_visible_owner_count": Self.bridgeInt(structure["structure_visible_owner_count"]),
            "structure_known_card_owner_count": Self.bridgeInt(structure["structure_known_card_owner_count"]),
            "structure_native_owner_count": Self.bridgeInt(structure["structure_native_owner_count"]),
            "structure_body_owner_count": Self.bridgeInt(structure["structure_body_owner_count"]),
            "structure_unrecognized_owner_count": Self.bridgeInt(structure["structure_unrecognized_owner_count"]),
            "structure_unowned_sender_count": Self.bridgeInt(structure["structure_unowned_sender_count"]),
            "clicked_total": 0, "command_id": commandID,
        ]
        await recordAcquisitionTrace(
            attemptID: attemptID, trigger: trigger,
            stage: "message_structure_observed",
            surfaceMessageID: surfaceMessageID, fields: fields
        )

        let terminalReason = structure.isEmpty
            ? "message_structure_dry_unavailable"
            : "message_structure_dry_observed"
        fields["terminal_reason"] = terminalReason
        fields["ingest_called"] = false
        await recordAcquisitionTrace(
            attemptID: attemptID, trigger: trigger, stage: "terminal",
            surfaceMessageID: surfaceMessageID, fields: fields
        )
        return ["ok": true, "diagnostic_only": true, "complete": 0,
                "attempt_id": attemptID, "terminal_reason": terminalReason]
    }

    private func runThreadIdentityDiagnostic(
        view: WKWebView, remoteURL: String, surfaceMessageID: String,
        attemptID: String, trigger: String, routeAttempt: Int,
        commandID: String, inboxThreadIdentities: [String],
        storedThreadIdentity: String
    ) async -> [String: Any] {
        let value = await evaluateDetailJavaScript(
            Self.detailThreadIdentityDiagnosticScript,
            arguments: ["expectedURL": remoteURL], view: view,
            attemptID: attemptID, trigger: trigger, surfaceMessageID: surfaceMessageID,
            routeAttempt: routeAttempt, commandID: commandID, errorStage: "identity_detail"
        )
        guard let observation = Self.bridgeDictionary(value) else {
            await recordAcquisitionTrace(
                attemptID: attemptID, trigger: trigger, stage: "terminal",
                surfaceMessageID: surfaceMessageID,
                fields: ["route_attempt": routeAttempt, "outcome": "inconclusive",
                         "terminal_reason": "identity_detail_observation_failed",
                         "ingest_called": false, "command_id": commandID]
            )
            return ["ok": false, "diagnostic_only": true,
                    "error": "Gmail detail identity observation failed",
                    "attempt_id": attemptID,
                    "terminal_reason": "identity_detail_observation_failed"]
        }
        let detailThreadIDs = Self.bridgeStrings(observation["detail_thread_ids"], limit: 20)
        let detailRouteID = observation["detail_route_thread_id"] as? String ?? ""
        let accountMatches = observation["account_path_matches"] as? Bool == true
        var fields = Self.gmailThreadIdentityComparison(
            storedRawID: storedThreadIdentity, inboxRawIDs: inboxThreadIdentities,
            detailRawIDs: detailThreadIDs, detailRouteRawID: detailRouteID
        )
        fields.merge([
            "route_attempt": routeAttempt,
            "outcome": "observed",
            "inbox_thread_identity_count": inboxThreadIdentities.count,
            "detail_thread_identity_count": detailThreadIDs.count,
            "detail_thread_owner_count": Self.bridgeInt(observation["detail_thread_owner_count"]),
            "card_count": Self.bridgeInt(observation["card_count"]),
            "body_count": Self.bridgeInt(observation["body_count"]),
            "native_id_count": Self.bridgeInt(observation["native_id_count"]),
            "account_path_matches": accountMatches,
            "command_id": commandID,
        ]) { _, new in new }
        await recordAcquisitionTrace(
            attemptID: attemptID, trigger: trigger, stage: "identity_detail_observation",
            surfaceMessageID: surfaceMessageID, fields: fields
        )

        let detailOwnerPresent = fields["detail_thread_identity_present"] as? Bool == true
        let ownerMatches = fields["inbox_detail_thread_identity_matches"] as? Bool == true
        let terminalReason: String
        let outcome: String
        if !accountMatches {
            terminalReason = "identity_dry_account_mismatch"
            outcome = "failed"
        } else if !detailOwnerPresent {
            terminalReason = "identity_dry_detail_owner_missing"
            outcome = "inconclusive"
        } else if ownerMatches {
            terminalReason = "identity_dry_same_thread_owner"
            outcome = "observed"
        } else {
            terminalReason = "identity_dry_thread_owner_mismatch"
            outcome = "observed"
        }
        fields["terminal_reason"] = terminalReason
        fields["outcome"] = outcome
        fields["ingest_called"] = false
        await recordAcquisitionTrace(
            attemptID: attemptID, trigger: trigger, stage: "terminal",
            surfaceMessageID: surfaceMessageID, fields: fields
        )
        return ["ok": true, "diagnostic_only": true, "complete": 0,
                "attempt_id": attemptID, "terminal_reason": terminalReason]
    }

    private func runViewportMaterializationDiagnostic(
        view: WKWebView, remoteURL: String, surfaceMessageID: String,
        attemptID: String, trigger: String, routeAttempt: Int,
        commandID: String, attemptStart: ContinuousClock.Instant
    ) async -> [String: Any] {
        var cumulativeNativeIDs = Set<String>()
        var previousFingerprint = ""
        var previousMutationCount = 0
        var snapshotSequence = 0

        func traceAction(_ action: [String: Any], step: Int) async {
            var fields: [String: Any] = [
                "route_attempt": routeAttempt, "outcome": "observed",
                "scroll_step": step,
                "scroll_container_kind": action["scroll_container_kind"] as? String ?? "none",
                "scroll_container_found": action["scroll_container_found"] as? Bool ?? false,
                "scroll_target_percent": Self.bridgeInt(action["scroll_target_percent"]),
                "scroll_position_percent": Self.bridgeInt(action["scroll_position_percent"]),
                "scroll_extent_bucket": Self.bridgeInt(action["scroll_extent_bucket"]),
                "viewport_height_bucket": Self.bridgeInt(action["viewport_height_bucket"]),
                "scroll_changed": action["scroll_changed"] as? Bool ?? false,
                "scroll_restored": action["scroll_restored"] as? Bool ?? false,
            ]
            if !commandID.isEmpty { fields["command_id"] = commandID }
            await recordAcquisitionTrace(
                attemptID: attemptID, trigger: trigger, stage: "scroll_action",
                surfaceMessageID: surfaceMessageID, fields: fields
            )
        }

        func takeSnapshot(label: String, action: [String: Any]) async {
            let value = await evaluateDetailJavaScript(
                Self.detailScrollInventoryScript, arguments: [:], view: view,
                attemptID: attemptID, trigger: trigger, surfaceMessageID: surfaceMessageID,
                routeAttempt: routeAttempt, commandID: commandID, errorStage: "scroll_snapshot"
            )
            guard let snapshot = Self.bridgeDictionary(value) else { return }
            snapshotSequence += 1
            cumulativeNativeIDs.formUnion(Self.bridgeStrings(snapshot["native_ids"]))
            let elapsed = attemptStart.duration(to: ContinuousClock.now)
            let elapsedMS = Int(elapsed.components.seconds * 1_000)
                + Int(elapsed.components.attoseconds / 1_000_000_000_000_000)
            var fields = acquisitionSnapshotFields(
                snapshot, label: label, sequence: snapshotSequence, elapsedMS: elapsedMS,
                previousFingerprint: previousFingerprint,
                previousMutationCount: previousMutationCount
            )
            let rawFingerprint = snapshot["snapshot_seed"] as? String ?? ""
            previousFingerprint = Self.gmailDiagnosticFingerprint(rawFingerprint)
            previousMutationCount = Self.bridgeInt(snapshot["mutation_count"])
            fields["route_attempt"] = routeAttempt
            fields["dom_identity_fingerprint"] = Self.gmailDOMIdentityFingerprint(
                Self.bridgeStrings(snapshot["native_ids"])
            )
            fields["cumulative_unique_native_id_count"] = cumulativeNativeIDs.count
            fields["cumulative_snapshot_count"] = snapshotSequence
            fields["scroll_step"] = Self.bridgeInt(action["scroll_step"])
            fields["scroll_container_kind"] = action["scroll_container_kind"] as? String ?? "none"
            fields["scroll_container_found"] = action["scroll_container_found"] as? Bool ?? false
            fields["scroll_target_percent"] = Self.bridgeInt(action["scroll_target_percent"])
            fields["scroll_position_percent"] = Self.bridgeInt(action["scroll_position_percent"])
            fields["scroll_extent_bucket"] = Self.bridgeInt(action["scroll_extent_bucket"])
            fields["viewport_height_bucket"] = Self.bridgeInt(action["viewport_height_bucket"])
            fields["scroll_changed"] = action["scroll_changed"] as? Bool ?? false
            fields["scroll_restored"] = action["scroll_restored"] as? Bool ?? false
            if !commandID.isEmpty { fields["command_id"] = commandID }
            await recordAcquisitionTrace(
                attemptID: attemptID, trigger: trigger, stage: "dom_snapshot",
                surfaceMessageID: surfaceMessageID, fields: fields
            )
        }

        let initializeValue = await evaluateDetailJavaScript(
            Self.detailScrollActionScript,
            arguments: ["action": "initialize", "targetPercent": 0], view: view,
            attemptID: attemptID, trigger: trigger, surfaceMessageID: surfaceMessageID,
            routeAttempt: routeAttempt, commandID: commandID, errorStage: "scroll_action"
        )
        let initialize = Self.bridgeDictionary(initializeValue) ?? [:]
        await traceAction(initialize, step: 0)
        await takeSnapshot(label: "scroll_initial", action: initialize)
        guard initialize["scroll_container_found"] as? Bool == true else {
            await recordAcquisitionTrace(
                attemptID: attemptID, trigger: trigger, stage: "terminal",
                surfaceMessageID: surfaceMessageID,
                fields: ["route_attempt": routeAttempt, "outcome": "inconclusive",
                         "terminal_reason": "scroll_container_unavailable",
                         "cumulative_unique_native_id_count": cumulativeNativeIDs.count,
                         "cumulative_snapshot_count": snapshotSequence,
                         "ingest_called": false]
            )
            return ["ok": false, "diagnostic_only": true,
                    "error": "No conversation-owned scroll container was available",
                    "attempt_id": attemptID,
                    "terminal_reason": "scroll_container_unavailable"]
        }

        let positions: [(String, Int)] = [
            ("scroll_top", 0), ("scroll_25", 25), ("scroll_50", 50),
            ("scroll_75", 75), ("scroll_bottom", 100),
        ]
        for (index, position) in positions.enumerated() {
            let actionValue = await evaluateDetailJavaScript(
                Self.detailScrollActionScript,
                arguments: ["action": "move", "targetPercent": position.1], view: view,
                attemptID: attemptID, trigger: trigger, surfaceMessageID: surfaceMessageID,
                routeAttempt: routeAttempt, commandID: commandID, errorStage: "scroll_action"
            )
            var action = Self.bridgeDictionary(actionValue) ?? [:]
            action["scroll_step"] = index + 1
            await traceAction(action, step: index + 1)
            try? await Task.sleep(nanoseconds: 350_000_000)
            await takeSnapshot(label: position.0, action: action)
        }

        let restoreValue = await evaluateDetailJavaScript(
            Self.detailScrollActionScript,
            arguments: ["action": "restore", "targetPercent": 0], view: view,
            attemptID: attemptID, trigger: trigger, surfaceMessageID: surfaceMessageID,
            routeAttempt: routeAttempt, commandID: commandID, errorStage: "scroll_action"
        )
        var restore = Self.bridgeDictionary(restoreValue) ?? [:]
        restore["scroll_step"] = positions.count + 1
        await traceAction(restore, step: positions.count + 1)
        try? await Task.sleep(nanoseconds: 350_000_000)
        await takeSnapshot(label: "scroll_restored", action: restore)

        let finalProbeValue = await evaluateDetailJavaScript(
            Self.detailProbe, arguments: ["expectedURL": remoteURL], view: view,
            attemptID: attemptID, trigger: trigger, surfaceMessageID: surfaceMessageID,
            routeAttempt: routeAttempt, commandID: commandID, errorStage: "post_prepare_probe"
        )
        let finalProbe = Self.bridgeDictionary(finalProbeValue) ?? [:]
        let accountMatches = finalProbe["account_path_matches"] as? Bool == true
        let restored = restore["scroll_restored"] as? Bool == true
        let terminalReason = accountMatches && restored
            ? "scroll_dry_observed" : "scroll_diagnostic_guard_failed"
        let outcome = accountMatches && restored ? "observed" : "failed"
        await recordAcquisitionTrace(
            attemptID: attemptID, trigger: trigger, stage: "terminal",
            surfaceMessageID: surfaceMessageID,
            fields: ["route_attempt": routeAttempt, "outcome": outcome,
                     "terminal_reason": terminalReason,
                     "route_matches": finalProbe["route_matches"] as? Bool ?? false,
                     "account_path_matches": accountMatches,
                     "scroll_container_found": true, "scroll_restored": restored,
                     "cumulative_unique_native_id_count": cumulativeNativeIDs.count,
                     "cumulative_snapshot_count": snapshotSequence,
                     "ingest_called": false]
        )
        return ["ok": accountMatches && restored, "diagnostic_only": true,
                "complete": 0, "attempt_id": attemptID,
                "terminal_reason": terminalReason]
    }

    private func runPrintViewDiagnostic(
        view: WKWebView, surfaceMessageID: String, attemptID: String,
        trigger: String, routeAttempt: Int, commandID: String
    ) async -> [String: Any] {
        // acquireConversation admitted this operation before creating or
        // navigating a WKWebView. This method may only spend that operation's
        // remaining action/JavaScript/elapsed budgets.
        let operationID = commandID
        func denied(_ admission: GmailExperimentAdmission) -> [String: Any]? {
            guard case .denied(let reason) = admission else { return nil }
            return ["ok": false, "diagnostic_only": true, "attempt_id": attemptID,
                    "terminal_reason": reason]
        }
        func checkProviderChallenge(_ candidateView: WKWebView) async -> Bool {
            if Self.isGmailProviderChallengeURL(candidateView.url) {
                experimentSafety.recordProviderChallenge(operationID: operationID)
                candidateView.stopLoading()
                return true
            }
            guard denied(experimentSafety.consume(.javascriptEvaluation, operationID: operationID)) == nil else {
                candidateView.stopLoading()
                return true
            }
            let value = await evaluateDetailJavaScript(
                Self.providerChallengeProbeScript, arguments: [:], view: candidateView,
                attemptID: attemptID, trigger: trigger, surfaceMessageID: surfaceMessageID,
                routeAttempt: routeAttempt, commandID: commandID, errorStage: "print_observation"
            )
            if value as? Bool == true {
                experimentSafety.recordProviderChallenge(operationID: operationID)
                candidateView.stopLoading()
                return true
            }
            return false
        }

        let parentKey = ObjectIdentifier(view)
        printCaptureParents.insert(parentKey)
        printCapturePopups.removeValue(forKey: parentKey)
        defer {
            printCaptureParents.remove(parentKey)
            view.stopLoading()
            if let popup = printCapturePopups.removeValue(forKey: parentKey) {
                detailNavigationContexts.removeValue(forKey: ObjectIdentifier(popup))
                popup.stopLoading()
                popup.removeFromSuperview()
            }
        }

        if await checkProviderChallenge(view) {
            return ["ok": false, "diagnostic_only": true, "attempt_id": attemptID,
                    "terminal_reason": "provider_challenge_circuit_open"]
        }
        if let result = denied(experimentSafety.consume(.javascriptEvaluation, operationID: operationID)) {
            return result
        }
        _ = await evaluateDetailJavaScript(
            Self.suppressWindowPrintScript, arguments: [:], view: view,
            attemptID: attemptID, trigger: trigger, surfaceMessageID: surfaceMessageID,
            routeAttempt: routeAttempt, commandID: commandID, errorStage: "print_action"
        )

        if let result = denied(experimentSafety.consume(.action, operationID: operationID)) { return result }
        if let result = denied(experimentSafety.consume(.javascriptEvaluation, operationID: operationID)) { return result }
        let menuValue = await evaluateDetailJavaScript(
            Self.printAllMenuOpenScript, arguments: [:], view: view,
            attemptID: attemptID, trigger: trigger, surfaceMessageID: surfaceMessageID,
            routeAttempt: routeAttempt, commandID: commandID, errorStage: "print_action"
        )
        let menu = Self.bridgeDictionary(menuValue) ?? [:]
        let menuOpened = menu["print_menu_opened"] as? Bool == true
        if menuOpened { try? await Task.sleep(nanoseconds: 300_000_000) }
        guard denied(experimentSafety.checkpoint(operationID: operationID)) == nil else {
            return ["ok": false, "diagnostic_only": true, "attempt_id": attemptID,
                    "terminal_reason": "elapsed_budget_exhausted"]
        }

        if let result = denied(experimentSafety.consume(.action, operationID: operationID)) { return result }
        if let result = denied(experimentSafety.consume(.javascriptEvaluation, operationID: operationID)) { return result }
        let actionValue = await evaluateDetailJavaScript(
            Self.printAllActionScript, arguments: [:], view: view,
            attemptID: attemptID, trigger: trigger, surfaceMessageID: surfaceMessageID,
            routeAttempt: routeAttempt, commandID: commandID, errorStage: "print_action"
        )
        let action = Self.bridgeDictionary(actionValue) ?? [:]
        let candidateCount = Self.bridgeInt(action["print_action_candidate_count"])
        let clicked = action["print_action_clicked"] as? Bool == true
        guard clicked, candidateCount == 1 else {
            return ["ok": true, "diagnostic_only": true, "attempt_id": attemptID,
                    "terminal_reason": candidateCount > 1 ? "print_action_ambiguous" : "print_action_unavailable"]
        }

        var observation: [String: Any] = [:]
        var popupCreated = false
        var documentKind = "none"
        // At most eight 200ms observations, additionally bounded by the global
        // JS-evaluation and 15-second elapsed budgets. No 50-probe loop remains.
        for _ in 0..<8 {
            guard denied(experimentSafety.checkpoint(operationID: operationID)) == nil else {
                return ["ok": false, "diagnostic_only": true, "attempt_id": attemptID,
                        "terminal_reason": "elapsed_budget_exhausted"]
            }
            let popup = printCapturePopups[parentKey]
            popupCreated = popup != nil
            let candidateView = popup ?? view
            if await checkProviderChallenge(candidateView) {
                return ["ok": false, "diagnostic_only": true, "attempt_id": attemptID,
                        "terminal_reason": "provider_challenge_circuit_open"]
            }
            guard denied(experimentSafety.consume(.javascriptEvaluation, operationID: operationID)) == nil else {
                return ["ok": false, "diagnostic_only": true, "attempt_id": attemptID,
                        "terminal_reason": "javascript_budget_exhausted"]
            }
            let value = await evaluateDetailJavaScript(
                Self.printViewObservationScript, arguments: [:], view: candidateView,
                attemptID: attemptID, trigger: trigger, surfaceMessageID: surfaceMessageID,
                routeAttempt: routeAttempt, commandID: commandID, errorStage: "print_observation"
            )
            if let current = Self.bridgeDictionary(value) {
                observation = current
                if current["print_document_ready"] as? Bool == true {
                    documentKind = popup == nil ? "same_view" : "popup"
                    break
                }
            }
            try? await Task.sleep(nanoseconds: 200_000_000)
        }

        let ready = observation["print_document_ready"] as? Bool == true
        let sectionCount = Self.bridgeInt(observation["print_section_count"])
        return [
            "ok": true, "diagnostic_only": true, "attempt_id": attemptID,
            "terminal_reason": !ready ? (popupCreated ? "print_document_timeout" : "print_document_missing")
                : (sectionCount > 1 ? "print_view_multiple_sections" : "print_view_single_section"),
            "print_document_kind": documentKind,
        ]
    }

    static func gmailRequestedDocumentIsEligible(requestedNavigationCommitted: Bool,
                                                 currentGeneration: Int,
                                                 requestedGeneration: Int) -> Bool {
        requestedNavigationCommitted
            && requestedGeneration > 0
            && currentGeneration == requestedGeneration
    }

    private func acquireConversation(remoteURL: String, surfaceMessageID: String,
                                     fallbackSender: String = "", fallbackSubject: String = "",
                                     expectedThreadCount: Int = 0,
                                     attemptID suppliedAttemptID: String = "",
                                     trigger: String = "enrich", routeAttempt: Int = 1,
                                     comparisonID: String = "", commandID: String = "",
                                     inboxThreadIdentities: [String] = [],
                                     storedThreadIdentity: String = "") async -> [String: Any] {
        let attemptID = suppliedAttemptID.isEmpty ? UUID().uuidString.lowercased() : suppliedAttemptID
        var routeFields = Self.gmailRouteTraceMetadata(remoteURL)
        routeFields["route_attempt"] = routeAttempt
        routeFields["expected_thread_count"] = max(0, expectedThreadCount)
        if !comparisonID.isEmpty { routeFields["comparison_id"] = comparisonID }
        if !commandID.isEmpty { routeFields["command_id"] = commandID }
        await recordAcquisitionTrace(
            attemptID: attemptID, trigger: trigger, stage: "candidate",
            surfaceMessageID: surfaceMessageID, fields: routeFields
        )
        let isPrintExperiment = trigger == "print_view_dry"
        if isPrintExperiment {
            switch experimentSafety.beginExplicitPrintViewExperiment(operationID: commandID) {
            case .admitted:
                break
            case .coalesced:
                return ["ok": false, "diagnostic_only": true, "attempt_id": attemptID,
                        "terminal_reason": "experiment_duplicate_coalesced"]
            case .denied(let reason):
                return ["ok": false, "diagnostic_only": true, "attempt_id": attemptID,
                        "terminal_reason": reason]
            }
        }
        defer {
            if isPrintExperiment { experimentSafety.finish(operationID: commandID) }
        }
        guard let url = URL(string: remoteURL), let host = url.host?.lowercased(),
              Self.allowedHost(host), !surfaceMessageID.isEmpty else {
            await recordAcquisitionTrace(
                attemptID: attemptID, trigger: trigger, stage: "terminal",
                surfaceMessageID: surfaceMessageID,
                fields: ["route_attempt": routeAttempt, "outcome": "failed",
                         "terminal_reason": "unsafe_or_missing_detail_url", "ingest_called": false]
            )
            return ["ok": false, "error": "This email has no safe Gmail detail URL",
                    "attempt_id": attemptID, "terminal_reason": "unsafe_or_missing_detail_url"]
        }

        // Inbox synchronization runs a long-lived async JavaScript program that
        // paginates Gmail. Navigating that same WKWebView aborts its JavaScript
        // reply with “completion handler is no longer reachable”. Detail capture
        // therefore owns a separate view while sharing the authenticated store.
        let view = detailWebView()
        let navigationKey = ObjectIdentifier(view)
        detailNavigationContexts[navigationKey] = DetailNavigationContext(
            attemptID: attemptID, trigger: trigger, surfaceMessageID: surfaceMessageID,
            routeAttempt: routeAttempt, commandID: commandID,
            startedAt: ProcessInfo.processInfo.systemUptime, documentGeneration: 0,
            requestedNavigationID: nil, requestedDocumentGeneration: 0,
            requestedNavigationCommitted: false
        )
        defer { detailNavigationContexts.removeValue(forKey: navigationKey) }
        let attemptStart = ContinuousClock.now
        if isPrintExperiment, case .denied(let reason) = experimentSafety.consume(
            .navigation, operationID: commandID
        ) {
            return ["ok": false, "diagnostic_only": true, "attempt_id": attemptID,
                    "terminal_reason": reason]
        }
        let requestedNavigation = view.load(URLRequest(url: url))
        if var context = detailNavigationContexts[navigationKey] {
            context.requestedNavigationID = requestedNavigation.map { ObjectIdentifier($0) }
            detailNavigationContexts[navigationKey] = context
        }
        var loadFields = Self.gmailRouteTraceMetadata(remoteURL)
        loadFields["navigation_event"] = "load_requested"
        loadFields["document_generation"] = 0
        loadFields["elapsed_ms"] = 0
        loadFields["route_attempt"] = routeAttempt
        loadFields["requested_navigation_returned"] = requestedNavigation != nil
        loadFields["requested_document_generation"] = 0
        loadFields["navigation_eligible"] = false
        if !commandID.isEmpty { loadFields["command_id"] = commandID }
        await recordAcquisitionTrace(
            attemptID: attemptID, trigger: trigger, stage: "navigation",
            surfaceMessageID: surfaceMessageID, fields: loadFields
        )
        var ready = false
        var probeIterations = 0
        var probeEvaluationCount = 0
        var lastProbe: [String: Any] = [:]
        var probeBridgeType = "nil"
        let maximumProbeIterations = isPrintExperiment ? 12 : 90
        for index in 0..<maximumProbeIterations {
            probeIterations = index + 1
            if isPrintExperiment {
                if Self.isGmailProviderChallengeURL(view.url) {
                    experimentSafety.recordProviderChallenge(operationID: commandID)
                    view.stopLoading()
                    return ["ok": false, "diagnostic_only": true, "attempt_id": attemptID,
                            "terminal_reason": "provider_challenge_circuit_open"]
                }
                if case .denied(let reason) = experimentSafety.checkpoint(operationID: commandID) {
                    view.stopLoading()
                    return ["ok": false, "diagnostic_only": true, "attempt_id": attemptID,
                            "terminal_reason": reason]
                }
            }
            guard let navigationContext = detailNavigationContexts[navigationKey],
                  Self.gmailRequestedDocumentIsEligible(
                    requestedNavigationCommitted: navigationContext.requestedNavigationCommitted,
                    currentGeneration: navigationContext.documentGeneration,
                    requestedGeneration: navigationContext.requestedDocumentGeneration
                  ) else {
                // A reused WKWebView retains the previous conversation until the
                // navigation returned by this load commits. Never let that prior
                // document satisfy the detail readiness predicate. If Gmail later
                // commits a different navigation generation, remain fail-closed.
                try? await Task.sleep(nanoseconds: 300_000_000)
                continue
            }
            if isPrintExperiment {
                if case .denied(let reason) = experimentSafety.consume(
                    .javascriptEvaluation, operationID: commandID
                ) {
                    view.stopLoading()
                    return ["ok": false, "diagnostic_only": true, "attempt_id": attemptID,
                            "terminal_reason": reason]
                }
                let challengeValue = await evaluateDetailJavaScript(
                    Self.providerChallengeProbeScript, arguments: [:], view: view,
                    attemptID: attemptID, trigger: trigger, surfaceMessageID: surfaceMessageID,
                    routeAttempt: routeAttempt, commandID: commandID, errorStage: "probe"
                )
                if challengeValue as? Bool == true {
                    experimentSafety.recordProviderChallenge(operationID: commandID)
                    view.stopLoading()
                    return ["ok": false, "diagnostic_only": true, "attempt_id": attemptID,
                            "terminal_reason": "provider_challenge_circuit_open"]
                }
                if case .denied(let reason) = experimentSafety.consume(
                    .javascriptEvaluation, operationID: commandID
                ) {
                    view.stopLoading()
                    return ["ok": false, "diagnostic_only": true, "attempt_id": attemptID,
                            "terminal_reason": reason]
                }
            }
            probeEvaluationCount += 1
            let probeValue = await evaluateDetailJavaScript(
                Self.detailProbe, arguments: ["expectedURL": remoteURL], view: view,
                attemptID: attemptID, trigger: trigger, surfaceMessageID: surfaceMessageID,
                routeAttempt: routeAttempt, commandID: commandID, errorStage: "probe"
            )
            probeBridgeType = Self.bridgeTypeName(probeValue)
            if let probe = Self.bridgeDictionary(probeValue) {
                lastProbe = probe
                if probe["ready"] as? Bool == true { ready = true; break }
            } else if probeValue as? Bool == true {
                // Compatibility with an installed script from an in-flight build.
                ready = true
                break
            }
            try? await Task.sleep(nanoseconds: 300_000_000)
        }
        let finalNavigationContext = detailNavigationContexts[navigationKey]
        let finalNavigationEligible = finalNavigationContext.map {
            Self.gmailRequestedDocumentIsEligible(
                requestedNavigationCommitted: $0.requestedNavigationCommitted,
                currentGeneration: $0.documentGeneration,
                requestedGeneration: $0.requestedDocumentGeneration
            )
        } ?? false
        var probeFields: [String: Any] = [
            "route_attempt": routeAttempt, "probe_iterations": probeIterations,
            "probe_evaluation_count": probeEvaluationCount,
            "probe_ready": ready, "explicit_login": Self.isExplicitGoogleLoginURL(view.url),
            "document_generation": finalNavigationContext?.documentGeneration ?? 0,
            "requested_document_generation": finalNavigationContext?.requestedDocumentGeneration ?? 0,
            "navigation_eligible": finalNavigationEligible,
            "bridge_type": probeBridgeType,
            "route_matches": lastProbe["route_matches"] as? Bool ?? false,
            "account_path_matches": lastProbe["account_path_matches"] as? Bool ?? false,
            "card_count": Self.bridgeInt(lastProbe["card_count"]),
            "body_count": Self.bridgeInt(lastProbe["body_count"]),
            "stack_count": Self.bridgeInt(lastProbe["stack_count"]),
            "explicit_stack_count": Self.bridgeInt(lastProbe["explicit_stack_count"]),
            "kq_stack_count": Self.bridgeInt(lastProbe["kq_stack_count"]),
            "native_id_count": Self.bridgeInt(lastProbe["native_id_count"]),
            "zero_size_count": Self.bridgeInt(lastProbe["zero_size_count"]),
            "outcome": ready ? "ready" : "timeout",
        ]
        await recordAcquisitionTrace(
            attemptID: attemptID, trigger: trigger, stage: "probe",
            surfaceMessageID: surfaceMessageID, fields: probeFields
        )
        guard ready else {
            await recordAcquisitionTrace(
                attemptID: attemptID, trigger: trigger, stage: "terminal",
                surfaceMessageID: surfaceMessageID,
                fields: ["route_attempt": routeAttempt, "outcome": "failed",
                         "terminal_reason": "detail_probe_timeout", "probe_iterations": probeIterations,
                         "explicit_login": Self.isExplicitGoogleLoginURL(view.url), "ingest_called": false]
            )
            return ["ok": false, "error": "Timed out while opening the Gmail conversation",
                    "attempt_id": attemptID, "terminal_reason": "detail_probe_timeout"]
        }
        var ingestCalled = false
        do {
            if trigger == "print_view_dry" {
                return await runPrintViewDiagnostic(
                    view: view, surfaceMessageID: surfaceMessageID,
                    attemptID: attemptID, trigger: trigger,
                    routeAttempt: routeAttempt, commandID: commandID
                )
            }
            if trigger == "force_refetch_identity_dry" {
                return await runThreadIdentityDiagnostic(
                    view: view, remoteURL: remoteURL,
                    surfaceMessageID: surfaceMessageID, attemptID: attemptID,
                    trigger: trigger, routeAttempt: routeAttempt,
                    commandID: commandID,
                    inboxThreadIdentities: inboxThreadIdentities,
                    storedThreadIdentity: storedThreadIdentity
                )
            }
            if trigger == "force_refetch_scroll_dry" {
                return await runViewportMaterializationDiagnostic(
                    view: view, remoteURL: remoteURL,
                    surfaceMessageID: surfaceMessageID, attemptID: attemptID,
                    trigger: trigger, routeAttempt: routeAttempt,
                    commandID: commandID, attemptStart: attemptStart
                )
            }
            let beforeValue = await evaluateDetailJavaScript(
                Self.detailInventoryScript, arguments: [:], view: view,
                attemptID: attemptID, trigger: trigger, surfaceMessageID: surfaceMessageID,
                routeAttempt: routeAttempt, commandID: commandID, errorStage: "inventory_before"
            )
            let before = Self.bridgeDictionary(beforeValue) ?? [:]
            let beforeDOMIdentityFingerprint = Self.gmailDOMIdentityFingerprint(
                Self.bridgeStrings(before["native_ids"])
            )
            var previousSnapshotFingerprint = ""
            var previousMutationCount = 0
            var latestPassiveSnapshot = before
            let passiveSchedule: [(String, UInt64)] = [
                ("passive_ready", 0), ("passive_250ms", 250_000_000),
                ("passive_500ms", 250_000_000), ("passive_1000ms", 500_000_000),
            ]
            for (sequence, entry) in passiveSchedule.enumerated() {
                if entry.1 > 0 { try? await Task.sleep(nanoseconds: entry.1) }
                let value: Any?
                if sequence == 0 {
                    value = beforeValue
                } else {
                    value = await evaluateDetailJavaScript(
                        Self.detailInventoryScript, arguments: [:], view: view,
                        attemptID: attemptID, trigger: trigger, surfaceMessageID: surfaceMessageID,
                        routeAttempt: routeAttempt, commandID: commandID, errorStage: "passive_snapshot"
                    )
                }
                guard let snapshot = Self.bridgeDictionary(value) else { continue }
                latestPassiveSnapshot = snapshot
                let elapsed = attemptStart.duration(to: ContinuousClock.now)
                let elapsedMS = Int(elapsed.components.seconds * 1_000)
                    + Int(elapsed.components.attoseconds / 1_000_000_000_000_000)
                (previousSnapshotFingerprint, previousMutationCount) = await recordAcquisitionSnapshot(
                    snapshot, attemptID: attemptID, trigger: trigger,
                    surfaceMessageID: surfaceMessageID, routeAttempt: routeAttempt,
                    commandID: commandID, label: entry.0, sequence: sequence + 1,
                    elapsedMS: elapsedMS, previousFingerprint: previousSnapshotFingerprint,
                    previousMutationCount: previousMutationCount
                )
            }
            probeFields = [
                "route_attempt": routeAttempt, "outcome": "observed",
                "bridge_type": Self.bridgeTypeName(beforeValue),
                "card_count": Self.bridgeInt(latestPassiveSnapshot["card_count"]),
                "body_count": Self.bridgeInt(latestPassiveSnapshot["body_count"]),
                "stack_count": Self.bridgeInt(latestPassiveSnapshot["stack_count"]),
                "explicit_stack_count": Self.bridgeInt(latestPassiveSnapshot["explicit_stack_count"]),
                "kq_stack_count": Self.bridgeInt(latestPassiveSnapshot["kq_stack_count"]),
                "native_id_count": Self.bridgeInt(latestPassiveSnapshot["native_id_count"]),
                "zero_size_count": Self.bridgeInt(latestPassiveSnapshot["zero_size_count"]),
                "dom_identity_fingerprint": beforeDOMIdentityFingerprint,
            ]
            await recordAcquisitionTrace(
                attemptID: attemptID, trigger: trigger, stage: "dom_before_prepare",
                surfaceMessageID: surfaceMessageID, fields: probeFields
            )

            // Gmail initially collapses older messages in a conversation. Expand
            // each message before extraction so acquisition is not accidentally
            // limited to the newest rendered body.
            let kqBeforeElapsed = attemptStart.duration(to: ContinuousClock.now)
            let kqBeforeElapsedMS = Int(kqBeforeElapsed.components.seconds * 1_000)
                + Int(kqBeforeElapsed.components.attoseconds / 1_000_000_000_000_000)
            if trigger == "force_refetch_kq_dry" {
                (previousSnapshotFingerprint, previousMutationCount) = await recordAcquisitionSnapshot(
                    latestPassiveSnapshot, attemptID: attemptID, trigger: trigger,
                    surfaceMessageID: surfaceMessageID, routeAttempt: routeAttempt,
                    commandID: commandID, label: "preparation_baseline", sequence: 5,
                    elapsedMS: kqBeforeElapsedMS, previousFingerprint: previousSnapshotFingerprint,
                    previousMutationCount: previousMutationCount
                )
            }
            let noOpPreparation = trigger == "force_refetch_noop_prepare"
            let kqDryAction = trigger == "force_refetch_kq_dry"
            let preparationEnabled = !noOpPreparation
            let prepareValue: Any?
            if preparationEnabled {
                do {
                    prepareValue = try await view.callAsyncJavaScript(
                        kqDryAction ? Self.detailKQDryActionScript : Self.detailPrepareScript,
                        arguments: [:], contentWorld: .page
                    )
                } catch {
                    var errorFields = Self.gmailAcquisitionErrorFields(error, stage: "prepare")
                    errorFields["route_attempt"] = routeAttempt
                    if !commandID.isEmpty { errorFields["command_id"] = commandID }
                    await recordAcquisitionTrace(
                        attemptID: attemptID, trigger: trigger, stage: "javascript_error",
                        surfaceMessageID: surfaceMessageID, fields: errorFields
                    )
                    throw error
                }
            } else {
                // Diagnostic control: preserve the same post-load/probe timing and
                // route guard while executing no Gmail DOM clicks. This path is
                // still fail-closed and can never persist after a route mismatch.
                prepareValue = [
                    "clicked_total": 0, "clicked_history_stack": 0,
                    "clicked_explicit_stack": 0, "clicked_kq_stack": 0,
                    "clicked_message_header": 0, "clicked_trimmed_content": 0,
                ] as [String: Any]
            }
            let preparation = Self.bridgeDictionary(prepareValue) ?? [:]
            var preparationFields: [String: Any] = [
                "route_attempt": routeAttempt, "outcome": "observed",
                "bridge_type": Self.bridgeTypeName(prepareValue),
                "preparation_enabled": preparationEnabled,
                "clicked_total": Self.bridgeInt(preparation["clicked_total"]),
                "clicked_history_stack": Self.bridgeInt(preparation["clicked_history_stack"]),
                "clicked_explicit_stack": Self.bridgeInt(preparation["clicked_explicit_stack"]),
                "clicked_kq_stack": Self.bridgeInt(preparation["clicked_kq_stack"]),
                "clicked_message_header": Self.bridgeInt(preparation["clicked_message_header"]),
                "clicked_trimmed_content": Self.bridgeInt(preparation["clicked_trimmed_content"]),
                "control_kinds": kqDryAction ? "kq" : "history_stack,message_header,trimmed_content",
            ]
            if !comparisonID.isEmpty { preparationFields["comparison_id"] = comparisonID }
            if !commandID.isEmpty { preparationFields["command_id"] = commandID }
            // Emit click counters before the guard so every mismatch is
            // interpretable, including the no-op control path.
            await recordAcquisitionTrace(
                attemptID: attemptID, trigger: trigger, stage: "preparation_completed",
                surfaceMessageID: surfaceMessageID, fields: preparationFields
            )

            let postActionSchedule: [(String, UInt64)] = kqDryAction ? [
                ("post_prepare", 0), ("passive_250ms", 250_000_000),
                ("passive_500ms", 250_000_000), ("passive_1000ms", 500_000_000),
            ] : [("post_prepare", 0)]
            var afterValue: Any?
            var after: [String: Any] = [:]
            for (offset, entry) in postActionSchedule.enumerated() {
                if entry.1 > 0 { try? await Task.sleep(nanoseconds: entry.1) }
                afterValue = await evaluateDetailJavaScript(
                    Self.detailInventoryScript, arguments: [:], view: view,
                    attemptID: attemptID, trigger: trigger, surfaceMessageID: surfaceMessageID,
                    routeAttempt: routeAttempt, commandID: commandID, errorStage: "inventory_after"
                )
                guard let snapshot = Self.bridgeDictionary(afterValue) else { continue }
                after = snapshot
                let postElapsed = attemptStart.duration(to: ContinuousClock.now)
                let postElapsedMS = Int(postElapsed.components.seconds * 1_000)
                    + Int(postElapsed.components.attoseconds / 1_000_000_000_000_000)
                (previousSnapshotFingerprint, previousMutationCount) = await recordAcquisitionSnapshot(
                    snapshot, attemptID: attemptID, trigger: trigger,
                    surfaceMessageID: surfaceMessageID, routeAttempt: routeAttempt,
                    commandID: commandID, label: entry.0, sequence: 6 + offset,
                    elapsedMS: postElapsedMS, previousFingerprint: previousSnapshotFingerprint,
                    previousMutationCount: previousMutationCount
                )
            }
            // Re-check account/route telemetry after the bounded snapshots and
            // before any diagnostic return or production extraction.
            let postPrepareProbeValue = await evaluateDetailJavaScript(
                Self.detailProbe, arguments: ["expectedURL": remoteURL], view: view,
                attemptID: attemptID, trigger: trigger, surfaceMessageID: surfaceMessageID,
                routeAttempt: routeAttempt, commandID: commandID, errorStage: "post_prepare_probe"
            )
            let postPrepareProbe = Self.bridgeDictionary(postPrepareProbeValue) ?? [:]
            let afterDOMIdentityFingerprint = Self.gmailDOMIdentityFingerprint(
                Self.bridgeStrings(after["native_ids"])
            )
            let domIdentityMatches = !beforeDOMIdentityFingerprint.isEmpty
                && beforeDOMIdentityFingerprint == afterDOMIdentityFingerprint
            var postPrepareRouteFields = Self.gmailPostPrepareRouteTraceMetadata(
                expectedURL: remoteURL,
                currentURL: view.url?.absoluteString ?? ""
            )
            postPrepareRouteFields["dom_identity_fingerprint"] = afterDOMIdentityFingerprint
            postPrepareRouteFields["dom_identity_matches"] = domIdentityMatches
            postPrepareRouteFields["route_attempt"] = routeAttempt
            postPrepareRouteFields["outcome"] = "observed"
            postPrepareRouteFields["route_matches"] = postPrepareProbe["route_matches"] as? Bool ?? false
            postPrepareRouteFields["account_path_matches"] = postPrepareProbe["account_path_matches"] as? Bool ?? false
            postPrepareRouteFields["preparation_enabled"] = preparationEnabled
            if !comparisonID.isEmpty { postPrepareRouteFields["comparison_id"] = comparisonID }
            if !commandID.isEmpty { postPrepareRouteFields["command_id"] = commandID }
            await recordAcquisitionTrace(
                attemptID: attemptID, trigger: trigger, stage: "post_prepare_route",
                surfaceMessageID: surfaceMessageID, fields: postPrepareRouteFields
            )
            let routeMatches = postPrepareProbe["route_matches"] as? Bool == true
            let accountPathMatches = postPrepareProbe["account_path_matches"] as? Bool == true
            guard Self.gmailDetailRouteGuardAllows(
                routeMatches: routeMatches, accountPathMatches: accountPathMatches,
                domIdentityMatches: domIdentityMatches
            ) else {
                var terminalFields = postPrepareRouteFields
                terminalFields["outcome"] = "failed"
                terminalFields["terminal_reason"] = "detail_route_changed_during_prepare"
                terminalFields["ingest_called"] = false
                terminalFields.merge(preparationFields) { current, _ in current }
                await recordAcquisitionTrace(
                    attemptID: attemptID, trigger: trigger, stage: "terminal",
                    surfaceMessageID: surfaceMessageID, fields: terminalFields
                )
                return ["ok": false,
                        "error": "Gmail route identity changed during conversation preparation",
                        "attempt_id": attemptID,
                        "terminal_reason": "detail_route_changed_during_prepare"]
            }
            if kqDryAction {
                var terminalFields = postPrepareRouteFields
                terminalFields["outcome"] = "observed"
                terminalFields["terminal_reason"] = "kq_dry_action_observed"
                terminalFields["ingest_called"] = false
                terminalFields.merge(preparationFields) { current, _ in current }
                await recordAcquisitionTrace(
                    attemptID: attemptID, trigger: trigger, stage: "terminal",
                    surfaceMessageID: surfaceMessageID, fields: terminalFields
                )
                return ["ok": true, "diagnostic_only": true, "complete": 0,
                        "attempt_id": attemptID,
                        "terminal_reason": "kq_dry_action_observed"]
            }
            if !preparationEnabled {
                var terminalFields = postPrepareRouteFields
                terminalFields["outcome"] = "observed"
                terminalFields["terminal_reason"] = "noop_preparation_observed"
                terminalFields["ingest_called"] = false
                terminalFields.merge(preparationFields) { current, _ in current }
                await recordAcquisitionTrace(
                    attemptID: attemptID, trigger: trigger, stage: "terminal",
                    surfaceMessageID: surfaceMessageID, fields: terminalFields
                )
                return ["ok": false, "diagnostic_only": true,
                        "attempt_id": attemptID,
                        "terminal_reason": "noop_preparation_observed"]
            }
            await recordAcquisitionTrace(
                attemptID: attemptID, trigger: trigger, stage: "dom_after_prepare",
                surfaceMessageID: surfaceMessageID,
                fields: [
                    "route_attempt": routeAttempt, "outcome": "observed",
                    "bridge_type": Self.bridgeTypeName(prepareValue),
                    "preparation_enabled": preparationEnabled,
                    "card_count": Self.bridgeInt(after["card_count"]),
                    "body_count": Self.bridgeInt(after["body_count"]),
                    "stack_count": Self.bridgeInt(after["stack_count"]),
                    "explicit_stack_count": Self.bridgeInt(after["explicit_stack_count"]),
                    "kq_stack_count": Self.bridgeInt(after["kq_stack_count"]),
                    "native_id_count": Self.bridgeInt(after["native_id_count"]),
                    "zero_size_count": Self.bridgeInt(after["zero_size_count"]),
                    "clicked_total": Self.bridgeInt(preparation["clicked_total"]),
                    "clicked_history_stack": Self.bridgeInt(preparation["clicked_history_stack"]),
                    "clicked_explicit_stack": Self.bridgeInt(preparation["clicked_explicit_stack"]),
                    "clicked_kq_stack": Self.bridgeInt(preparation["clicked_kq_stack"]),
                    "clicked_message_header": Self.bridgeInt(preparation["clicked_message_header"]),
                    "clicked_trimmed_content": Self.bridgeInt(preparation["clicked_trimmed_content"]),
                    "control_kinds": "history_stack,message_header,trimmed_content",
                ]
            )

            let rawValue: Any?
            do {
                rawValue = try await view.callAsyncJavaScript(
                    Self.detailScript,
                    arguments: ["expectedThreadCount": max(0, expectedThreadCount)],
                    contentWorld: .page
                )
            } catch {
                var errorFields = Self.gmailAcquisitionErrorFields(error, stage: "extraction")
                errorFields["route_attempt"] = routeAttempt
                if !commandID.isEmpty { errorFields["command_id"] = commandID }
                await recordAcquisitionTrace(
                    attemptID: attemptID, trigger: trigger, stage: "javascript_error",
                    surfaceMessageID: surfaceMessageID, fields: errorFields
                )
                throw error
            }
            let raw = Self.bridgeDictionary(rawValue)
            let messageValue = raw?["messages"]
            let items = Self.bridgeDictionaries(messageValue)
            await recordAcquisitionTrace(
                attemptID: attemptID, trigger: trigger, stage: "extraction_bridge",
                surfaceMessageID: surfaceMessageID,
                fields: [
                    "route_attempt": routeAttempt,
                    "outcome": raw != nil && items != nil ? "accepted_shape" : "unexpected_shape",
                    "bridge_type": Self.bridgeTypeName(rawValue),
                    "message_shape": Self.bridgeTypeName(messageValue),
                    "js_message_count": Self.bridgeInt(raw?["message_count"]),
                    "swift_message_count": items?.count ?? 0,
                ]
            )
            if let items {
                for (index, item) in items.prefix(100).enumerated() {
                    let evidence = Self.bridgeDictionary(item["capture_evidence"]) ?? [:]
                    let providerID = item["provider_message_id"] as? String ?? ""
                    let bodyText = item["body_text"] as? String ?? ""
                    let bodyHTML = item["body_html"] as? String ?? ""
                    var itemFields: [String: Any] = [
                        "route_attempt": routeAttempt, "item_index": index,
                        "item_outcome": "observed",
                        "message_identity_fingerprint": Self.gmailDiagnosticFingerprint(providerID),
                        "content_fingerprint": Self.gmailDiagnosticFingerprint(
                            [item["sender"] as? String ?? "", item["occurred_at"] ?? "",
                             item["subject"] as? String ?? "", bodyText].map(String.init(describing:)).joined(separator: "\u{0}")
                        ),
                        "native_id_present": (evidence["legacy_message_id"] as? Bool ?? false)
                            || (evidence["modern_message_id"] as? Bool ?? false),
                        "native_id_kind": (evidence["legacy_message_id"] as? Bool ?? false)
                            ? ((evidence["modern_message_id"] as? Bool ?? false) ? "both" : "legacy")
                            : ((evidence["modern_message_id"] as? Bool ?? false) ? "modern" : "none"),
                        "sender_present": !(item["sender"] as? String ?? "").isEmpty,
                        "date_present": item["occurred_at"] != nil,
                        "subject_present": !(item["subject"] as? String ?? "").isEmpty,
                        "body_present": !bodyText.isEmpty || !bodyHTML.isEmpty,
                        "clipped": evidence["clipped"] as? Bool ?? false,
                        "text_length": bodyText.count, "html_length": bodyHTML.count,
                    ]
                    if !commandID.isEmpty { itemFields["command_id"] = commandID }
                    await recordAcquisitionTrace(
                        attemptID: attemptID, trigger: trigger, stage: "extraction_item",
                        surfaceMessageID: surfaceMessageID, fields: itemFields
                    )
                }
            }
            guard let raw, let items else {
                await recordAcquisitionTrace(
                    attemptID: attemptID, trigger: trigger, stage: "terminal",
                    surfaceMessageID: surfaceMessageID,
                    fields: ["route_attempt": routeAttempt, "outcome": "failed",
                             "terminal_reason": "unexpected_javascript_bridge_shape",
                             "ingest_called": false]
                )
                return ["ok": false, "error": "Gmail returned an unexpected detail result",
                        "attempt_id": attemptID,
                        "terminal_reason": "unexpected_javascript_bridge_shape"]
            }
            let detectedMessageCount = Self.bridgeInt(raw["expected_message_count"], default: items.count)
            let expectedMessageCount = max(expectedThreadCount, detectedMessageCount)
            let collapsedMessageCount = Self.bridgeInt(raw["collapsed_message_count"])
            await recordAcquisitionTrace(
                attemptID: attemptID, trigger: trigger, stage: "completeness",
                surfaceMessageID: surfaceMessageID,
                fields: [
                    "route_attempt": routeAttempt,
                    "outcome": expectedMessageCount > 0 && items.count >= expectedMessageCount && collapsedMessageCount == 0
                        ? "accepted" : "rejected",
                    "expected_message_count": expectedMessageCount,
                    "swift_message_count": items.count,
                    "collapsed_message_count": collapsedMessageCount,
                    "collapsed_card_count": Self.bridgeInt(raw["collapsed_card_count"]),
                    "unresolved_explicit_stack_count": Self.bridgeInt(raw["unresolved_explicit_stack_count"]),
                    "unresolved_kq_stack_count": Self.bridgeInt(raw["unresolved_kq_stack_count"]),
                ]
            )
            // A conversation is complete only if extraction accounted for every
            // Gmail message card. Gmail can leave older cards collapsed after a
            // click (or render a compact card with no body); persisting the one
            // visible body as complete made Willo permanently show a one-email
            // conversation for a multi-email Gmail thread.
            guard expectedMessageCount > 0, items.count >= expectedMessageCount,
                  collapsedMessageCount == 0 else {
                await recordAcquisitionTrace(
                    attemptID: attemptID, trigger: trigger, stage: "terminal",
                    surfaceMessageID: surfaceMessageID,
                    fields: ["route_attempt": routeAttempt, "outcome": "failed",
                             "terminal_reason": "completeness_rejected",
                             "expected_message_count": expectedMessageCount,
                             "swift_message_count": items.count,
                             "collapsed_message_count": collapsedMessageCount,
                             "collapsed_card_count": Self.bridgeInt(raw["collapsed_card_count"]),
                             "unresolved_explicit_stack_count": Self.bridgeInt(raw["unresolved_explicit_stack_count"]),
                             "unresolved_kq_stack_count": Self.bridgeInt(raw["unresolved_kq_stack_count"]),
                             "ingest_called": false]
                )
                return [
                    "ok": false,
                    "error": "Gmail exposed only \(items.count) of \(expectedMessageCount) messages in this conversation; \(collapsedMessageCount) remained collapsed",
                    "expected_messages": expectedMessageCount,
                    "captured_messages": items.count,
                    "collapsed_messages": collapsedMessageCount,
                    "attempt_id": attemptID, "terminal_reason": "completeness_rejected",
                ]
            }
            var captures: [[String: Any]] = []
            var droppedSenderCount = 0
            for message in items {
                var capture = message
                if !Self.hasMailbox(capture["sender"] as? String ?? ""), Self.hasMailbox(fallbackSender) {
                    capture["sender"] = fallbackSender
                }
                if (capture["subject"] as? String ?? "").isEmpty {
                    capture["subject"] = fallbackSubject
                }
                guard Self.hasMailbox(capture["sender"] as? String ?? "") else {
                    droppedSenderCount += 1
                    continue
                }
                capture["account_id"] = Self.accountID
                capture["provider"] = "gmail-web"
                capture["surface_message_id"] = surfaceMessageID
                capture["capture_method"] = "gmail_dom_detail"
                // Thread capture v1 expands and verifies every message card.
                // Keep capture_version=2 for the per-message full-body fallback
                // semantics used to avoid retrying immutable clipped content.
                capture["capture_version"] = 2
                capture["thread_capture_version"] = 1
                if (capture["content_state"] as? String) == "partial",
                   let fullURL = capture["full_message_url"] as? String, !fullURL.isEmpty {
                    capture = await recoverClippedMessage(capture, fullMessageURL: fullURL)
                }
                capture.removeValue(forKey: "full_message_url")
                captures.append(capture)
            }
            await recordAcquisitionTrace(
                attemptID: attemptID, trigger: trigger, stage: "capture_validation",
                surfaceMessageID: surfaceMessageID,
                fields: ["route_attempt": routeAttempt,
                         "outcome": captures.isEmpty ? "rejected" : "accepted",
                         "swift_message_count": items.count, "capture_count": captures.count,
                         "dropped_sender_count": droppedSenderCount]
            )
            guard !captures.isEmpty else {
                await recordAcquisitionTrace(
                    attemptID: attemptID, trigger: trigger, stage: "terminal",
                    surfaceMessageID: surfaceMessageID,
                    fields: ["route_attempt": routeAttempt, "outcome": "failed",
                             "terminal_reason": "all_messages_missing_sender",
                             "dropped_sender_count": droppedSenderCount, "ingest_called": false]
                )
                return ["ok": false, "error": "Gmail opened the conversation but exposed no message bodies",
                        "attempt_id": attemptID, "terminal_reason": "all_messages_missing_sender"]
            }
            await recordAcquisitionTrace(
                attemptID: attemptID, trigger: trigger, stage: "ingest_started",
                surfaceMessageID: surfaceMessageID,
                fields: ["route_attempt": routeAttempt, "outcome": "started",
                         "capture_count": captures.count, "ingest_called": true]
            )
            ingestCalled = true
            let result = try await CoreClient.shared.call(method: "email.source.ingest", params: ["captures": captures])
            let accepted = result["accepted"] as? Int ?? 0
            let rejected = result["rejected"] as? Int ?? captures.count
            let ignored = result["ignored"] as? Int ?? 0
            await recordAcquisitionTrace(
                attemptID: attemptID, trigger: trigger, stage: "ingest_completed",
                surfaceMessageID: surfaceMessageID,
                fields: ["route_attempt": routeAttempt,
                         "outcome": accepted > 0 ? "accepted" : "rejected",
                         "capture_count": captures.count, "accepted_count": accepted,
                         "rejected_count": rejected, "ignored_count": ignored,
                         "ingest_called": true]
            )
            guard accepted > 0 else {
                await recordAcquisitionTrace(
                    attemptID: attemptID, trigger: trigger, stage: "terminal",
                    surfaceMessageID: surfaceMessageID,
                    fields: ["route_attempt": routeAttempt, "outcome": "failed",
                             "terminal_reason": "core_rejected_all_captures",
                             "accepted_count": accepted, "rejected_count": rejected,
                             "ignored_count": ignored, "ingest_called": true]
                )
                return ["ok": false,
                        "error": "Gmail exposed no message with a valid sender address",
                        "rejected": rejected, "result": result, "attempt_id": attemptID,
                        "terminal_reason": "core_rejected_all_captures"]
            }
            // Counts describe persisted captures, not merely DOM nodes. Invalid
            // sibling messages are isolated by Core and retried on the next Sync.
            let persisted = max(0, captures.count - rejected)
            let complete = captures.filter { ($0["content_state"] as? String) == "rendered_complete" }.count
            let persistedComplete = min(complete, persisted)
            await recordAcquisitionTrace(
                attemptID: attemptID, trigger: trigger, stage: "terminal",
                surfaceMessageID: surfaceMessageID,
                fields: ["route_attempt": routeAttempt, "outcome": "succeeded",
                         "terminal_reason": "persisted", "capture_count": captures.count,
                         "accepted_count": accepted, "rejected_count": rejected,
                         "ignored_count": ignored, "ingest_called": true]
            )
            return ["ok": true, "captures": persisted, "complete": persistedComplete,
                    "partial": persisted - persistedComplete, "rejected": rejected,
                    "result": result, "attempt_id": attemptID, "terminal_reason": "persisted"]
        } catch {
            var terminalFields = Self.gmailAcquisitionErrorFields(error, stage: "none")
            terminalFields.merge([
                "route_attempt": routeAttempt, "outcome": "failed",
                "terminal_reason": "native_exception", "ingest_called": ingestCalled,
            ]) { _, new in new }
            if !commandID.isEmpty { terminalFields["command_id"] = commandID }
            await recordAcquisitionTrace(
                attemptID: attemptID, trigger: trigger, stage: "terminal",
                surfaceMessageID: surfaceMessageID, fields: terminalFields
            )
            return ["ok": false, "error": "Could not capture Gmail message details: \(error)",
                    "attempt_id": attemptID, "terminal_reason": "native_exception"]
        }
    }

    private func recoverClippedMessage(_ partial: [String: Any],
                                       fullMessageURL: String) async -> [String: Any] {
        var capture = partial
        let expectedMessageID = partial["provider_message_id"] as? String ?? ""
        guard let url = Self.gmailFullMessageURL(
            from: fullMessageURL, expectedLegacyMessageID: expectedMessageID
        ) else {
            capture["capture_evidence"] = Self.fullMessageEvidence(partial["capture_evidence"],
                attempted: true, loaded: false, reason: "unsafe_or_unrecognized_full_message_url")
            return capture
        }

        // “View entire message” opens a dedicated Gmail document. Keep that
        // navigation away from both inbox discovery and conversation extraction
        // while sharing the authenticated WKWebsiteDataStore.
        let view = fullMessageWebView()
        view.load(URLRequest(url: url))
        var ready = false
        for _ in 0..<60 {
            if let current = view.url, isLoginURL(current) { break }
            let found = (try? await view.callAsyncJavaScript(
                Self.fullMessageProbe, arguments: [:], contentWorld: .page
            )) as? Bool ?? false
            if found { ready = true; break }
            try? await Task.sleep(nanoseconds: 250_000_000)
        }
        guard ready, let current = view.url, Self.gmailFullMessageURL(
            from: current.absoluteString, expectedLegacyMessageID: expectedMessageID
        ) != nil else {
            capture["capture_evidence"] = Self.fullMessageEvidence(partial["capture_evidence"],
                attempted: true, loaded: false, reason: "full_message_page_did_not_load")
            return capture
        }

        do {
            let full = (try await view.callAsyncJavaScript(
                Self.fullMessageScript, arguments: [:], contentWorld: .page
            )) as? [String: Any] ?? [:]
            let text = (full["body_text"] as? String ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
            let html = full["body_html"] as? String ?? ""
            let partialText = (partial["body_text"] as? String ?? "")
                .trimmingCharacters(in: .whitespacesAndNewlines)
            // An authenticated Gmail error document also has a body. Require the
            // dedicated page to preserve at least the already captured content
            // before upgrading completeness.
            guard !html.isEmpty, text.count >= max(40, partialText.count) else {
                capture["capture_evidence"] = Self.fullMessageEvidence(partial["capture_evidence"],
                    attempted: true, loaded: false, reason: "full_message_page_had_no_body")
                return capture
            }
            capture["body_text"] = text
            capture["body_html"] = html
            capture["links"] = full["links"] as? [[String: Any]] ?? capture["links"]
            capture["attachments"] = full["attachments"] as? [[String: Any]] ?? capture["attachments"]
            capture["content_state"] = "rendered_complete"
            capture["capture_method"] = "gmail_dom_view_entire_message"
            capture["remote_url"] = current.absoluteString
            capture["capture_evidence"] = Self.fullMessageEvidence(partial["capture_evidence"],
                attempted: true, loaded: true, reason: "")
            return capture
        } catch {
            capture["capture_evidence"] = Self.fullMessageEvidence(partial["capture_evidence"],
                attempted: true, loaded: false, reason: "full_message_extraction_failed")
            return capture
        }
    }

    private static func fullMessageEvidence(_ existing: Any?, attempted: Bool,
                                            loaded: Bool, reason: String) -> [String: Any] {
        var evidence = existing as? [String: Any] ?? [:]
        evidence["full_message_attempted"] = attempted
        evidence["full_message_loaded"] = loaded
        if reason.isEmpty { evidence.removeValue(forKey: "full_message_failure") }
        else { evidence["full_message_failure"] = reason }
        return evidence
    }

    static func gmailFullMessageURL(from value: String,
                                    expectedLegacyMessageID: String = "") -> URL? {
        guard let url = URL(string: value), url.scheme?.lowercased() == "https",
              let host = url.host?.lowercased(), allowedHost(host),
              let components = URLComponents(url: url, resolvingAgainstBaseURL: false) else { return nil }
        var query: [String: String] = [:]
        for item in components.queryItems ?? [] where query[item.name.lowercased()] == nil {
            query[item.name.lowercased()] = item.value ?? ""
        }
        guard query["view"]?.lowercased() == "lg",
              let permanentID = query["permmsgid"], permanentID.hasPrefix("msg-f:") else { return nil }
        if !expectedLegacyMessageID.isEmpty {
            guard let decimalID = UInt64(expectedLegacyMessageID, radix: 16),
                  permanentID == "msg-f:\(decimalID)" else { return nil }
        }
        return url
    }

    func open(remoteURL: String) -> [String: Any] {
        guard !Self.legacyAutomatedGmailAccessIsDisabled else {
            return ["ok": false, "error": Self.legacyAutomationDisabledError]
        }
        guard !Self.gmailAccessIsSuspended else {
            return ["ok": false, "access_suspended": true, "error": Self.gmailAccessSuspendedError]
        }
        guard let url = URL(string: remoteURL), let host = url.host?.lowercased(),
              Self.allowedHost(host) else {
            return ["ok": false, "error": "This email has no safe Gmail URL"]
        }
        _ = login()
        // Opening a message is a browsing action; keep the Gmail window open.
        (loginWindow?.contentView as? WKWebView)?.load(URLRequest(url: url))
        return ["ok": true]
    }

    private func mailboxURL() -> URL {
        if let configured = UserDefaults(suiteName: "group.arbol")?.string(forKey: "arbol-web-mail-url"),
           let url = URL(string: configured), let host = url.host?.lowercased(), Self.allowedHost(host) {
            return url
        }
        return Self.defaultURL
    }

    private static func hasMailbox(_ value: String) -> Bool {
        // Validation remains authoritative in Core. This only prevents one
        // transient Gmail row with no address from aborting the entire batch.
        let parts = value.split(whereSeparator: { $0.isWhitespace || $0 == "<" || $0 == ">" })
        return parts.contains { part in
            let address = part.trimmingCharacters(in: CharacterSet(charactersIn: "\"(),;"))
            guard let at = address.lastIndex(of: "@") else { return false }
            return at != address.startIndex && address.index(after: at) != address.endIndex
                && address[address.index(after: at)...].contains(".")
        }
    }

    private static func allowedHost(_ host: String) -> Bool {
        host == "mail.google.com" || host.hasSuffix(".mail.google.com")
    }

    private func isLoginURL(_ url: URL?) -> Bool {
        guard let url, let host = url.host?.lowercased() else { return true }
        if host == "accounts.google.com" || host.hasSuffix(".accounts.google.com") { return true }
        if host != "mail.google.com" && !host.hasSuffix(".mail.google.com") { return true }
        let path = url.path.lowercased()
        return path.contains("/login") || path.contains("/signin") || path.contains("/servicelogin")
    }

    private func hasGoogleSessionCookies() async -> Bool {
        let authenticatedNames = Set(["SID", "HSID", "SSID", "APISID", "SAPISID", "LSID", "OSID", "GMAIL_AT"])
        let cookies = await store.httpCookieStore.allCookies()
        return cookies.contains { cookie in
            let domain = cookie.domain.lowercased()
            let googleDomain = domain == "google.com" || domain.hasSuffix(".google.com")
            let name = cookie.name.uppercased()
            return googleDomain && (authenticatedNames.contains(name) || name.hasSuffix("PSID")
                || name.hasSuffix("PSIDTS"))
        }
    }

    private func waitForGmailSurface(_ view: WKWebView, expectedURL: URL) async -> Bool {
        for _ in 0..<90 {
            if Self.isExplicitGoogleLoginURL(view.url) { return false }
            let ready = (try? await view.callAsyncJavaScript(
                Self.expectedSurfaceProbe,
                arguments: ["expectedURL": expectedURL.absoluteString],
                contentWorld: .page
            )) as? Bool ?? false
            if ready { return true }
            try? await Task.sleep(nanoseconds: 300_000_000)
        }
        return false
    }

    private func waitForInbox(_ view: WKWebView) async -> Bool {
        for _ in 0..<90 { // Gmail and Workspace SSO can take longer than a static mailbox.
            // WKWebView keeps its previous URL (often about:blank) briefly after
            // load(_:) starts. isLoginURL intentionally treats every non-Gmail
            // host as unauthenticated, so using it here made a fresh scraper fail
            // before the Gmail navigation had even begun. Abort only when Google
            // has actually navigated to an authentication page; transient blank,
            // SSO, redirect, and prior-document URLs must be allowed to settle.
            if Self.isExplicitGoogleLoginURL(view.url) { return false }
            let ready = (try? await view.callAsyncJavaScript(Self.contentProbe,
                            arguments: [:], contentWorld: .page)) as? Bool ?? false
            if ready { return true }
            try? await Task.sleep(nanoseconds: 500_000_000)
        }
        return false
    }

    static func isExplicitGoogleLoginURL(_ url: URL?) -> Bool {
        guard let url, let host = url.host?.lowercased() else { return false }
        if host == "accounts.google.com" || host.hasSuffix(".accounts.google.com") { return true }
        guard host == "mail.google.com" || host.hasSuffix(".mail.google.com") else { return false }
        let path = url.path.lowercased()
        return path.contains("/login") || path.contains("/signin") || path.contains("/servicelogin")
    }

    static func isGmailProviderChallengeURL(_ url: URL?) -> Bool {
        guard let url, let host = url.host?.lowercased() else { return false }
        guard host == "mail.google.com" || host.hasSuffix(".mail.google.com")
                || host == "accounts.google.com" || host.hasSuffix(".accounts.google.com") else {
            return false
        }
        // Challenge destinations are provider routes, never Gmail search terms,
        // thread fragments, or arbitrary query values. Inspecting the whole URL
        // made #search/challenge and similarly named emails open the circuit.
        let path = url.path.lowercased()
        let pathMarkers = [
            "/accountdisabled", "/accounttemporarilylocked", "/unusualusage",
            "/displayunlockcaptcha", "/signin/rejected", "/signin/challenge",
            "/challenge/", "/challenge"
        ]
        return pathMarkers.contains { marker in
            path == marker || path.hasSuffix(marker) || path.contains(marker + "/")
        }
    }

    private func recordFailure(_ error: String, needsLogin: Bool) async {
        _ = try? await CoreClient.shared.call(method: "email.surface.sync.failed", params: [
            "account_id": Self.accountID, "needs_login": needsLogin, "error": error,
        ])
    }

    private func persistSessionCookies() async {
        let jar = store.httpCookieStore
        let cookies = await jar.allCookies()
        let expiry = Date().addingTimeInterval(60 * 60 * 24 * 30)
        for cookie in cookies where cookie.isSessionOnly || cookie.expiresDate == nil {
            var properties = cookie.properties ?? [:]
            properties[.expires] = expiry
            properties.removeValue(forKey: .discard)
            if let persistent = HTTPCookie(properties: properties) { await jar.setCookie(persistent) }
        }
    }

    static let openInboxRowScript = #"""
const clean = (value) => (value || '').replace(/\s+/g, ' ').trim();
const comparable = (value) => clean(value).toLocaleLowerCase()
  .replace(/[\u2018\u2019]/g, "'").replace(/[\u201c\u201d]/g, '"')
  .replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const rows = Array.from(document.querySelectorAll(
  'tr.zA, [role="main"] tr[data-legacy-thread-id], [role="main"] tr[data-thread-id]'
)).filter(node => {
  const rect = node.getBoundingClientRect();
  return rect.width > 200 && rect.height > 20;
});
const wanted = comparable(expectedSubject || '');
const expectedTime = Number(expectedTimestamp || 0);
const identityRequired = !!requireIdentityMatch;
const normalizeNativeID = (value) => clean(value).replace(/^#/, '')
  .replace(/^(thread|msg)-[af]:/i, '').toLocaleLowerCase();
const wantedProviderMessageID = normalizeNativeID(
  typeof expectedProviderMessageID === 'undefined' ? '' : expectedProviderMessageID
);
const wantedMailbox = clean(typeof expectedSender === 'undefined' ? '' : expectedSender)
  .match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0]?.toLocaleLowerCase() || '';
const score = (node) => {
  const subjectNode = node.querySelector('.bog, [data-thread-id] .bog, [data-thread-id]');
  const subject = comparable(subjectNode && (subjectNode.innerText || subjectNode.textContent));
  if (!wanted) return {value: 1, identity: true};
  let similarity = 0;
  if (subject === wanted) similarity = 1;
  else if (subject && (wanted.startsWith(subject) || subject.startsWith(wanted)))
    similarity = Math.min(subject.length, wanted.length) / Math.max(subject.length, wanted.length);
  else {
    const wantedTokens = new Set(wanted.split(' ').filter(token => token.length >= 3));
    const subjectTokens = new Set(subject.split(' ').filter(token => token.length >= 3));
    const overlap = [...wantedTokens].filter(token => subjectTokens.has(token)).length;
    similarity = overlap / Math.max(1, Math.max(wantedTokens.size, subjectTokens.size));
  }
  const dateNode = node.querySelector('td.xW span[title], .xW span[title], time, [data-time], [data-timestamp]');
  const dateRaw = clean(dateNode && (dateNode.getAttribute('datetime') || dateNode.getAttribute('title')
    || dateNode.getAttribute('data-time') || dateNode.getAttribute('data-timestamp')));
  let rowTime = /^\d{10,13}$/.test(dateRaw) ? Number(dateRaw) : Date.parse(dateRaw);
  if (rowTime > 0 && rowTime < 100000000000) rowTime *= 1000;
  const minutes = expectedTime > 0 && Number.isFinite(rowTime) ? Math.abs(rowTime - expectedTime) / 60000 : 0;
  const timeScore = expectedTime > 0 && Number.isFinite(rowTime) ? Math.max(0, 0.25 - Math.min(minutes, 1440) / 5760) : 0;
  const identityNodes = [node, ...Array.from(node.querySelectorAll(
    '[data-legacy-message-id], [data-message-id], [data-legacy-thread-id], [data-thread-id]'
  ))];
  const nativeMessageIDs = identityNodes.flatMap(value => [
    value.getAttribute('data-legacy-message-id'), value.getAttribute('data-message-id')
  ]).filter(Boolean).map(normalizeNativeID);
  const nativeThreadIDs = identityNodes.flatMap(value => [
    value.getAttribute('data-legacy-thread-id'), value.getAttribute('data-thread-id')
  ]).filter(Boolean).map(normalizeNativeID);
  // Durable Surface IDs originate from Gmail's strongest list-row identity.
  // Depending on the Gmail layout that identity can be either a message ID or
  // a thread ID. The old matcher checked only message attributes, so rows whose
  // exact identity was exposed as data-legacy-thread-id were rejected.
  const providerMessageMatch = !!wantedProviderMessageID
    && (nativeMessageIDs.includes(wantedProviderMessageID)
      || nativeThreadIDs.includes(wantedProviderMessageID));
  const senderEvidence = clean(Array.from(node.querySelectorAll('[email], [data-hovercard-id]'))
    .map(value => value.getAttribute('email') || value.getAttribute('data-hovercard-id') || '').join(' ')).toLocaleLowerCase();
  const senderMatch = !wantedMailbox || senderEvidence.includes(wantedMailbox);
  const senderUnavailable = !!wantedMailbox && !senderEvidence.includes('@');
  // Search-result rows often omit hovercard/email attributes even though the
  // query itself is sender/day bounded. In that layout, require a strong subject
  // and a same-day timestamp rather than rejecting every valid row. An exact
  // provider-message attribute is conclusive and takes precedence over display
  // text, which Gmail can truncate or localize.
  const expectedKeys = wanted.match(/(?:[a-z][a-z0-9]+-\d+|!\d+)/g) || [];
  const stableKeyMatch = expectedKeys.length > 0
    && expectedKeys.some(key => subject.split(' ').includes(key));
  // Some Gmail search layouts render only a short date (or no parseable date)
  // even though the active query itself is bounded to one sender and one day.
  // In that case the query is the time evidence; retain strong subject/key
  // evidence rather than rejecting every row for a missing display timestamp.
  const route = decodeURIComponent(location.hash || '').toLocaleLowerCase();
  const dayBoundSearch = route.startsWith('#search/')
    && route.includes('after:') && route.includes('before:');
  const timeMatches = expectedTime <= 0 || (Number.isFinite(rowTime) && minutes <= 36 * 60)
    || (!Number.isFinite(rowTime) && dayBoundSearch);
  const subjectIdentity = similarity >= 0.72 || stableKeyMatch;
  const fallbackIdentity = subjectIdentity && timeMatches && (senderMatch || senderUnavailable);
  return {value: similarity + timeScore + (senderMatch && wantedMailbox ? 0.3 : 0)
      + (providerMessageMatch ? 10 : 0),
    identity: providerMessageMatch || fallbackIdentity};
};
let row = rows[Number(rowIndex)];
if (identityRequired || !row || (wanted && !clean(row.textContent).includes(clean(expectedSubject)))) {
  const ranked = rows.map(node => ({node, ...score(node)})).sort((a, b) => b.value - a.value);
  row = ranked.length && (!identityRequired || ranked[0].identity) ? ranked[0].node : null;
}
if (!row) return (typeof returnConversationURL !== 'undefined' && returnConversationURL) ? '' : false;
if (typeof returnConversationURL !== 'undefined' && returnConversationURL) {
  // Search-result rows frequently carry the stable Gmail thread identifier on
  // the row/descendant while omitting a conventional anchor. Prefer either
  // source over click navigation, which some Gmail builds absorb without
  // changing window.location in an off-screen WKWebView.
  const idNode = row.matches('[data-legacy-thread-id], [data-thread-id], [data-legacy-message-id]')
    ? row : row.querySelector('[data-legacy-thread-id], [data-thread-id], [data-legacy-message-id]');
  const rejected = clean(typeof rejectedConversationURL === 'undefined' ? '' : rejectedConversationURL);
  const isRejected = (value) => {
    if (!rejected || !value) return false;
    try {
      const left = new URL(value, location.href);
      const right = new URL(rejected, location.href);
      return left.origin === right.origin && left.pathname.replace(/\/$/, '') === right.pathname.replace(/\/$/, '')
        && decodeURIComponent(left.hash) === decodeURIComponent(right.hash);
    } catch (_) { return value === rejected; }
  };
  // Prefer Gmail's explicit thread identity over the row href. The remaining
  // legacy failures exposed a canonical data-legacy-thread-id but linked to the
  // same unusable #inbox/<message-id> route that had just timed out. Returning
  // the href first made recovery appear to succeed, after which Swift rejected
  // it as unchanged and never emitted route_attempt=2.
  const rawID = row.getAttribute('data-legacy-thread-id') || row.getAttribute('data-thread-id')
    || (idNode && (idNode.getAttribute('data-legacy-thread-id') || idNode.getAttribute('data-thread-id'))) || '';
  const stableID = rawID.replace(/^#/, '').replace(/^(thread|msg)-[af]:/i, '');
  if (stableID) {
    const accountPath = location.pathname.replace(/\/$/, '');
    const threadURL = `${location.origin}${accountPath}/#inbox/${encodeURIComponent(stableID)}`;
    if (!isRejected(threadURL)) return threadURL;
  }
  const linkNode = row.querySelector('a[href*="#inbox/"], a[href*="#all/"], a[href*="#search/"]');
  const href = clean(linkNode && linkNode.getAttribute('href'));
  if (href) {
    const absolute = new URL(href, location.href).href;
    const parts = new URL(absolute).hash.split('?')[0].split('/').filter(Boolean);
    if (!isRejected(absolute) && parts.length >= 2 && (parts[0] !== '#search' || parts.length >= 3))
      return absolute;
  }
  // data-legacy-message-id and an unchanged href identify the already-failed
  // message route. Fall through to a real row click and observe Gmail's current
  // canonical route instead of returning that route again.
  // Return a string in this mode so Swift can distinguish a scheduled click
  // from “no identity-matching result”.
  setTimeout(() => row.click(), 0);
  return 'clicked';
}
// Return to WebKit before Gmail replaces the page's JS world. Awaiting a click-
// initiated SPA navigation can otherwise produce “completion handler is no
// longer reachable”.
setTimeout(() => row.click(), 0);
return true;
"""#

    private static let detailProbe = #"""
const expected = new URL(expectedURL);
const expectedID = expected.hash.split('/').pop() || '';
const currentID = location.hash.split('/').pop() || '';
const visible = (node) => {
  const rect = node.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
};
const cards = Array.from(document.querySelectorAll(
  '[data-legacy-message-id], [data-message-id], .adn.ads'
));
const bodies = Array.from(document.querySelectorAll('.a3s.aiL, .a3s'));
// Gmail's mailbox toolbar also labels previous-page navigation as “Older messages”.
// Those global controls are not conversation history and clicking them can replace
// the intended thread. Only Gmail's structurally distinct history stack is safe
// to inventory here; collapsed message cards are accounted for separately.
const explicitStacks = [];
const kqStacks = Array.from(document.querySelectorAll('.kQ')).filter(node => !node.closest('.a3s'));
const stacks = kqStacks;
const routeMatches = expectedID === currentID;
const accountPathMatches = location.pathname.replace(/\/$/, '') === expected.pathname.replace(/\/$/, '');
return {
  // The native navigation-generation barrier now proves this DOM belongs to
  // the current fresh acquisition view. Gmail may canonicalize the hash after
  // commit, so route equality is telemetry here; keep account isolation and
  // require actual message DOM.
  ready: accountPathMatches && (cards.length > 0 || bodies.length > 0),
  route_matches: routeMatches,
  account_path_matches: accountPathMatches,
  card_count: cards.length,
  body_count: bodies.length,
  stack_count: stacks.length,
  explicit_stack_count: explicitStacks.length,
  kq_stack_count: kqStacks.length,
  native_id_count: document.querySelectorAll('[data-legacy-message-id], [data-message-id]').length,
  zero_size_count: cards.filter(node => !visible(node)).length
};
"""#

    static let detailInventoryScript = #"""
const clean = (value) => (value || '').replace(/\s+/g, ' ').trim();
const visible = (node) => {
  const rect = node.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
};
const hashText = async (value) => {
  const text = String(value || '');
  if (globalThis.crypto && globalThis.crypto.subtle && globalThis.TextEncoder) {
    const bytes = new TextEncoder().encode(text);
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest)).map(value => value.toString(16).padStart(2, '0')).join('');
  }
  let hash = 2166136261;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index); hash = Math.imul(hash, 16777619);
  }
  return `fnv-${(hash >>> 0).toString(16).padStart(8, '0')}`;
};
const bodyOf = (node) => node && node.querySelector(':scope > .a3s, :scope > div > .a3s, .a3s.aiL, .a3s');
const primaryCards = Array.from(document.querySelectorAll('.adn.ads'));
const nativeNodes = Array.from(document.querySelectorAll('[data-legacy-message-id], [data-message-id]'));
const fallbackCards = primaryCards.length ? primaryCards : nativeNodes.filter(node =>
  !nativeNodes.some(other => other !== node && node.contains(other))
);
const bodyNodes = Array.from(document.querySelectorAll('.a3s.aiL, .a3s'))
  .filter((body, index, all) => !all.some((other, otherIndex) => otherIndex !== index && other.contains(body)));
const ownerOf = (body) => {
  const known = body.closest('.adn.ads')
    || body.closest('[data-legacy-message-id], [data-message-id]');
  if (known) return known;
  // Some Gmail Workspace layouts expose a message header/body owner without
  // `.adn.ads` or a native-ID wrapper. Walk only to the nearest ancestor that
  // owns exactly one sender plus date/header evidence and this body.
  let owner = body.parentElement;
  for (let depth = 0; owner && owner !== document.body && depth < 24;
       depth += 1, owner = owner.parentElement) {
    if (owner.querySelectorAll('.gD[email], [email]').length === 1
        && owner.querySelector('.g3[title], time, [data-time], [data-timestamp]')
        && owner.querySelector('.gE.iv.gt, .gE')) return owner;
  }
  return body.parentElement;
};
const nativeID = (node) => {
  if (!node) return '';
  const idNode = node.matches && node.matches('[data-legacy-message-id], [data-message-id]')
    ? node : node.querySelector && node.querySelector('[data-legacy-message-id], [data-message-id]');
  return clean(node.getAttribute && (node.getAttribute('data-legacy-message-id') || node.getAttribute('data-message-id')))
    || clean(idNode && (idNode.getAttribute('data-legacy-message-id') || idNode.getAttribute('data-message-id')));
};
const nativeKind = (node) => {
  if (!node) return 'none';
  const idNode = node.matches && node.matches('[data-legacy-message-id], [data-message-id]')
    ? node : node.querySelector && node.querySelector('[data-legacy-message-id], [data-message-id]');
  const legacy = !!(node.getAttribute && node.getAttribute('data-legacy-message-id'))
    || !!(idNode && idNode.getAttribute('data-legacy-message-id'));
  const modern = !!(node.getAttribute && node.getAttribute('data-message-id'))
    || !!(idNode && idNode.getAttribute('data-message-id'));
  return legacy && modern ? 'both' : (legacy ? 'legacy' : (modern ? 'modern' : 'none'));
};
const ownerKind = (node) => {
  if (!node) return 'none';
  if (node.closest('.a3s')) return 'body';
  if (node.closest('.adn.ads')) return 'message_card';
  if (node.closest('[data-legacy-message-id], [data-message-id]')) return 'native_id_owner';
  if (node.closest('[role="main"], [data-thread-perm-id]')) return 'conversation';
  return 'other';
};
const tagKind = (node) => {
  const tag = (node && node.tagName || '').toLowerCase();
  return ['div','span','button','a','tr','td','section'].includes(tag) ? tag : (tag ? 'other' : 'none');
};
const roleKind = (node) => {
  const role = clean(node && node.getAttribute && node.getAttribute('role')).toLowerCase();
  return ['button','listitem','main','region'].includes(role) ? role : (role ? 'other' : 'none');
};
const dimensions = (node) => {
  const rect = node.getBoundingClientRect();
  return {width_bucket: Math.min(100, Math.max(0, Math.ceil(rect.width / 20))),
    height_bucket: Math.min(100, Math.max(0, Math.ceil(rect.height / 20)))};
};
const mutationKey = '__arbolWilloDetailMutationStateV1';
if (!globalThis[mutationKey]) {
  const state = {count: 0};
  const observer = new MutationObserver(records => { state.count += records.length; });
  observer.observe(document.documentElement || document, {subtree:true, childList:true, attributes:true, characterData:true});
  state.observer = observer;
  globalThis[mutationKey] = state;
}
const nativeIDs = nativeNodes.flatMap(node => [
  node.getAttribute('data-legacy-message-id'), node.getAttribute('data-message-id')
]).filter(value => typeof value === 'string' && value.length > 0).slice(0, 500);
const uniqueNativeIDs = [...new Set(nativeIDs)];
const uniqueBodyOwners = [];
const seenBodyOwners = new Set();
for (const body of bodyNodes) {
  const owner = ownerOf(body);
  if (owner && !seenBodyOwners.has(owner)) { seenBodyOwners.add(owner); uniqueBodyOwners.push({owner, body}); }
}
const rawKQ = Array.from(document.querySelectorAll('.kQ')).filter(node => !node.closest('.a3s'));
const qualifyingKQ = rawKQ.filter(control => {
  const label = clean([control.getAttribute('aria-label'), control.getAttribute('data-tooltip'),
    control.getAttribute('title'), control.textContent].filter(Boolean).join(' '));
  return visible(control) && (!!control.querySelector('.adx') || /(?:^|\s)\d+(?:\s|$)/.test(label));
});
const trimmedControls = Array.from(document.querySelectorAll(
  '.ajR, [aria-label*="trimmed content" i], [data-tooltip*="trimmed content" i]'
)).filter(visible);
const bodylessCards = fallbackCards.filter(card => !bodyOf(card));
const candidateRows = [];
const addCandidate = async (node, candidateKind, index) => {
  if (candidateRows.length >= 100) return;
  const label = clean([node.getAttribute('aria-label'), node.getAttribute('data-tooltip'),
    node.getAttribute('title'), node.textContent].filter(Boolean).join(' '));
  const owner = node.closest('.adn.ads, [data-legacy-message-id], [data-message-id], [role="main"], [data-thread-perm-id]');
  const structure = [candidateKind, tagKind(node), roleKind(node), ownerKind(node),
    !!node.closest('.a3s'), !!node.closest('.adn.ads'), !!node.querySelector('.adx'),
    /(?:^|\s)\d+(?:\s|$)/.test(label), visible(node)].join('|');
  candidateRows.push({candidate_kind:candidateKind, candidate_index:index,
    candidate_seed:await hashText(structure), owner_seed:await hashText(nativeID(owner) || `${ownerKind(node)}|${index}`),
    tag_kind:tagKind(node), role_kind:roleKind(node), owner_kind:ownerKind(node),
    inside_body:!!node.closest('.a3s'), inside_card:!!node.closest('.adn.ads'),
    has_adx:!!node.querySelector('.adx'), has_numeric_label:/(?:^|\s)\d+(?:\s|$)/.test(label),
    visible:visible(node), ancestor_depth:Math.min(50, (() => { let depth=0,current=node; while(current&&current.parentElement){depth++;current=current.parentElement;} return depth;})()),
    ...dimensions(node)});
};
for (let index=0; index<rawKQ.length; index++) await addCandidate(rawKQ[index], qualifyingKQ.includes(rawKQ[index]) ? 'kq_qualifying' : 'kq_raw', index);
for (let index=0; index<trimmedControls.length; index++) await addCandidate(trimmedControls[index], 'trimmed_content', index);
for (let index=0; index<bodylessCards.length; index++) await addCandidate(bodylessCards[index], 'bodyless_card', index);
const dryMessages = [];
for (let index=0; index<uniqueBodyOwners.length && index<100; index++) {
  const {owner, body} = uniqueBodyOwners[index];
  const senderNode = owner.querySelector('.gD[email], [email]');
  const senderEmail = clean(senderNode && senderNode.getAttribute('email'));
  const dateNode = owner.querySelector('.g3[title], time, [data-time], [data-timestamp]');
  const dateRaw = clean(dateNode && (dateNode.getAttribute('data-time') || dateNode.getAttribute('data-timestamp')
    || dateNode.getAttribute('title') || dateNode.getAttribute('datetime')));
  const subject = clean(document.querySelector('h2.hP, [data-thread-perm-id] h2')?.textContent);
  const bodyText = clean(body.innerText);
  const bodyHTML = body.innerHTML || '';
  const id = nativeID(owner);
  const clipping = Array.from(owner.querySelectorAll('a, [role="button"]')).some(control =>
    /message clipped|view entire message/i.test(clean([control.textContent, control.getAttribute('aria-label'),
      control.getAttribute('data-tooltip'), control.getAttribute('title')].filter(Boolean).join(' ')))
  );
  const trimmedCount = owner.querySelectorAll('.ajR, [aria-label*="trimmed content" i], [data-tooltip*="trimmed content" i]').length;
  const contentDigest = await hashText([senderEmail, dateRaw, subject, bodyText].join('\u0000'));
  dryMessages.push({item_index:index, identity_seed:id || contentDigest, content_digest:contentDigest,
    owner_seed:nativeID(owner) || `${ownerKind(owner)}|${index}`, native_id_present:!!id,
    native_id_kind:nativeKind(owner), sender_present:!!senderEmail, date_present:!!dateRaw,
    subject_present:!!subject, body_present:!!bodyText || !!bodyHTML, body_visible:visible(body),
    clipped:clipping, trimmed_count:trimmedCount, text_length:bodyText.length,
    html_length:bodyHTML.length, item_outcome:'observed'});
}
const counts = [fallbackCards.length, bodyNodes.length, uniqueBodyOwners.length, uniqueNativeIDs.length,
  rawKQ.length, qualifyingKQ.length, trimmedControls.length, bodylessCards.length,
  fallbackCards.filter(node => !visible(node)).length];
return {
  card_count:fallbackCards.length, body_count:bodyNodes.length, stack_count:rawKQ.length,
  explicit_stack_count:0, kq_stack_count:rawKQ.length,
  native_id_count:nativeNodes.length, native_ids:nativeIDs,
  zero_size_count:fallbackCards.filter(node => !visible(node)).length,
  unique_card_count:fallbackCards.length, unique_body_owner_count:uniqueBodyOwners.length,
  unique_native_id_count:uniqueNativeIDs.length, raw_kq_count:rawKQ.length,
  qualifying_kq_count:qualifyingKQ.length, adx_count:document.querySelectorAll('.adx').length,
  trimmed_control_count:trimmedControls.length, bodyless_card_count:bodylessCards.length,
  invisible_count:[...fallbackCards, ...rawKQ, ...trimmedControls].filter(node => !visible(node)).length,
  dry_message_count:dryMessages.length, duplicate_body_count:Math.max(0, bodyNodes.length-uniqueBodyOwners.length),
  mutation_count:globalThis[mutationKey].count, candidate_count:candidateRows.length,
  snapshot_seed:await hashText(counts.join('|')+'|'+uniqueNativeIDs.sort().join('|')+'|'+dryMessages.map(row=>row.content_digest).sort().join('|')),
  candidates:candidateRows, dry_messages:dryMessages
};
"""#

    // Content-free viewport inventory for the isolated scroll diagnostic.
    // Unlike production detail extraction, this reads no sender, subject, body
    // text, or HTML. Raw Gmail IDs remain in Willo and are HMAC-fingerprinted
    // before diagnostic transport.
    static let detailScrollInventoryScript = #"""
const visible = (node) => {
  const rect = node.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
};
const hashText = async (value) => {
  const bytes = new TextEncoder().encode(String(value || ''));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest)).map(value => value.toString(16).padStart(2, '0')).join('');
};
const primaryCards = Array.from(document.querySelectorAll('.adn.ads'));
const nativeNodes = Array.from(document.querySelectorAll('[data-legacy-message-id], [data-message-id]'));
const cards = primaryCards.length ? primaryCards : nativeNodes.filter(node =>
  !nativeNodes.some(other => other !== node && node.contains(other))
);
const bodies = Array.from(document.querySelectorAll('.a3s.aiL, .a3s')).filter((body, index, all) =>
  !all.some((other, otherIndex) => otherIndex !== index && other.contains(body))
);
const nativeIDs = nativeNodes.flatMap(node => [
  node.getAttribute('data-legacy-message-id'), node.getAttribute('data-message-id')
]).filter(value => typeof value === 'string' && value.length > 0).slice(0, 500);
const uniqueNativeIDs = [...new Set(nativeIDs)];
const ownerOf = (body) => body.closest('.adn.ads')
  || body.closest('[data-legacy-message-id], [data-message-id]') || body.parentElement;
const ownerCount = new Set(bodies.map(ownerOf).filter(Boolean)).size;
const mutationKey = '__arbolWilloScrollMutationStateV1';
if (!globalThis[mutationKey]) {
  const state = {count: 0};
  const observer = new MutationObserver(records => { state.count += records.length; });
  observer.observe(document.documentElement || document, {subtree:true, childList:true, attributes:true});
  state.observer = observer;
  globalThis[mutationKey] = state;
}
const seed = [cards.length, bodies.length, ownerCount,
  cards.filter(node => !visible(node)).length, ...uniqueNativeIDs.sort()].join('|');
return {
  card_count:cards.length, body_count:bodies.length, native_id_count:nativeNodes.length,
  zero_size_count:cards.filter(node => !visible(node)).length,
  unique_card_count:cards.length, unique_body_owner_count:ownerCount,
  unique_native_id_count:uniqueNativeIDs.length, invisible_count:cards.filter(node => !visible(node)).length,
  native_ids:nativeIDs, mutation_count:globalThis[mutationKey].count,
  snapshot_seed:await hashText(seed)
};
"""#

    // Finds only an element ancestor that both owns current conversation DOM
    // and has an actual vertical scroll range. It never falls back to window,
    // documentElement, or body and never clicks or dispatches a synthetic event.
    static let detailScrollActionScript = #"""
const stateKey = '__arbolWilloViewportScrollStateV1';
const classify = (node, nearest) => {
  if (!node) return 'none';
  if (node.matches('[data-thread-perm-id]')) return 'thread_owner';
  if (node.matches('[role="main"]')) return 'role_main';
  return nearest ? 'nearest_scrollable_ancestor' : 'none';
};
const anchors = Array.from(document.querySelectorAll('.adn.ads, .a3s.aiL, .a3s, [data-legacy-message-id], [data-message-id]'));
const findContainer = () => {
  const candidates = [];
  const seen = new Set();
  for (const anchor of anchors) {
    let node = anchor.parentElement;
    let depth = 0;
    while (node && node !== document.body && node !== document.documentElement && depth < 40) {
      if (!seen.has(node)) {
        seen.add(node);
        const style = getComputedStyle(node);
        const scrollable = /auto|scroll|overlay/.test(style.overflowY)
          && node.scrollHeight > node.clientHeight + 8;
        if (scrollable && anchors.every(item => node.contains(item))) {
          candidates.push({node, depth, semantic:node.matches('[data-thread-perm-id], [role="main"]')});
        }
      }
      node = node.parentElement;
      depth += 1;
    }
  }
  candidates.sort((a, b) => Number(b.semantic) - Number(a.semantic) || a.depth - b.depth
    || (a.node.scrollHeight - a.node.clientHeight) - (b.node.scrollHeight - b.node.clientHeight));
  return candidates[0] || null;
};
let state = globalThis[stateKey];
if (!state || !state.node || !state.node.isConnected || action === 'initialize') {
  const found = findContainer();
  state = found ? {node:found.node, originalTop:found.node.scrollTop,
    kind:classify(found.node, !found.semantic)} : null;
  globalThis[stateKey] = state;
}
if (!state) {
  return {scroll_container_found:false, scroll_container_kind:'none', scroll_target_percent:0,
    scroll_position_percent:0, scroll_extent_bucket:0, viewport_height_bucket:0,
    scroll_changed:false, scroll_restored:false};
}
const node = state.node;
const before = node.scrollTop;
const maxScroll = Math.max(0, node.scrollHeight - node.clientHeight);
const target = Math.max(0, Math.min(100, Number(targetPercent || 0)));
if (action === 'move') node.scrollTop = Math.round(maxScroll * target / 100);
if (action === 'restore') node.scrollTop = Math.max(0, Math.min(maxScroll, state.originalTop));
// WKWebView may indefinitely throttle animation-frame callbacks when this detail
// page is off-screen. scrollTop assignment is synchronous; Swift performs the
// bounded post-action settle before taking each inventory snapshot.
const currentMax = Math.max(0, node.scrollHeight - node.clientHeight);
const position = currentMax > 0 ? Math.round(node.scrollTop * 100 / currentMax) : 0;
return {scroll_container_found:true, scroll_container_kind:state.kind,
  scroll_target_percent:action === 'restore' ? Math.round(state.originalTop * 100 / Math.max(1, currentMax)) : target,
  scroll_position_percent:position, scroll_extent_bucket:Math.ceil(currentMax / 100),
  viewport_height_bucket:Math.ceil(node.clientHeight / 100),
  scroll_changed:Math.abs(node.scrollTop - before) > 1,
  scroll_restored:action === 'restore' && Math.abs(node.scrollTop - state.originalTop) <= 1};
"""#

    // Explicitly selected, visible-thread materialization. It clicks only
    // per-message headers owned by bodyless message candidates, never Gmail
    // history stacks, mailbox controls, links, scrolling, pagination, or reload.
    // One user action authorizes at most 50 message candidates and no retry.
    static let supervisedThreadMaterializationScript = #"""
const maximum = Math.max(1, Math.min(50, Number(maximumThreadMessages || 50)));
const expected = Math.max(1, Number(expectedThreadCount || 1));
const clean = (value) => (value || '').replace(/\s+/g, ' ').trim();
const visible = (node) => {
  if (!node) return false;
  const rect = node.getBoundingClientRect();
  const style = getComputedStyle(node);
  return rect.width > 0 && rect.height > 0 && style.display !== 'none'
    && style.visibility !== 'hidden';
};
// Gmail keeps the fully rendered `.a3s` for some collapsed messages in the
// card with CSS visibility disabled. That is still materialized content: using
// geometry as the body predicate caused Willo to click headers unnecessarily,
// collapse other cards, and then omit these readable hidden bodies.
const readableBody = (body) => !!body && (
  visible(body) || clean(body.textContent).length > 0 || clean(body.innerHTML).length > 0
);
const bodyOf = (node) => Array.from(node.querySelectorAll('.a3s.aiL, .a3s'))
  .find(readableBody) || null;
const collectCandidates = () => {
  const candidates = Array.from(document.querySelectorAll('.adn.ads')).filter(node =>
    visible(node) && !!node.querySelector('.gE.iv.gt, .gE, .gD[email], [data-legacy-message-id], [data-message-id], .a3s')
  );
  // Some Workspace layouts omit `.adn.ads`. Admit only the smallest owner that
  // contains one sender plus date/header evidence, and only when it is not already
  // inside a known card. This is the fixture-backed SESSION-036 ownership boundary.
  for (const sender of Array.from(document.querySelectorAll('.gD[email]')).filter(node =>
    visible(node) && !node.closest('.a3s') && !node.closest('tr.zA')
  )) {
    let owner = sender.parentElement;
    for (let depth = 0; owner && owner !== document.body && depth < 24; depth++, owner = owner.parentElement) {
      if (owner.querySelectorAll('.gD[email]').length === 1
          && owner.querySelector('.g3[title], time, [data-time], [data-timestamp]')
          && owner.querySelector('.gE.iv.gt, .gE')) {
        if (!candidates.some(candidate => candidate === owner || candidate.contains(owner))) candidates.push(owner);
        break;
      }
    }
  }
  return candidates.filter((candidate, index, all) => !all.some((other, otherIndex) =>
    otherIndex !== index && other.contains(candidate) && bodyOf(other) === bodyOf(candidate)
  ));
};
const counts = () => {
  const candidates = collectCandidates();
  return {candidates, bodyCount:candidates.filter(bodyOf).length,
    bodylessCount:candidates.filter(candidate => !bodyOf(candidate)).length};
};
const settle = async (maximumSamples, minimumSamples = 0) => {
  let previous = '';
  let stable = 0;
  for (let sample = 0; sample < maximumSamples; sample += 1) {
    await new Promise(resolve => setTimeout(resolve, 250));
    const value = counts();
    const fingerprint = `${value.candidates.length}|${value.bodyCount}|${value.bodylessCount}`;
    stable = fingerprint === previous ? stable + 1 : 1;
    previous = fingerprint;
    // Gmail can leave the card/body counts unchanged for several samples while
    // an expand animation is still pending. The former two-sample (500 ms)
    // boundary returned too early and consistently left the final message of
    // long threads bodyless. Require a full second plus three stable samples.
    if (sample + 1 >= minimumSamples && stable >= 3) return sample + 1;
  }
  return maximumSamples;
};
if (expected > maximum) {
  return {over_limit:true, initial_candidate_count:0, initial_body_count:0,
    initial_bodyless_count:0, candidate_count:0, clicked_count:0, body_count:0,
    bodyless_count:0, expand_all_candidate_count:0, expand_all_clicked:false,
    stabilization_samples:0};
}
const initial = counts();
if (initial.candidates.length > maximum) {
  return {over_limit:true, initial_candidate_count:initial.candidates.length,
    initial_body_count:initial.bodyCount, initial_bodyless_count:initial.bodylessCount,
    candidate_count:initial.candidates.length, clicked_count:0, body_count:initial.bodyCount,
    bodyless_count:initial.bodylessCount, expand_all_candidate_count:0,
    expand_all_clicked:false, stabilization_samples:0};
}

// Gmail has a conversation-level “Expand all” control that can materialize
// message owners which do not exist yet. Admit only one exact semantic control
// in the active conversation main region. Never infer this action from a
// private class or a numeric/history control.
const conversationRoot = document.querySelector('[data-thread-perm-id]')?.closest('[role="main"]')
  || document.querySelector('[role="main"]') || document;
const semanticLabel = (node) => clean([
  node.getAttribute('aria-label'), node.getAttribute('data-tooltip'), node.getAttribute('title')
].filter(Boolean).join(' ')).toLocaleLowerCase();
const expandAll = Array.from(conversationRoot.querySelectorAll(
  'button, [role="button"], [tabindex="0"]'
)).filter(node => visible(node) && semanticLabel(node) === 'expand all'
  && !node.closest('tr.zA, .a3s, .adn.ads'));
let expandAllClicked = false;
let stabilizationSamples = 0;
if (expandAll.length === 1) {
  expandAll[0].click();
  expandAllClicked = true;
  stabilizationSamples += await settle(16, 4);
}

let current = counts();
if (current.candidates.length > maximum) {
  return {over_limit:true, initial_candidate_count:initial.candidates.length,
    initial_body_count:initial.bodyCount, initial_bodyless_count:initial.bodylessCount,
    candidate_count:current.candidates.length, clicked_count:0,
    body_count:current.bodyCount, bodyless_count:current.bodylessCount,
    expand_all_candidate_count:expandAll.length, expand_all_clicked:expandAllClicked,
    stabilization_samples:stabilizationSamples};
}
const clickedCandidates = new Set();
let clickAttempts = 0;
const clickBodylessPass = async () => {
  const before = counts();
  for (const candidate of before.candidates) {
    if (bodyOf(candidate)) continue;
    // Prefer Gmail's complete collapsed-message header. A generic `.gE`
    // descendant can be metadata rather than the click owner in Workspace
    // layouts, so use it only as a bounded fallback inside the same card.
    const header = Array.from(candidate.querySelectorAll('.gE.iv.gt'))
      .find(node => visible(node) && !node.closest('.a3s'))
      || Array.from(candidate.querySelectorAll('.gE'))
        .find(node => visible(node) && !node.closest('.a3s'));
    if (!header) continue;
    header.click();
    clickedCandidates.add(candidate);
    clickAttempts += 1;
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  if (clickAttempts > 0) stabilizationSamples += await settle(12, 4);
};
await clickBodylessPass();
current = counts();
// A real Gmail header click can be accepted while its first synthetic click is
// swallowed by the just-finished Expand-all transition. Retry only candidates
// that are still bodyless after the bounded one-second settle, and only once.
if (current.bodylessCount > 0) {
  await clickBodylessPass();
  current = counts();
}
return {over_limit:false, initial_candidate_count:initial.candidates.length,
  initial_body_count:initial.bodyCount, initial_bodyless_count:initial.bodylessCount,
  candidate_count:current.candidates.length, clicked_count:clickedCandidates.size,
  header_click_attempt_count:clickAttempts,
  body_count:current.bodyCount, bodyless_count:current.bodylessCount,
  expand_all_candidate_count:expandAll.length, expand_all_clicked:expandAllClicked,
  stabilization_samples:stabilizationSamples};
"""#

    static let selectedConversationThreadIdentityScript = #"""
const cleanID = (value) => {
  try { value = decodeURIComponent(String(value || '')); } catch (_) {}
  return value.trim().replace(/^#/, '').replace(/^thread-[af]:/i, '');
};
return cleanID(document.querySelector('[data-thread-perm-id]')
  ?.getAttribute('data-thread-perm-id'));
"""#

    static let selectedConversationPassiveProbe = #"""
const cleanID = (value) => {
  try { value = decodeURIComponent(String(value || '')); } catch (_) {}
  return value.trim().replace(/^#/, '').replace(/^(?:msg|thread)-[af]:/i, '');
};
const expectedID = cleanID(expectedConversationID);
const previous = cleanID(typeof previousThreadID === 'undefined' ? '' : previousThreadID);
const expectedThread = cleanID(typeof expectedThreadID === 'undefined' ? '' : expectedThreadID);
const allowNewOwner = typeof allowNewThreadOwner !== 'undefined' && !!allowNewThreadOwner;
if (!expectedID || document.readyState === 'loading') return false;
const nativeIDs = Array.from(document.querySelectorAll(
  '[data-legacy-message-id], [data-message-id]'
)).flatMap(node => [cleanID(node.getAttribute('data-legacy-message-id')),
  cleanID(node.getAttribute('data-message-id'))]).filter(Boolean);
const routeHasExpectedMessage = nativeIDs.includes(expectedID);
const owner = document.querySelector('[data-thread-perm-id]');
const threadID = cleanID(owner && owner.getAttribute('data-thread-perm-id'));
if (!threadID) return false;
// Once readiness binds a provider thread, every pre/post-extraction check must
// retain that exact owner. This permits Gmail route aliases without accepting a
// different conversation after another SPA transition.
if (expectedThread) return threadID === expectedThread;
// Every later selected row must replace the preceding provider thread owner.
// Do this even if a modern Gmail attribute happens to equal the next route ID:
// that attribute was present in the stale-DOM failure seen in production.
if (previous) return threadID !== previous;
if (routeHasExpectedMessage) return true;
// Gmail list rows can use a conversation-route alias that is absent from all
// member message IDs. Such an alias is ready only after the provider thread
// owner changes from the document that was present before load(). The previous
// implementation required the alias to equal a member ID, timing these valid
// threads out; accepting any owner, conversely, captured the stale prior DOM.
return allowNewOwner;
"""#

    static let providerChallengeProbeScript = #"""
const clean = (value) => (value || '').replace(/\s+/g, ' ').trim().toLocaleLowerCase();
const markers = [
  'unusual usage', 'account temporarily locked', 'temporarily disabled your account',
  'verify it is you', 'suspicious activity', 'too many attempts'
];
const title = clean(document.title);
if (markers.some(marker => title.includes(marker))) return true;
// Never classify text rendered inside the mailbox. Message subjects and bodies
// are untrusted email content and commonly contain challenge-like wording.
const mailbox = document.querySelector(
  'tr.zA, .a3s, [data-thread-perm-id], [data-legacy-thread-id], [gh="tl"]'
);
if (mailbox) return false;
const providerSurface = document.querySelector('main, [role="main"], form') || document.body;
const providerText = clean(providerSurface &&
  (providerSurface.innerText || providerSurface.textContent));
return markers.some(marker => providerText.includes(marker));
"""#

    static let suppressWindowPrintScript = #"""
try {
  Object.defineProperty(window, 'print', {
    configurable:false, writable:false, value:() => { globalThis.__arbolPrintSuppressed = true; }
  });
} catch (_) {
  try { window.print = () => { globalThis.__arbolPrintSuppressed = true; }; } catch (_) {}
}
"""#

    // Find only one visible, exact semantic Print all action inside the active
    // conversation region. A generic Print button or More menu is deliberately
    // not admitted, and no raw label leaves WebKit.
    // Open only a unique conversation-level More menu. If the exact Print all
    // action is already visible, no menu click is needed. Raw labels remain in
    // WebKit and only bounded admission counts leave the document.
    static let printAllMenuOpenScript = #"""
const clean = (value) => (value || '').replace(/\s+/g, ' ').trim();
const visible = (node) => {
  const rect = node.getBoundingClientRect();
  const style = getComputedStyle(node);
  return rect.width > 0 && rect.height > 0 && style.display !== 'none'
    && style.visibility !== 'hidden';
};
const label = (node) => clean([node.getAttribute('aria-label'),
  node.getAttribute('data-tooltip'), node.getAttribute('title')]
  .filter(Boolean).join(' ')).toLocaleLowerCase();
const root = document.querySelector('[data-thread-perm-id]')?.closest('[role="main"]')
  || document.querySelector('[role="main"]') || document;
const controls = Array.from(root.querySelectorAll('button, [role="button"]')).filter(visible);
const exactPrint = Array.from(document.querySelectorAll('[role="menuitem"], button, a'))
  .filter(node => visible(node) && label(node) === 'print all');
const menus = controls.filter(node => {
  const value = label(node);
  if (value !== 'more') return false;
  if (node.closest('tr.zA, .a3s, .adn.ads')) return false;
  return !!node.closest('[data-thread-perm-id], [role="main"]');
});
if (exactPrint.length === 0 && menus.length === 1) menus[0].click();
return {print_menu_candidate_count:menus.length,
  print_menu_clicked_count:exactPrint.length === 0 && menus.length === 1 ? 1 : 0,
  print_menu_opened:exactPrint.length > 0 || (exactPrint.length === 0 && menus.length === 1)};
"""#

    static let printAllActionScript = #"""
const clean = (value) => (value || '').replace(/\s+/g, ' ').trim();
const visible = (node) => {
  const rect = node.getBoundingClientRect();
  const style = getComputedStyle(node);
  return rect.width > 0 && rect.height > 0 && style.display !== 'none'
    && style.visibility !== 'hidden';
};
const root = document.querySelector('[data-thread-perm-id]')?.closest('[role="main"]')
  || document.querySelector('[role="main"]') || document;
const controls = Array.from(root.querySelectorAll(
  'button, [role="button"], a, [role="menuitem"]'
)).filter(visible);
const semantic = controls.filter(node => {
  const label = clean([node.getAttribute('aria-label'), node.getAttribute('data-tooltip'),
    node.getAttribute('title')].filter(Boolean).join(' ')).toLocaleLowerCase();
  return label === 'print all';
});
if (semantic.length === 1) semantic[0].click();
return {print_action_candidate_count:semantic.length,
  print_action_clicked:semantic.length === 1};
"""#

    // Structural feasibility inventory for Gmail's printer-friendly document.
    // Raw header labels and content are inspected only in-page. The result is
    // bounded counts/booleans and never includes text, HTML, IDs, or URLs.
    static let printViewObservationScript = #"""
const clean = (value) => (value || '').replace(/\s+/g, ' ').trim();
const lower = (value) => clean(value).toLocaleLowerCase();
const all = Array.from(document.querySelectorAll('body *'));
const textOf = (node) => clean(node && (node.innerText || node.textContent));
const directLabel = (node, names) => {
  const value = lower(textOf(node));
  return names.some(name => value === name || value.startsWith(name + ':'));
};
const fromNodes = all.filter(node => directLabel(node, ['from']));
const ownsLabel = (node, names) => Array.from(node.querySelectorAll('*'))
  .some(child => directLabel(child, names));
const headerOwners = [];
for (const from of fromNodes) {
  let owner = from.parentElement;
  for (let depth = 0; owner && owner !== document.body && depth < 12;
       depth += 1, owner = owner.parentElement) {
    if (ownsLabel(owner, ['date', 'sent']) && ownsLabel(owner, ['subject'])) {
      if (!headerOwners.includes(owner)) headerOwners.push(owner);
      break;
    }
  }
}
const nativeOwners = Array.from(new Set(Array.from(document.querySelectorAll(
  '[data-message-id], [data-legacy-message-id]'
)).map(node => node.closest('article, section, table, div') || node)));
const classSections = Array.from(document.querySelectorAll(
  'article, section, table.message, div.message'
)).filter(node => ownsLabel(node, ['from']) && ownsLabel(node, ['date', 'sent']));
// Prefer one ownership model rather than unioning nested wrappers for the same
// message. Provider-native owners are strongest, explicit print sections are
// next, and repeated header groups are the structural fallback.
const sections = nativeOwners.length > 0 ? nativeOwners
  : (classSections.length > 0 ? classSections : headerOwners);
const bodyCandidates = sections.filter(section => {
  const text = textOf(section);
  return text.length > 0 && Array.from(section.querySelectorAll('td, div, pre, blockquote'))
    .some(node => textOf(node).length > 20 && !directLabel(node, ['from', 'date', 'sent', 'subject']));
});
const bodyTextLength = clean(document.body && (document.body.innerText || document.body.textContent)).length;
return {
  print_document_ready:document.readyState !== 'loading' && bodyTextLength > 0
    && sections.length > 0,
  print_invocation_suppressed:globalThis.__arbolPrintSuppressed === true,
  print_section_count:sections.length,
  print_native_owner_count:nativeOwners.length,
  print_header_group_count:headerOwners.length,
  print_body_candidate_count:bodyCandidates.length,
};
"""#

    // Read-only inventory of Gmail message-like metadata ownership. This is
    // intentionally independent of production card extraction and exports only
    // aggregate counts. No label, address, subject, body, HTML, or provider ID
    // leaves WebKit.
    static let detailMessageStructureDiagnosticScript = #"""
const visible = (node) => {
  const rect = node.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
};
const root = document.querySelector('[role="main"]')
  || document.querySelector('[data-thread-perm-id]') || document;
const senders = Array.from(root.querySelectorAll('.gD[email]'))
  .filter(node => !node.closest('.a3s') && !node.closest('tr.zA'));
const dates = Array.from(root.querySelectorAll('.g3[title], time, [data-time], [data-timestamp]'))
  .filter(node => !node.closest('.a3s') && !node.closest('tr.zA'));
const headers = Array.from(root.querySelectorAll('.gE.iv.gt, .gE'))
  .filter((node, index, all) => !node.closest('.a3s')
    && !all.some((other, otherIndex) => otherIndex !== index && other.contains(node)));
const ownerFor = (sender) => {
  let node = sender.parentElement;
  for (let depth = 0; node && node !== root && depth < 24; depth++, node = node.parentElement) {
    const senderCount = node.querySelectorAll('.gD[email]').length;
    const hasDate = !!node.querySelector('.g3[title], time, [data-time], [data-timestamp]');
    const hasHeader = !!node.querySelector('.gE.iv.gt, .gE');
    if (senderCount === 1 && hasDate && hasHeader) return node;
  }
  return null;
};
const owners = [];
for (const sender of senders) {
  const owner = ownerFor(sender);
  if (owner && !owners.includes(owner)) owners.push(owner);
}
const knownCard = (owner) => owner.matches('.adn.ads') || !!owner.closest('.adn.ads');
const nativeOwner = (owner) => owner.matches('[data-legacy-message-id], [data-message-id]')
  || !!owner.closest('[data-legacy-message-id], [data-message-id]')
  || !!owner.querySelector('[data-legacy-message-id], [data-message-id]');
const bodyOwner = (owner) => !!owner.querySelector('.a3s.aiL, .a3s');
const recognized = (owner) => knownCard(owner) || nativeOwner(owner) || bodyOwner(owner);
return {
  structure_sender_node_count:senders.length,
  structure_visible_sender_node_count:senders.filter(visible).length,
  structure_date_node_count:dates.length,
  structure_visible_date_node_count:dates.filter(visible).length,
  structure_header_node_count:headers.length,
  structure_visible_header_node_count:headers.filter(visible).length,
  structure_owner_count:owners.length,
  structure_visible_owner_count:owners.filter(visible).length,
  structure_known_card_owner_count:owners.filter(knownCard).length,
  structure_native_owner_count:owners.filter(nativeOwner).length,
  structure_body_owner_count:owners.filter(bodyOwner).length,
  structure_unrecognized_owner_count:owners.filter(owner => !recognized(owner)).length,
  structure_unowned_sender_count:senders.filter(sender => !ownerFor(sender)).length,
};
"""#

    // Diagnostic-only child-target experiment. The prior `.kQ.click()` result
    // had zero effect. Gmail may attach its handler to the numeric `.adx` child,
    // so click only that child and only when its count is consistent with the
    // exact inbox row hint. No Gmail text leaves this script.
    static let detailHistoryChildDryActionScript = #"""
const clean = (value) => (value || '').replace(/\s+/g, ' ').trim();
const visible = (node) => {
  const rect = node.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
};
const expected = Math.max(0, Number(expectedThreadCount || 0));
const observed = Array.from(document.querySelectorAll('.kQ .adx')).map(child => {
  const parent = child.closest('.kQ');
  const label = clean([child.getAttribute('aria-label'), child.getAttribute('data-tooltip'),
    child.getAttribute('title'), child.textContent].filter(Boolean).join(' '));
  const count = Number((label.match(/(?:^|\s)(\d{1,4})(?:\s|$)/) || [])[1] || 0);
  const parentLabel = clean([parent && parent.getAttribute('aria-label'),
    parent && parent.getAttribute('data-tooltip'), parent && parent.getAttribute('title'),
    parent && parent.textContent].filter(Boolean).join(' '));
  const semanticLabel = clean(label + ' ' + parentLabel);
  const outsideBody = !child.closest('.a3s');
  const outsideCard = !child.closest('.adn.ads,[data-legacy-message-id],[data-message-id]');
  const isVisible = visible(child);
  const matches = expected > 0 && (count === expected || count + 1 === expected);
  const messageSemantic = /(?:^|\s)messages?(?:\s|$)/i.test(semanticLabel);
  const historySemantic = /(?:^|\s)(?:older|collapsed|hidden|history)(?:\s|$)/i.test(semanticLabel);
  return {child, parent, count, outsideBody, outsideCard, isVisible, matches,
    messageSemantic, historySemantic};
}).filter(value => value.parent && value.outsideBody && value.outsideCard);
const visibleChildren = observed.filter(value => value.isVisible);
const numericChildren = visibleChildren.filter(value => value.count > 0);
const countMatchedChildren = numericChildren.filter(value => value.matches);
const semanticChildren = numericChildren.filter(value => value.messageSemantic && value.historySemantic);
// A Gmail history control can count only its collapsed middle messages rather
// than the inbox row's total thread count. Admit a mismatching child only when
// it is unique, conversation-owned, visible, numeric, and explicitly semantic
// as message history. No label or text leaves this diagnostic script.
const candidate = semanticChildren.length === 1 ? semanticChildren[0] :
  (countMatchedChildren.length === 1 ? countMatchedChildren[0] : null);
if (candidate) candidate.child.click();
return {
  candidate_count:countMatchedChildren.length,
  history_semantic_child_count:semanticChildren.length,
  history_message_semantic_child_count:numericChildren.filter(value => value.messageSemantic).length,
  history_history_semantic_child_count:numericChildren.filter(value => value.historySemantic).length,
  history_raw_child_count:observed.length,
  history_visible_child_count:visibleChildren.length,
  history_numeric_child_count:numericChildren.length,
  history_first_numeric_control_count:numericChildren.length ? numericChildren[0].count : 0,
  history_child_present:!!candidate,
  history_control_count:candidate ? candidate.count : 0,
  history_control_matches_hint:!!candidate && candidate.count === expected,
  history_control_plus_visible_matches_hint:!!candidate && candidate.count + 1 === expected,
  clicked_total:candidate ? 1 : 0
};
"""#

    // Diagnostic-only action used while validating Gmail's private `.kQ`
    // structure. It clicks at most one qualifying node, performs no other DOM
    // action, waits zero milliseconds, and returns no Gmail content.
    static let detailKQDryActionScript = #"""
const clean = (value) => (value || '').replace(/\s+/g, ' ').trim();
const visible = (node) => {
  const rect = node.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
};
const candidate = Array.from(document.querySelectorAll('.kQ')).find(control => {
  if (!visible(control) || control.closest('.a3s')) return false;
  const label = clean([control.getAttribute('aria-label'), control.getAttribute('data-tooltip'),
    control.getAttribute('title'), control.textContent].filter(Boolean).join(' '));
  return !!control.querySelector('.adx') || /(?:^|\s)\d+(?:\s|$)/.test(label);
});
if (candidate) candidate.click();
return {
  clicked_total: candidate ? 1 : 0,
  clicked_history_stack: candidate ? 1 : 0,
  clicked_explicit_stack: 0,
  clicked_kq_stack: candidate ? 1 : 0,
  clicked_message_header: 0,
  clicked_trimmed_content: 0
};
"""#

    static let detailPrepareScript = #"""
const delay = Math.max(0, Number(typeof delayScale === 'undefined' ? 1 : delayScale));
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms * delay));
const clean = (value) => (value || '').replace(/\s+/g, ' ').trim();
const clicks = {history_stack: 0, explicit_stack: 0, kq_stack: 0,
  message_header: 0, trimmed_content: 0};
const visible = (node) => {
  const rect = node.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
};
const bodyOf = (node) => node.querySelector(':scope > .a3s, :scope > div > .a3s, .a3s.aiL, .a3s');
const messageCards = () => {
  const primary = Array.from(document.querySelectorAll('.adn.ads')).filter(node =>
    !!bodyOf(node) || !!node.querySelector('.gE.iv.gt, .gE, .gD[email], [data-legacy-message-id], [data-message-id]')
  );
  if (primary.length) return primary;
  // Workspace variants can omit `.adn.ads`. Keep only the innermost native-ID
  // wrapper so one Gmail message cannot become several nested candidate cards.
  const native = Array.from(document.querySelectorAll('[data-legacy-message-id], [data-message-id]'));
  return native.filter(node => !native.some(other => other !== node && node.contains(other)));
};
const historyStackKind = (control) => {
  if (!visible(control) || control.closest('.a3s') || !control.matches('.kQ')) return '';
  const label = clean([control.getAttribute('aria-label'), control.getAttribute('data-tooltip'),
    control.getAttribute('title'), control.textContent].filter(Boolean).join(' '));
  return (!!control.querySelector('.adx') || /(?:^|\s)\d+(?:\s|$)/.test(label)) ? 'kq' : '';
};

// `.kQ` is a private Gmail class, not a semantic history-control contract.
// The isolated live experiment proved that clicking the selected qualifying
// node did not change any card, body, native ID, message identity, or content
// and left the same node present. Do not click `.kQ` in production preparation.
// Keep its inventory only as telemetry while other materialization mechanisms
// are investigated independently.

// `.adn.ads` is Gmail's per-message conversation card. Click its header when
// the body is absent; do not search arbitrary role=listitem descendants,
// which includes Calendar RSVP controls.
for (const card of messageCards()) {
  if (bodyOf(card)) continue;
  const header = Array.from(card.querySelectorAll('.gE.iv.gt, .gE, [role="button"], [tabindex="0"]'))
    .find(control => {
      if (!visible(control) || control.closest('.a3s')) return false;
      const label = clean([control.getAttribute('aria-label'), control.getAttribute('data-tooltip'),
        control.getAttribute('title'), control.textContent].filter(Boolean).join(' '));
      return !/reply|forward|more|star|reaction|trimmed content|yes|no|maybe/i.test(label);
    });
  if (header) {
    header.click();
    clicks.message_header += 1;
    await sleep(400);
  }
}

for (const control of Array.from(document.querySelectorAll(
  '.ajR, [aria-label*="trimmed content" i], [data-tooltip*="trimmed content" i]'
))) {
  if (visible(control)) {
    control.click();
    clicks.trimmed_content += 1;
    await sleep(100);
  }
}
await sleep(1000);
return {
  clicked_total: clicks.history_stack + clicks.message_header + clicks.trimmed_content,
  clicked_history_stack: clicks.history_stack,
  clicked_explicit_stack: clicks.explicit_stack,
  clicked_kq_stack: clicks.kq_stack,
  clicked_message_header: clicks.message_header,
  clicked_trimmed_content: clicks.trimmed_content
};
"""#

    /// Observe the page the user opens in the single visible Gmail window.
    /// Stable email-list pages are announced once per transition for passive
    /// list capture. Conversation capture still requires a real trusted row
    /// click. This agent never clicks, scrolls, navigates, reloads, reads message
    /// content, or posts raw Gmail identity.
    static let trustedInboxSelectionObserverScript = #"""
(() => {
  if (globalThis.__arbolUserMediatedPageObserverV2) return;
  globalThis.__arbolUserMediatedPageObserverV2 = true;
  const clean = (value) => (value || '').replace(/\s+/g, ' ').trim();
  const rowSelector = 'tr.zA, [role="main"] tr[data-legacy-thread-id], [role="main"] tr[data-thread-id]';
  const visible = (node) => {
    if (!(node instanceof Element)) return false;
    const rect = node.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };
  let pageRevision = 0;
  let pageKind = 'unknown';
  let selectingConversation = false;
  let evaluationScheduled = false;
  let lastListCandidate = '';
  let boundListCandidate = '';
  let stableListSamples = 0;

  const post = (payload) => {
    try { window.webkit.messageHandlers.arbolGmailUserSelection.postMessage(payload); } catch (_) {}
  };
  const evaluatePage = () => {
    evaluationScheduled = false;
    const route = location.href;
    const rows = Array.from(document.querySelectorAll(rowSelector)).filter(visible);
    const hasVisibleMessageBody = Array.from(document.querySelectorAll('.a3s.aiL, .a3s')).some(visible);
    if (!selectingConversation && rows.length > 0 && !hasVisibleMessageBody) {
      // Provider IDs are used only inside this page to distinguish a genuinely
      // different visible list. They are never posted to native or logs.
      const rowIdentity = (row) => clean(
        row.getAttribute('data-legacy-thread-id') || row.getAttribute('data-thread-id')
        || row.querySelector('[data-legacy-thread-id], [data-thread-id]')?.getAttribute('data-legacy-thread-id')
        || row.querySelector('[data-thread-id]')?.getAttribute('data-thread-id') || ''
      );
      const candidate = route + '|' + rows.length + '|' + rows.map(rowIdentity).join('|');
      stableListSamples = candidate === lastListCandidate ? stableListSamples + 1 : 1;
      lastListCandidate = candidate;
      if (stableListSamples >= 2 && candidate !== boundListCandidate) {
        boundListCandidate = candidate;
        pageKind = 'list';
        pageRevision += 1;
        post({stage: 'list_bound', route, page_revision: pageRevision});
      } else if (stableListSamples < 2) {
        scheduleEvaluation(300);
      }
      return;
    }
    stableListSamples = 0;
    lastListCandidate = '';
    if (hasVisibleMessageBody && pageKind !== 'conversation') pageKind = 'conversation';
  };
  const scheduleEvaluation = (delay = 250) => {
    if (evaluationScheduled) return;
    evaluationScheduled = true;
    setTimeout(evaluatePage, delay);
  };

  document.addEventListener('click', (event) => {
    if (!event.isTrusted) return;
    const target = event.target instanceof Element ? event.target : null;
    const row = target && target.closest(rowSelector);
    if (!row) return;
    const idNode = row.matches('[data-legacy-thread-id], [data-thread-id]')
      ? row : row.querySelector('[data-legacy-thread-id], [data-thread-id]');
    const link = row.querySelector('a[href*="#inbox/"], a[href*="#all/"], a[href*="#search/"]');
    const href = clean(link && link.getAttribute('href'));
    let hrefID = '';
    try {
      const absolute = new URL(href || '', location.href);
      const parts = absolute.hash.split('?')[0].split('/').filter(Boolean);
      hrefID = decodeURIComponent(parts[parts.length - 1] || '');
    } catch (_) {}
    const providerID = clean(row.getAttribute('data-legacy-thread-id') || row.getAttribute('data-thread-id')
      || (idNode && (idNode.getAttribute('data-legacy-thread-id') || idNode.getAttribute('data-thread-id'))) || hrefID)
      .replace(/^#/, '').replace(/^(thread|msg)-[af]:/i, '');
    if (!providerID) return;
    const safe = providerID.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 220);
    if (!safe) return;
    const surfaceID = 'gmail-' + safe;
    const initialRoute = location.href;
    selectingConversation = true;
    pageKind = 'opening';
    post({trusted: true, stage: 'candidate', surface_id: surfaceID});
    // Observe only a real, stable route transition following this trusted click.
    // Bounded local timers make no network request and perform no Gmail action.
    let observedRoute = '';
    let stableSamples = 0;
    let routeBoundPosted = false;
    [300, 750, 1500, 2500, 4000].forEach(delay => setTimeout(() => {
      if (routeBoundPosted || location.href === initialRoute) return;
      if (location.href === observedRoute) stableSamples += 1;
      else { observedRoute = location.href; stableSamples = 1; }
      const hasVisibleMessageBody = Array.from(document.querySelectorAll('.a3s.aiL, .a3s')).some(visible);
      if (stableSamples >= 2 && hasVisibleMessageBody) {
        routeBoundPosted = true;
        selectingConversation = false;
        pageKind = 'conversation';
        post({trusted: true, stage: 'route_bound', surface_id: surfaceID, route: location.href});
      }
    }, delay));
    setTimeout(() => {
      if (routeBoundPosted) return;
      selectingConversation = false;
      pageKind = 'unknown';
      scheduleEvaluation();
    }, 4500);
  }, true);

  // Observe only structural/route transitions in this already-visible document.
  // Once a list is bound, same-route Gmail mutations do not schedule recapture.
  new MutationObserver(() => {
    if (!selectingConversation) scheduleEvaluation();
  }).observe(document.documentElement, {subtree: true, childList: true});
  window.addEventListener('hashchange', () => {
    if (!selectingConversation) pageKind = 'unknown';
    scheduleEvaluation();
  });
  window.addEventListener('popstate', () => {
    if (!selectingConversation) pageKind = 'unknown';
    scheduleEvaluation();
  });
  scheduleEvaluation(300);
})();
"""#

    static let detailScript = #"""
const clean = (value) => (value || '').replace(/\s+/g, ' ').trim();
const visible = (node) => {
  const rect = node.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
};
const ownerOf = (body) => body.closest('.adn.ads')
  || body.closest('[data-legacy-message-id], [data-message-id]') || body.parentElement;
const bodyContent = (body) => clean(body && (body.innerText || body.textContent))
  || clean(body && body.innerHTML);
const bodyNodes = Array.from(document.querySelectorAll('.a3s.aiL, .a3s'))
  .filter((body, index, all) => bodyContent(body) && !all.some((other, otherIndex) =>
    otherIndex !== index && other.contains(body)
  ));
const nodes = [];
const seenOwners = new Set();
for (const body of bodyNodes) {
  const owner = ownerOf(body);
  // A collapsed Gmail card can retain complete body markup under display:none.
  // The card—not body geometry—is the ownership boundary. Reading that existing
  // DOM is passive and avoids toggling another message closed while opening it.
  if (!owner || !visible(owner) || seenOwners.has(owner)) continue;
  seenOwners.add(owner);
  nodes.push({node: owner, body});
}
const threadID = clean(document.querySelector('[data-thread-perm-id]')?.getAttribute('data-thread-perm-id'))
  || (location.hash.match(/#(?:inbox|all|search\/[^/]+)\/([^?]+)/) || [])[1] || '';
const messages = nodes.map(({node, body}, index) => {
  const senderNode = node.querySelector('.gD[email], [email]');
  const senderContext = clean(node.getAttribute('aria-label') || node.textContent);
  const senderEmail = clean(senderNode && senderNode.getAttribute('email'))
    || ((senderContext.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i) || [])[0] || '');
  const senderName = clean(senderNode && (senderNode.getAttribute('name') || senderNode.textContent));
  const sender = senderEmail && senderName && senderName.toLowerCase() !== senderEmail.toLowerCase()
    ? `${senderName} <${senderEmail}>` : (senderEmail || senderName);
  const idNode = node.matches('[data-legacy-message-id], [data-message-id]')
    ? node : node.querySelector('[data-legacy-message-id], [data-message-id]');
  const legacyID = clean(node.getAttribute('data-legacy-message-id'))
    || clean(idNode && idNode.getAttribute('data-legacy-message-id'));
  const modernID = clean(node.getAttribute('data-message-id'))
    || clean(idNode && idNode.getAttribute('data-message-id'));
  const nativeMessageID = (legacyID || modernID).replace(/^#/, '').replace(/^msg-[af]:/i, '');
  const clippingControl = Array.from(node.querySelectorAll('a, [role="button"]')).find(control => {
    const label = clean([control.textContent, control.getAttribute('aria-label'),
      control.getAttribute('data-tooltip'), control.getAttribute('title')].filter(Boolean).join(' '));
    return /message clipped|view entire message/i.test(label);
  });
  const clipped = !!clippingControl;
  const clippingLink = clippingControl && (clippingControl.matches('a[href]')
    ? clippingControl : clippingControl.closest('a[href]') || clippingControl.querySelector('a[href]'));
  const fullMessageURL = clippingLink ? new URL(clippingLink.getAttribute('href'), location.href).href : '';
  const dateNode = node.querySelector('.g3[title], time, [data-time], [data-timestamp]');
  const dateRaw = clean(dateNode && (dateNode.getAttribute('data-time') || dateNode.getAttribute('data-timestamp')
    || dateNode.getAttribute('title') || dateNode.getAttribute('datetime')));
  let occurred = /^\d{10,13}$/.test(dateRaw) ? Number(dateRaw) : Date.parse(dateRaw);
  if (occurred > 0 && occurred < 100000000000) occurred *= 1000;
  if (!Number.isFinite(occurred)) occurred = Date.now() + index;
  const renderedBodyText = clean(body.innerText || body.textContent);
  const fingerprint = [senderEmail, occurred, renderedBodyText.slice(0, 400)].join('|');
  let hash = 2166136261;
  for (let i = 0; i < fingerprint.length; i++) {
    hash ^= fingerprint.charCodeAt(i); hash = Math.imul(hash, 16777619);
  }
  const providerMessageID = nativeMessageID || `rendered-${(hash >>> 0).toString(16)}`;
  const recipients = Array.from(node.querySelectorAll('.g2[email], [data-hovercard-id*="@"]'))
    .map(n => clean(n.getAttribute('email') || n.getAttribute('data-hovercard-id'))).filter(Boolean);
  const links = Array.from(body.querySelectorAll('a[href]')).slice(0, 200)
    .map(a => ({text:clean(a.textContent),url:a.href}));
  const attachments = Array.from(node.querySelectorAll('[download], [aria-label*="attachment" i]')).slice(0, 100)
    .map(a => ({name:clean(a.getAttribute('download') || a.getAttribute('aria-label') || a.textContent)}));
  return { provider_thread_id: threadID, provider_message_id: providerMessageID,
    sender, subject: clean(document.querySelector('h2.hP, [data-thread-perm-id] h2')?.textContent),
    occurred_at: occurred, body_text: renderedBodyText, body_html: body.innerHTML,
    to: recipients, cc: [], bcc: [], reply_to: '', links, attachments, sections: [],
    content_state: providerMessageID && !clipped ? 'rendered_complete' : 'partial',
    remote_url: location.href, full_message_url: fullMessageURL,
    capture_evidence: {legacy_message_id:!!legacyID, modern_message_id:!!modernID,
      body:true, clipped, full_message_link:!!fullMessageURL}
  };
}).filter(message => message.provider_message_id && (message.sender || message.body_text));
const cards = Array.from(document.querySelectorAll('.adn.ads')).filter(card =>
  visible(card) && (!!card.querySelector('.gE.iv.gt, .gE, .gD[email], [data-legacy-message-id], [data-message-id], .a3s'))
);
const collapsedCards = cards.filter(card => !Array.from(
  card.querySelectorAll('.a3s.aiL, .a3s')
).some(body => bodyContent(body))).length;
// `.kQ` remains observable in diagnostic inventory, but the isolated live
// click produced no message/content delta. It is therefore neither a proven
// hidden-message count nor a completeness blocker.
const unresolvedExplicitStacks = 0;
const unresolvedKqStacks = 0;
const unresolvedStacks = 0;
const providerHint = Math.max(0, Number(expectedThreadCount || 0));
return {messages, message_count: messages.length,
  expected_message_count: Math.max(providerHint, cards.length, messages.length),
  collapsed_message_count: collapsedCards + unresolvedStacks,
  collapsed_card_count: collapsedCards,
  unresolved_explicit_stack_count: unresolvedExplicitStacks,
  unresolved_kq_stack_count: unresolvedKqStacks};
"""#

    private static let fullMessageProbe = #"""
return document.readyState === 'complete' && !!document.body
  && (document.body.innerText || '').trim().length >= 40;
"""#

    private static let fullMessageScript = #"""
const clean = (value) => (value || '').replace(/\s+/g, ' ').trim();
// Gmail's view=lg document is the explicit, unclipped rendering of one
// message. Prefer a message body when Gmail exposes one, otherwise preserve
// the complete dedicated document rather than the clipped conversation node.
const body = document.querySelector('.a3s.aiL, .a3s, [data-message-id] [dir="ltr"]') || document.body;
const links = Array.from(body.querySelectorAll('a[href]')).slice(0, 500)
  .map(a => ({text:clean(a.textContent), url:a.href}));
const attachments = Array.from(body.querySelectorAll('[download], [aria-label*="attachment" i]')).slice(0, 100)
  .map(a => ({name:clean(a.getAttribute('download') || a.getAttribute('aria-label') || a.textContent)}));
return {body_text: clean(body.innerText), body_html: body.innerHTML, links, attachments};
"""#

    private static let expectedSurfaceProbe = #"""
const expected = new URL(expectedURL);
const decode = (value) => {
  try { return decodeURIComponent(value || ''); } catch (_) { return value || ''; }
};
// Compare the decoded SPA route, not only the host. Gmail may normalize spaces
// and percent escapes, while a previous Gmail document remains visible during
// navigation. A route mismatch must never count as readiness.
const normalizeRoute = (value) => decode(value).replace(/\+/g, ' ').replace(/\s+/g, ' ').trim();
const sameAccountPath = location.pathname.replace(/\/$/, '') === expected.pathname.replace(/\/$/, '');
// Gmail canonicalizes spaces in hash-search queries as `+` even when WebKit was
// loaded with `%20`. Comparing the raw decoded hashes made the first legacy-row
// recovery wait the full timeout and then skip a valid result page.
const currentRoute = normalizeRoute(location.hash).toLocaleLowerCase();
const expectedRoute = normalizeRoute(expected.hash).toLocaleLowerCase();
const expectedMailbox = (expectedRoute.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/) || [])[0] || '';
const expectedDates = expectedRoute.match(/(?:after|before):\d{4}\/\d{2}\/\d{2}/g) || [];
const meaningful = expectedRoute.replace(/^#?search\//, '').replace(/(?:from|after|before|subject):/g, ' ')
  .replace(/[^\p{L}\p{N}]+/gu, ' ').split(' ').filter(token => token.length >= 4);
const overlap = meaningful.filter(token => currentRoute.includes(token)).length / Math.max(1, meaningful.length);
const sameSearch = currentRoute.startsWith('#search/') && expectedRoute.startsWith('#search/')
  && (!expectedMailbox || currentRoute.includes(expectedMailbox))
  && expectedDates.every(term => currentRoute.includes(term)) && overlap >= 0.6;
const sameRoute = currentRoute === expectedRoute || sameSearch;
const rows = document.querySelector('tr.zA, [role="main"] tr[data-legacy-thread-id], [role="main"] tr[data-thread-id]');
const surface = document.querySelector('[role="main"], div[gh="tl"]');
return sameAccountPath && sameRoute && (!!rows || !!surface);
"""#

    private static let contentProbe = #"""
const gmailRow = document.querySelector('tr.zA, [role="main"] tr[data-legacy-thread-id], [role="main"] [data-thread-id]');
const inboxSurface = document.querySelector('[role="main"], div[gh="tl"]');
const inboxLink = document.querySelector('a[href*="#inbox"], [aria-label^="Inbox" i], [title^="Inbox" i]');
return !!gmailRow || (!!inboxSurface && !!inboxLink);
"""#

    // Read only provider thread ownership. Raw Gmail identities are returned to
    // Swift only, HMAC-fingerprinted there, and never cross the Core RPC boundary.
    static let inboxThreadIdentityDiagnosticScript = #"""
const clean = (value) => (value || '').replace(/\s+/g, ' ').trim();
const normalizeID = (value) => {
  try { value = decodeURIComponent(value || ''); } catch (_) {}
  return clean(value).replace(/^#/, '').replace(/^thread-[af]:/i, '');
};
const expected = new URL(expectedURL);
const expectedParts = expected.hash.split('?')[0].split('/').filter(Boolean);
const expectedID = normalizeID(expectedParts[expectedParts.length - 1] || '');
const rows = Array.from(document.querySelectorAll(
  'tr.zA, [role="main"] tr[data-legacy-thread-id], [role="main"] tr[data-thread-id]'
));
const rowIdentity = (row) => {
  const idNode = row.matches('[data-legacy-thread-id], [data-thread-id]')
    ? row : row.querySelector('[data-legacy-thread-id], [data-thread-id]');
  const attributeID = normalizeID(row.getAttribute('data-legacy-thread-id') || row.getAttribute('data-thread-id')
    || (idNode && (idNode.getAttribute('data-legacy-thread-id') || idNode.getAttribute('data-thread-id'))) || '');
  const link = row.querySelector('a[href*="#inbox/"], a[href*="#all/"], a[href*="#search/"]');
  let hrefID = '';
  try {
    const absolute = new URL(link && link.getAttribute('href') || '', location.href);
    const parts = absolute.hash.split('?')[0].split('/').filter(Boolean);
    hrefID = normalizeID(parts[parts.length - 1] || '');
  } catch (_) {}
  return {row, attributeID, hrefID};
};
const matches = rows.map(rowIdentity).filter(value =>
  !!expectedID && (value.attributeID === expectedID || value.hrefID === expectedID)
);
const match = matches[0] || null;
if (!match) return {
  inbox_candidate_row_count:rows.length, inbox_matching_row_count:matches.length,
  inbox_target_found:false, inbox_thread_attribute_present:false,
  inbox_thread_href_present:false, inbox_thread_ids:[]
};
return {
  inbox_candidate_row_count:rows.length, inbox_matching_row_count:matches.length,
  inbox_target_found:true, inbox_thread_attribute_present:!!match.attributeID,
  inbox_thread_href_present:!!match.hrefID,
  inbox_thread_ids:Array.from(new Set([match.attributeID, match.hrefID].filter(Boolean)))
};
"""#

    // Navigate only by clicking the exact inbox row whose provider thread
    // attribute/href equals the stored target. No sender, subject, body, or row
    // text leaves JavaScript; the result reports only whether one click occurred.
    static let inboxThreadNavigationDiagnosticScript = #"""
const clean = (value) => (value || '').replace(/\s+/g, ' ').trim();
const normalizeID = (value) => {
  try { value = decodeURIComponent(value || ''); } catch (_) {}
  return clean(value).replace(/^#/, '').replace(/^thread-[af]:/i, '');
};
const expected = new URL(expectedURL);
const expectedParts = expected.hash.split('?')[0].split('/').filter(Boolean);
const expectedID = normalizeID(expectedParts[expectedParts.length - 1] || '');
const rows = Array.from(document.querySelectorAll(
  'tr.zA, [role="main"] tr[data-legacy-thread-id], [role="main"] tr[data-thread-id]'
));
const rowIdentity = (row) => {
  const idNode = row.matches('[data-legacy-thread-id], [data-thread-id]')
    ? row : row.querySelector('[data-legacy-thread-id], [data-thread-id]');
  const attributeID = normalizeID(row.getAttribute('data-legacy-thread-id') || row.getAttribute('data-thread-id')
    || (idNode && (idNode.getAttribute('data-legacy-thread-id') || idNode.getAttribute('data-thread-id'))) || '');
  const link = row.querySelector('a[href*="#inbox/"], a[href*="#all/"], a[href*="#search/"]');
  let hrefID = '';
  try {
    const absolute = new URL(link && link.getAttribute('href') || '', location.href);
    const parts = absolute.hash.split('?')[0].split('/').filter(Boolean);
    hrefID = normalizeID(parts[parts.length - 1] || '');
  } catch (_) {}
  return {row, link, attributeID, hrefID};
};
const match = rows.map(rowIdentity).find(value =>
  !!expectedID && (value.attributeID === expectedID || value.hrefID === expectedID)
) || null;
if (!match) return {inbox_target_found:false, clicked:false};
const target = match.link || match.row;
target.click();
return {inbox_target_found:true, clicked:true};
"""#

    static let detailThreadIdentityDiagnosticScript = #"""
const clean = (value) => (value || '').replace(/\s+/g, ' ').trim();
const normalizeID = (value) => {
  try { value = decodeURIComponent(value || ''); } catch (_) {}
  return clean(value).replace(/^#/, '').replace(/^thread-[af]:/i, '');
};
const expected = new URL(expectedURL);
const owners = Array.from(document.querySelectorAll('[data-thread-perm-id]'));
const ownerIDs = Array.from(new Set(owners.map(node =>
  normalizeID(node.getAttribute('data-thread-perm-id'))
).filter(Boolean)));
const routeParts = location.hash.split('?')[0].split('/').filter(Boolean);
const routeID = normalizeID(routeParts[routeParts.length - 1] || '');
return {
  detail_thread_owner_count:owners.length,
  detail_thread_ids:ownerIDs,
  detail_route_thread_id:routeID,
  account_path_matches:location.pathname.replace(/\/$/, '') === expected.pathname.replace(/\/$/, ''),
  card_count:document.querySelectorAll('.adn.ads').length,
  body_count:document.querySelectorAll('.a3s.aiL, .a3s').length,
  native_id_count:document.querySelectorAll('[data-legacy-message-id], [data-message-id]').length
};
"""#

    // Read-only count provenance for one exact inbox row. Raw row text, labels,
    // addresses, subjects, and Gmail IDs remain inside Willo; only booleans and
    // bounded parsed counts cross the diagnostic privacy boundary.
    static let inboxCountDiagnosticScript = #"""
const clean = (value) => (value || '').replace(/\s+/g, ' ').trim();
const text = (node) => clean(node && (node.innerText || node.textContent));
const normalizeID = (value) => {
  try { value = decodeURIComponent(value || ''); } catch (_) {}
  return clean(value).replace(/^#/, '').replace(/^(thread|msg)-[af]:/i, '');
};
const expected = new URL(expectedURL);
const expectedParts = expected.hash.split('?')[0].split('/').filter(Boolean);
const expectedID = normalizeID(expectedParts[expectedParts.length - 1] || '');
const rows = Array.from(document.querySelectorAll(
  'tr.zA, [role="main"] tr[data-legacy-thread-id], [role="main"] tr[data-thread-id]'
));
const rowIdentity = (row) => {
  const idNode = row.matches('[data-legacy-thread-id], [data-thread-id]')
    ? row : row.querySelector('[data-legacy-thread-id], [data-thread-id]');
  const attributeID = normalizeID(row.getAttribute('data-legacy-thread-id') || row.getAttribute('data-thread-id')
    || (idNode && (idNode.getAttribute('data-legacy-thread-id') || idNode.getAttribute('data-thread-id'))) || '');
  const link = row.querySelector('a[href*="#inbox/"], a[href*="#all/"], a[href*="#search/"]');
  let hrefID = '';
  try {
    const absolute = new URL(link && link.getAttribute('href') || '', location.href);
    const parts = absolute.hash.split('?')[0].split('/').filter(Boolean);
    hrefID = normalizeID(parts[parts.length - 1] || '');
  } catch (_) {}
  return {attributeID, hrefID};
};
const matches = rows.map(row => ({row, ...rowIdentity(row)})).filter(value =>
  !!expectedID && (value.attributeID === expectedID || value.hrefID === expectedID)
);
const match = matches[0] || null;
if (!match) return {
  inbox_candidate_row_count:rows.length, inbox_matching_row_count:matches.length,
  inbox_target_found:false, inbox_thread_attribute_match:false, inbox_href_match:false,
  inbox_primary_count:0, inbox_dedicated_count:0, inbox_sender_suffix_count:0,
  inbox_aria_count:0, inbox_selected_count:0, inbox_primary_is_dedicated:false,
  inbox_primary_is_semantic:false, inbox_dedicated_present:false,
  inbox_sender_suffix_present:false, inbox_aria_present:false,
  inbox_count_sources_agree:false
};
const row = match.row;
const parseTrailing = (value) => Number((clean(value).match(/(?:^|\()\s*(\d{1,4})\s*\)?$/) || [])[1] || 0);
const parseSenderSuffix = (value) => Number((clean(value).match(/(?:,|\s)\s*\(?(\d{1,4})\)?\s*$/) || [])[1] || 0);
const parseAria = (value) => Number((clean(value).match(
  /(?:conversation|thread)[^0-9]{0,20}(\d{1,4})\s*(?:messages?|emails?)/i
) || [])[1] || 0);
const dedicatedNode = row.querySelector('.bqe, .yW .bqe');
const semanticNode = row.querySelector('[aria-label*="messages" i], [aria-label*="emails" i]');
const primaryNode = row.querySelector('.bqe, .yW .bqe, [aria-label*="messages" i], [aria-label*="emails" i]');
const senderCell = row.querySelector('.yW, [role="gridcell"] .yW');
const dedicatedCount = parseTrailing(text(dedicatedNode));
const primaryCount = parseTrailing(text(primaryNode));
const senderCount = parseSenderSuffix(text(senderCell));
const ariaCount = parseAria(row.getAttribute('aria-label')) || parseAria(semanticNode && semanticNode.getAttribute('aria-label'));
const selectedCount = Math.max(1, primaryCount || senderCount || ariaCount || 1);
const positive = [primaryCount, dedicatedCount, senderCount, ariaCount].filter(value => value > 0);
return {
  inbox_candidate_row_count:rows.length, inbox_matching_row_count:matches.length,
  inbox_target_found:true, inbox_thread_attribute_match:match.attributeID === expectedID,
  inbox_href_match:match.hrefID === expectedID, inbox_primary_count:primaryCount,
  inbox_dedicated_count:dedicatedCount, inbox_sender_suffix_count:senderCount,
  inbox_aria_count:ariaCount, inbox_selected_count:selectedCount,
  inbox_primary_is_dedicated:!!primaryNode && (primaryNode === dedicatedNode || primaryNode.matches('.bqe')),
  inbox_primary_is_semantic:!!primaryNode && primaryNode === semanticNode,
  inbox_dedicated_present:!!dedicatedNode, inbox_sender_suffix_present:!!senderCell,
  inbox_aria_present:!!ariaCount,
  inbox_count_sources_agree:positive.length > 0 && positive.every(value => value === positive[0])
};
"""#

    /// Gmail keeps stable legacy row attributes and accessibility labels even as
    /// generated CSS names change. Parse both, then walk Gmail's Older pagination
    /// control so one sync captures up to 2,000 inbox conversations rather than
    /// only the first page. Only normalized text/metadata leaves this WebView.
    private static let extractScript = #"""
const clean = (value) => (value || '').replace(/\s+/g, ' ').trim();
const text = (node) => clean(node && (node.innerText || node.textContent));
const rows = [];
const seen = new Set();
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const hashOf = (basis) => {
  let hash = 2166136261;
  for (let i = 0; i < basis.length; i++) { hash ^= basis.charCodeAt(i); hash = Math.imul(hash, 16777619); }
  return (hash >>> 0).toString(16);
};
const accountIndex = (location.pathname.match(/\/mail\/u\/(\d+)/) || [])[1] || '0';

const candidateRows = () => Array.from(document.querySelectorAll(
  'tr.zA, [role="main"] tr[data-legacy-thread-id], [role="main"] tr[data-thread-id]'
)).filter((node) => {
  const rect = node.getBoundingClientRect();
  return rect.width > 200 && rect.height > 20;
});

const collect = () => {
  for (const node of candidateRows()) {
    if (rows.length >= 2000) break;
    const aria = clean(node.getAttribute('aria-label'));
    const senderNode = node.querySelector('.yW span[email], .zF[email], .yP[email], [data-hovercard-id*="@"], [email]');
    const subjectNode = node.querySelector('.bog, [data-thread-id] .bog, [data-thread-id]');
    const previewNode = node.querySelector('.y2, [data-snippet]');
    const senderEmail = clean(senderNode && (senderNode.getAttribute('email') || senderNode.getAttribute('data-hovercard-id')))
      || ((aria + ' ' + text(senderNode)).match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i) || [])[0] || '';
    const senderLabel = clean(senderNode && (senderNode.getAttribute('name') || senderNode.getAttribute('title'))) || text(senderNode)
      || clean(aria.split(',')[0]);
    const sender = senderEmail && senderLabel && senderLabel.toLowerCase() !== senderEmail.toLowerCase()
      ? `${senderLabel} <${senderEmail}>` : (senderEmail || senderLabel);
    const subject = text(subjectNode) || clean(subjectNode && subjectNode.getAttribute('title')) || '(no subject)';
    let preview = text(previewNode) || clean(node.getAttribute('data-snippet'));
    preview = preview.replace(/^\s*[-–—]\s*/, '').slice(0, 600);
    if (!sender && !subject && !preview) continue;

    // Depending on Gmail density/layout, stable IDs live on the row, a
    // descendant, or only in the SPA conversation link. Looking only at the
    // <tr> made every row fall back to a synthetic hash, leaving remote_url
    // empty and making detail acquisition silently skip the whole inbox.
    const idNode = node.matches('[data-legacy-thread-id], [data-thread-id], [data-legacy-message-id]')
      ? node : node.querySelector('[data-legacy-thread-id], [data-thread-id], [data-legacy-message-id]');
    const linkNode = node.querySelector('a[href*="#inbox/"], a[href*="#all/"], a[href*="#search/"]');
    const href = clean(linkNode && linkNode.getAttribute('href'));
    const hrefID = (() => {
      if (!href) return '';
      const withoutQuery = href.split('?')[0];
      const parts = withoutQuery.split('/').filter(Boolean);
      return parts.length ? decodeURIComponent(parts[parts.length - 1]) : '';
    })();
    // A message ID is not a conversation route. Leave rows that expose only
    // data-legacy-message-id unresolved so resolveMissingConversationURLs clicks
    // them while the inbox DOM is still present and records Gmail's real route.
    const legacyID = node.getAttribute('data-legacy-thread-id') || node.getAttribute('data-thread-id')
      || (idNode && (idNode.getAttribute('data-legacy-thread-id') || idNode.getAttribute('data-thread-id')))
      || hrefID || '';
    const normalizedID = legacyID.replace(/^#/, '').replace(/^(thread|msg)-[af]:/i, '');
    const rowText = text(node);
    const basis = normalizedID || [sender, subject, preview, rowText.slice(-80)].join('|');
    const id = 'gmail-' + (normalizedID ? normalizedID.replace(/[^a-zA-Z0-9_-]/g, '-') : hashOf(basis));
    if (seen.has(id)) continue;
    seen.add(id);

    const dateNode = node.querySelector('td.xW span[title], .xW span[title], time, [data-time], [data-timestamp]');
    const dateLabel = clean(dateNode && (dateNode.getAttribute('datetime') || dateNode.getAttribute('title')
      || dateNode.getAttribute('data-time') || dateNode.getAttribute('data-timestamp'))) || text(dateNode);
    let date = /^\d{10,13}$/.test(dateLabel) ? Number(dateLabel) : Date.parse(dateLabel);
    if (date > 0 && date < 100000000000) date *= 1000;
    if (!Number.isFinite(date)) date = Date.now() - rows.length;

    const label = (aria + ' ' + rowText).toLowerCase();
    const unread = node.classList.contains('zE') || !!node.querySelector('.zF') || /\bunread\b/.test(aria.toLowerCase());
    const starred = !!node.querySelector('.T-KT-Jp, [aria-label^="Starred" i], [title^="Starred" i]')
      || /\bstarred\b/.test(aria.toLowerCase()) && !/not starred/.test(aria.toLowerCase());
    const hasAttachments = !!node.querySelector('[aria-label*="attachment" i], [title*="attachment" i], .brc')
      || /\battachments?\b/.test(label);
    // Gmail renders a conversation count in the sender cell (for example
    // “Alice, Bob 4”). This survives while older detail cards are collapsed and
    // is therefore essential completeness evidence.
    const countText = text(node.querySelector('.bqe, .yW .bqe, [aria-label*="messages" i], [aria-label*="emails" i]'));
    const senderCellText = text(node.querySelector('.yW, [role="gridcell"] .yW'));
    const countMatch = countText.match(/(?:^|\()\s*(\d{1,4})\s*\)?$/)
      || senderCellText.match(/(?:,|\s)\s*\(?(\d{1,4})\)?\s*$/)
      || aria.match(/(?:conversation|thread)[^0-9]{0,20}(\d{1,4})\s*(?:messages?|emails?)/i);
    const threadMessageCountHint = Math.max(1, Number(countMatch && countMatch[1]) || 1);
    const remoteURL = href
      ? new URL(href, location.href).href
      : (normalizedID ? `https://mail.google.com/mail/u/${accountIndex}/#inbox/${encodeURIComponent(normalizedID)}` : '');

    rows.push({
      row_index: candidateRows().indexOf(node),
      id, message_id: normalizedID || id, conversation_id: normalizedID || '', mailbox: 'Inbox',
      sender, subject, preview, body: preview, body_truncated: true,
      date_received: date, date_sent: date, is_read: !unread, is_flagged: starred,
      has_attachments: hasAttachments, message_size: 0, reply_to: '', to: [], cc: [], bcc: [],
      attachments: [], remote_url: remoteURL, thread_message_count_hint: threadMessageCountHint
    });
  }
};

const fingerprint = () => candidateRows().slice(0, 3).map(node =>
  node.getAttribute('data-legacy-thread-id') || node.getAttribute('data-thread-id') || text(node).slice(0, 80)
).join('|');
const olderButton = () => document.querySelector(
  '[gh="mtb"] [aria-label="Older" i], [gh="mtb"] [data-tooltip="Older" i], [aria-label="Older" i], [data-tooltip="Older" i]'
);
const disabled = (node) => !node || node.getAttribute('aria-disabled') === 'true'
  || node.hasAttribute('disabled') || node.classList.contains('T-I-JO');

// Read the currently synchronized inbox page. Clicking Gmail's SPA “Older”
// control from inside one callAsyncJavaScript invocation destroys that
// invocation's JS world on some Gmail builds, making the whole Sync fail with
// “completion handler is no longer reachable”. New mail is on this first page;
// older retained rows remain durable and do not need rediscovery every Sync.
collect();

const accountNode = document.querySelector(
  'a[aria-label*="Google Account" i], [aria-label*="Google Account" i], [aria-label*="@"] [data-email]'
);
const accountText = clean(accountNode && (accountNode.getAttribute('aria-label') || accountNode.getAttribute('title') || text(accountNode)));
const email = (accountText.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i) || [])[0] || '';
const named = accountText.match(/Google Account\s*:?\s*(.*?)\s*\([^)]*@[^)]*\)/i);
const name = clean(named && named[1]) || email || 'Gmail';
const parserReady = !!document.querySelector('[role="main"], div[gh="tl"]');
return {
  parser_ready: parserReady,
  account: { id: 'gmail-web', provider: 'gmail-web', name, email },
  messages: rows
};
"""#
}
