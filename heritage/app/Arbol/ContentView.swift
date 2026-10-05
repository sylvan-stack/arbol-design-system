import SwiftUI
import WebKit
import CryptoKit
import AppKit
import Carbon

/// Main Arbol web view behavior for macOS focus ergonomics.
///
/// Arbol UIs are separate macOS apps. We intentionally do *not* activate or
/// foreground windows merely because the pointer hovers over them. The only
/// focus aid kept here is first-click passthrough, so an inactive Arbol window
/// can still receive the user's actual click instead of macOS swallowing it
/// solely as an activation click.
final class ArbolWebView: WKWebView {
    /// WKWebView/AppKit may consume Command shortcuts as menu key equivalents
    /// before JavaScript receives `keydown`. Elma installs native fallbacks
    /// so navigation, archive, and stop do not depend on DOM event delivery.
    var commandNumberHandler: ((String) -> Void)?
    var commandBackspaceHandler: (() -> Void)?
    var commandEscapeHandler: (() -> Void)?
    private var commandNumberMonitor: Any?

    deinit {
        if let commandNumberMonitor { NSEvent.removeMonitor(commandNumberMonitor) }
    }

    override func viewDidMoveToWindow() {
        super.viewDidMoveToWindow()
        guard commandNumberMonitor == nil,
              commandNumberHandler != nil || commandBackspaceHandler != nil || commandEscapeHandler != nil else { return }
        // A local event monitor runs before AppKit menu/window dispatch. That is
        // the reliable interception point for Cmd+number in WKWebView: depending
        // on first responder, performKeyEquivalent may never reach this view.
        commandNumberMonitor = NSEvent.addLocalMonitorForEvents(matching: .keyDown) { [weak self] event in
            guard let self, self.window?.isKeyWindow == true else { return event }
            if Self.isCommandEscape(event), let commandEscapeHandler = self.commandEscapeHandler {
                commandEscapeHandler()
                return nil
            }
            if Self.isCommandBackspace(event), let commandBackspaceHandler = self.commandBackspaceHandler {
                commandBackspaceHandler()
                return nil
            }
            if let digit = Self.commandNumber(from: event),
               let commandNumberHandler = self.commandNumberHandler {
                commandNumberHandler(digit)
                return nil
            }
            return event
        }
    }

    override func acceptsFirstMouse(for event: NSEvent?) -> Bool {
        // Let the first click on an inactive Arbol window reach the renderer
        // content instead of being swallowed solely as an activation click.
        true
    }

    override func performKeyEquivalent(with event: NSEvent) -> Bool {
        if Self.isCommandEscape(event), let commandEscapeHandler {
            commandEscapeHandler()
            return true
        }
        if Self.isCommandBackspace(event), let commandBackspaceHandler {
            commandBackspaceHandler()
            return true
        }
        if let digit = Self.commandNumber(from: event), let commandNumberHandler {
            commandNumberHandler(digit)
            return true
        }
        return super.performKeyEquivalent(with: event)
    }

    static func isCommandEscape(_ event: NSEvent) -> Bool {
        guard event.type == .keyDown else { return false }
        let modifiers = event.modifierFlags.intersection([.command, .control, .option, .shift])
        return modifiers == [.command] && event.keyCode == UInt16(kVK_Escape)
    }

    static func isCommandBackspace(_ event: NSEvent) -> Bool {
        guard event.type == .keyDown else { return false }
        let modifiers = event.modifierFlags.intersection(.deviceIndependentFlagsMask)
        return modifiers == [.command] && event.keyCode == UInt16(kVK_Delete)
    }

    static func commandNumber(from event: NSEvent) -> String? {
        guard event.type == .keyDown else { return nil }
        let modifiers = event.modifierFlags.intersection(.deviceIndependentFlagsMask)
        guard modifiers == [.command] else { return nil }
        let keyCodes: [UInt16: String] = [
            UInt16(kVK_ANSI_0): "0", UInt16(kVK_ANSI_1): "1",
            UInt16(kVK_ANSI_2): "2", UInt16(kVK_ANSI_3): "3",
            UInt16(kVK_ANSI_4): "4", UInt16(kVK_ANSI_5): "5",
            UInt16(kVK_ANSI_6): "6", UInt16(kVK_ANSI_7): "7",
            UInt16(kVK_ANSI_8): "8", UInt16(kVK_ANSI_9): "9",
        ]
        return keyCodes[event.keyCode]
    }
}

/// Serves a renderer bundle's files over a custom scheme so the SPA loads with
/// a real same-origin (not file://). Read-only, scoped to one bundle directory.
final class BundleSchemeHandler: NSObject, WKURLSchemeHandler {
    static let scheme = "arbolapp"
    private let root: URL
    init(root: URL) { self.root = root.standardizedFileURL }

    func webView(_ webView: WKWebView, start task: WKURLSchemeTask) {
        guard let url = task.request.url else {
            task.didFailWithError(URLError(.badURL)); return
        }
        // arbolapp://app/<path>  → <root>/<path>; default to index.html.
        var rel = url.path
        if rel.isEmpty || rel == "/" { rel = "/index.html" }
        let fileURL = root.appendingPathComponent(rel).standardizedFileURL
        // Path-traversal guard: never serve outside the bundle root.
        guard fileURL.path.hasPrefix(root.path),
              let data = try? Data(contentsOf: fileURL) else {
            task.didFailWithError(URLError(.fileDoesNotExist)); return
        }
        let resp = HTTPURLResponse(
            url: url, statusCode: 200, httpVersion: "HTTP/1.1",
            headerFields: [
                "Content-Type": Self.mime(for: fileURL.pathExtension),
                "Access-Control-Allow-Origin": "*",
                "Cache-Control": "no-cache",
            ]
        )!
        task.didReceive(resp)
        task.didReceive(data)
        task.didFinish()
    }

    func webView(_ webView: WKWebView, stop task: WKURLSchemeTask) {}

    private static func mime(for ext: String) -> String {
        switch ext.lowercased() {
        case "html": return "text/html; charset=utf-8"
        case "js", "mjs": return "text/javascript; charset=utf-8"
        case "css": return "text/css; charset=utf-8"
        case "json": return "application/json; charset=utf-8"
        case "svg": return "image/svg+xml"
        case "png": return "image/png"
        case "jpg", "jpeg": return "image/jpeg"
        case "woff2": return "font/woff2"
        case "woff": return "font/woff"
        case "map": return "application/json"
        default: return "application/octet-stream"
        }
    }
}

/// Plain AppKit host for the renderer web view. The production windows use this
/// instead of wrapping `ContentView` in `NSHostingView`: on recent macOS builds,
/// Willo's launch-time switch into compact/floating mode could invalidate SwiftUI
/// hosting constraints during the first display pass and crash in
/// `-[NSWindow _postWindowNeedsUpdateConstraints]`. A direct `NSView` host keeps
/// the shell out of SwiftUI's window-sizing machinery entirely.
final class ArbolWebContainerView: NSView {
    private let coordinator: ContentView.Coordinator
    private let webView: WKWebView

    init(bundle: String, launchQuery: [String: String] = [:]) {
        let coordinator = ContentView.Coordinator(bundle: bundle)
        self.coordinator = coordinator
        self.webView = ContentView.makeWebView(bundle: bundle, coordinator: coordinator, launchQuery: launchQuery)
        super.init(frame: .zero)
        addSubview(webView)
    }

    required init?(coder: NSCoder) { nil }

    override func layout() {
        super.layout()
        webView.frame = bounds
    }
}

struct ContentView: NSViewRepresentable {
    /// Renderer bundle this window loads, e.g. "seqoya" → resources/renderer/seqoya/.
    /// Always set explicitly by the window's UISpec (oaken/elma/willo/seqoya); the
    /// default is just a safe fallback to a real UI.
    var bundle: String = "seqoya"

    static func makeWebView(bundle: String, coordinator: Coordinator, launchQuery: [String: String] = [:]) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.userContentController.add(coordinator, name: "arbol")

        // Serve the renderer over a custom scheme (a real, same-origin) rather
        // than file://. vite emits `<script type="module" crossorigin>`, and
        // module scripts fail the CORS check under file:// (null origin) — the
        // page renders blank. A custom scheme gives a proper origin so modules,
        // crossorigin, and fetch all work like http.
        let rendererRoot = Bundle.main.resourceURL!
            .appendingPathComponent("resources/renderer/\(bundle)")
        config.setURLSchemeHandler(BundleSchemeHandler(root: rendererRoot),
                                   forURLScheme: BundleSchemeHandler.scheme)

        let webView = ArbolWebView(frame: .zero, configuration: config)
        if bundle == "elma" {
            let dispatchOpen = { [weak webView] (detail: [String: Any]) in
                guard let data = try? JSONSerialization.data(withJSONObject: detail),
                      let json = String(data: data, encoding: .utf8) else { return }
                webView?.evaluateJavaScript(
                    "window.dispatchEvent(new CustomEvent('arbol-open', { detail: \(json) }))",
                    completionHandler: nil
                )
            }
            webView.commandNumberHandler = { digit in dispatchOpen(["cmd_number": digit]) }
            // WKWebView/AppKit consumes Cmd+Backspace as a native key equivalent
            // before the renderer sees keydown. Forward it over the same bridge
            // used by Cmd+number so Elma can open its confirmation dialog.
            webView.commandBackspaceHandler = { dispatchOpen(["archive_current_session": true]) }
            // Escape key equivalents can be swallowed before DOM keydown too.
            webView.commandEscapeHandler = { dispatchOpen(["stop_current_agent": true]) }
        }
        if #available(macOS 13.3, *) { webView.isInspectable = true }
        let pendingOpenKey = "arbol-open-query-\(bundle)"
        let sharedDefaults = UserDefaults(suiteName: "group.arbol")
        let queryJSON = sharedDefaults?.string(forKey: pendingOpenKey)
        // Session handoffs stay durable until Elma acknowledges that its attach
        // flow accepted them. Other one-shot opens (for example Cmd+number)
        // retain the original consume-on-load behavior.
        let isSessionHandoff: Bool = {
            guard let queryJSON,
                  let data = queryJSON.data(using: .utf8),
                  let query = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
            else { return false }
            return query["session_id"] is String || query["draft_id"] is String
        }()
        if queryJSON != nil && !isSessionHandoff {
            sharedDefaults?.removeObject(forKey: pendingOpenKey)
        }
        var loadURL = "\(BundleSchemeHandler.scheme)://app/index.html"
        if let queryJSON, let encoded = queryJSON.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) {
            loadURL += "?open=" + encoded
        }
        if !launchQuery.isEmpty {
            var components = URLComponents(string: loadURL)!
            var items = components.queryItems ?? []
            items.append(contentsOf: launchQuery.map { URLQueryItem(name: $0.key, value: $0.value) })
            components.queryItems = items
            loadURL = components.url?.absoluteString ?? loadURL
        }
        webView.load(URLRequest(url: URL(string: loadURL)!))

        coordinator.webView = webView
        coordinator.observeEmailSnapshotChanges()

        // Notify renderer on core disconnect so it can show "reconnecting…".
        Task {
            await CoreClient.shared.onDisconnect {
                Task { @MainActor in
                    coordinator.dispatchEventToJS(["sub_id": "__core__", "event": "core_disconnected", "data": [:]])
                }
            }
        }
        // Notify renderer when the socket reconnects, on its own synthetic
        // channel, so it can resubscribe with seq-based catch-up (§12) — the
        // replacement for the old 1.5s reconnect timer.
        Task {
            await CoreClient.shared.onReconnect {
                Task { @MainActor in
                    coordinator.dispatchEventToJS(["sub_id": "__core_reconnect__", "event": "core_reconnected", "data": [:]])
                }
            }
        }

        // Cross-app handoff (Willo / latest-sessions popup → Elma): if another
        // Arbol UI wrote a pending open payload for this bundle, deliver it both
        // when this app becomes active and when a same/cross-process native
        // handoff notification arrives. The notification covers the case where
        // Elma is already running and already active, so no didBecomeActive edge
        // would otherwise fire.
        NotificationCenter.default.addObserver(
            forName: NSApplication.didBecomeActiveNotification, object: nil, queue: .main
        ) { _ in
            Task { @MainActor in coordinator.deliverPendingOpen(bundle: bundle) }
        }
        DistributedNotificationCenter.default().addObserver(
            forName: ContentView.Coordinator.pendingOpenNotification, object: nil, queue: .main
        ) { note in
            guard (note.userInfo?["bundle"] as? String) == bundle else { return }
            Task { @MainActor in
                // The Comunicado Feed is a non-activating panel. Elma can
                // therefore still be NSApp's active process while its main
                // window is hidden, in which case activating its
                // NSRunningApplication produces no didBecomeActive transition
                // and the clicked Comunicado appears to do nothing. Handle an
                // explicit app.open handoff in the destination process too: it
                // can reliably restore and key its own window before accepting
                // the pending Chat Session payload.
                AppDelegate.shared?.activateMainWindowForOpenHandoff()
                coordinator.deliverPendingOpen(bundle: bundle)
            }
        }
        return webView
    }

    func makeNSView(context: Context) -> WKWebView {
        Self.makeWebView(bundle: bundle, coordinator: context.coordinator)
    }

    func updateNSView(_ nsView: WKWebView, context: Context) {}
    func makeCoordinator() -> Coordinator { Coordinator(bundle: bundle) }

    class Coordinator: NSObject, WKScriptMessageHandler {
        static let activeChatSessionDidChangeNotification = Notification.Name("arbol.active-chat-session.did-change")

        weak var webView: WKWebView?
        let bundle: String
        private var frameBeforeExpansion: NSRect?
        private var emailSnapshotObserver: NSObjectProtocol?
        private var emailSyncProgressObserver: NSObjectProtocol?
        private var comunicadoFeedStateObserver: NSObjectProtocol?
        private var activeChatSessionObserver: NSObjectProtocol?

        private var frameBeforeExpansionKey: String {
            "arbol.window.frame-before-expansion.\(bundle)"
        }

        init(bundle: String) {
            self.bundle = bundle
            super.init()
        }

        deinit {
            if let emailSnapshotObserver {
                NotificationCenter.default.removeObserver(emailSnapshotObserver)
            }
            if let emailSyncProgressObserver {
                NotificationCenter.default.removeObserver(emailSyncProgressObserver)
            }
            if let comunicadoFeedStateObserver {
                NotificationCenter.default.removeObserver(comunicadoFeedStateObserver)
            }
            if let activeChatSessionObserver {
                DistributedNotificationCenter.default().removeObserver(activeChatSessionObserver)
            }
        }

        func observeEmailSnapshotChanges() {
            guard bundle == "willo", emailSnapshotObserver == nil else { return }
            emailSnapshotObserver = NotificationCenter.default.addObserver(
                forName: WebMailBridge.emailSnapshotDidChangeNotification,
                object: WebMailBridge.shared,
                queue: .main
            ) { [weak self] notification in
                let revision = notification.userInfo?["revision"] as? Int ?? 0
                Task { @MainActor [weak self] in
                    self?.dispatchEmailSnapshotChanged(revision: revision)
                }
            }
            emailSyncProgressObserver = NotificationCenter.default.addObserver(
                forName: WebMailBridge.emailSyncProgressDidChangeNotification,
                object: WebMailBridge.shared,
                queue: .main
            ) { [weak self] _ in
                Task { @MainActor [weak self] in
                    self?.dispatchEmailSyncProgressChanged()
                }
            }
            comunicadoFeedStateObserver = NotificationCenter.default.addObserver(
                forName: ComunicadoFeedController.stateDidChangeNotification,
                object: nil,
                queue: .main
            ) { [weak self] notification in
                let enabled = notification.userInfo?["enabled"] as? Bool ?? false
                let count = notification.userInfo?["count"] as? Int ?? 0
                let visible = notification.userInfo?["visible"] as? Bool ?? false
                Task { @MainActor [weak self] in
                    self?.dispatchComunicadoFeedStateChanged(enabled: enabled, count: count, visible: visible)
                }
            }
            // Elma and Willo are separate processes with separate WKWebView
            // stores. Relay Elma's active Chat Session through the native host so
            // Willo updates immediately instead of relying on browser storage.
            activeChatSessionObserver = DistributedNotificationCenter.default().addObserver(
                forName: Coordinator.activeChatSessionDidChangeNotification,
                object: nil,
                queue: .main
            ) { [weak self] notification in
                let sessionID = notification.userInfo?["session_id"] as? String ?? ""
                Task { @MainActor [weak self] in
                    self?.dispatchActiveChatSessionChanged(sessionID: sessionID)
                }
            }
        }

        @MainActor
        private func dispatchEmailSnapshotChanged(revision: Int) {
            webView?.evaluateJavaScript(
                "window.dispatchEvent && window.dispatchEvent(new CustomEvent('arbol-email-snapshot-changed', { detail: { revision: \(max(0, revision)) } }))",
                completionHandler: nil
            )
        }

        @MainActor
        private func dispatchEmailSyncProgressChanged() {
            webView?.evaluateJavaScript(
                "window.dispatchEvent && window.dispatchEvent(new CustomEvent('arbol-email-sync-progress-changed'))",
                completionHandler: nil
            )
        }

        @MainActor
        private func dispatchComunicadoFeedStateChanged(enabled: Bool, count: Int, visible: Bool) {
            webView?.evaluateJavaScript(
                "window.dispatchEvent && window.dispatchEvent(new CustomEvent('arbol-comunicado-feed-state-changed', { detail: { enabled: \(enabled), count: \(max(0, count)), visible: \(visible) } }))",
                completionHandler: nil
            )
        }

        @MainActor
        private func dispatchActiveChatSessionChanged(sessionID: String) {
            guard let data = try? JSONSerialization.data(withJSONObject: ["session_id": sessionID]),
                  let detail = String(data: data, encoding: .utf8) else { return }
            webView?.evaluateJavaScript(
                "window.dispatchEvent && window.dispatchEvent(new CustomEvent('arbol-active-chat-session-changed', { detail: \(detail) }))",
                completionHandler: nil
            )
        }

        func userContentController(_ uc: WKUserContentController, didReceive message: WKScriptMessage) {
            guard let body = message.body as? [String: Any] else { return }
            let kind = body["kind"] as? String ?? "request"
            Task {
                switch kind {
                case "request":
                    await self.handleRequest(body)
                case "native":
                    await self.handleNative(body)
                case "subscribe":
                    await self.handleSubscribe(body)
                case "unsubscribe":
                    await self.handleUnsubscribe(body)
                case "diagnostic":
                    self.handleRendererDiagnostic(body)
                default:
                    break
                }
            }
        }

        // Native bridge calls handled in-app (no core RPC) — currently the
        // Claude web-session usage/login (ClaudeWeb), à la Arco.
        private func handleNative(_ body: [String: Any]) async {
            guard let callbackId = body["callbackId"] as? String,
                  let method = body["method"] as? String else { return }
            let params = body["params"] as? [String: Any] ?? [:]
            let sub = (params["subscription"] as? String) ?? ""
            let provider = (params["provider"] as? String) ?? "claude"
            if method.hasPrefix("webMail."), method != "webMail.featureStatus" {
                guard await WebMailBridge.shared.refreshFeatureStatus() else {
                    replyToJS(callbackId, ["ok": true, "result": ["ok": false, "error": "feature_disabled: Emails is disabled"]])
                    return
                }
            }
            let result: [String: Any]
            switch method {
            case "webMail.featureStatus":
                result = ["enabled": await WebMailBridge.shared.refreshFeatureStatus()]

            case "webUsage.fetch":    result = await ClaudeWeb.shared.fetchUsage(sub, provider: provider)
            case "webUsage.login":    result = await ClaudeWeb.shared.login(sub, provider: provider)
            case "webUsage.logout":   result = await ClaudeWeb.shared.logout(sub)
            case "webUsage.requests": result = await ClaudeWeb.shared.fetchRequests(sub, provider: provider)
            case "oauth.open":
                let url = (params["url"] as? String) ?? ""
                let redirect = (params["redirect_uri"] as? String) ?? ""
                result = await ClaudeWeb.shared.openOAuth(sub, provider: provider, urlString: url, redirectURI: redirect)
            case "dialog.chooseFolder":
                let start = (params["startPath"] as? String)
                result = await Coordinator.chooseFolder(startPath: start)
            case "dialog.chooseInstructionFile":
                result = await Coordinator.chooseInstructionFile()
            case "repoArtifacts.setContext":
                let path = (params["repo_path"] as? String) ?? ""
                RepoArtifactStore.setContext(repoPath: path, repoName: params["repo_name"] as? String, theme: params["theme"] as? String)
                result = ["ok": true]
            case "repoArtifacts.trackAccess":
                let path = (params["path"] as? String) ?? ""
                RepoArtifactStore.trackAccess(path: path)
                result = ["ok": true]
            case "repoArtifacts.detach":
                let path = (params["path"] as? String) ?? ""
                if path.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                    result = ["ok": false, "error": "Artifact path is required"]
                } else {
                    await MainActor.run {
                        DetachedArtifactViewLauncher().open(
                            path: path,
                            repoName: params["repo_name"] as? String,
                            repoPath: params["repo_path"] as? String,
                            theme: params["theme"] as? String
                        )
                    }
                    result = ["ok": true]
                }
            case "file.readPreview":
                let path = (params["path"] as? String) ?? ""
                result = Coordinator.readFilePreview(path: path)
                if (result["ok"] as? Bool) == true {
                    RepoArtifactStore.trackAccess(path: path)
                    _ = try? await CoreClient.shared.call(method: "entity.record_access", params: [
                        "file_path": path, "access_kind": "read",
                    ])
                }
            case "file.createTemporaryText":
                let content = (params["content"] as? String) ?? ""
                result = Coordinator.createTemporaryTextFile(content: content)
            case "file.write":
                let path = (params["path"] as? String) ?? ""
                let content = (params["content"] as? String) ?? ""
                result = Coordinator.writeFile(path: path, content: content)
                if (result["ok"] as? Bool) == true {
                    RepoArtifactStore.trackAccess(path: path)
                    _ = try? await CoreClient.shared.call(method: "entity.record_access", params: [
                        "file_path": path, "access_kind": "write",
                    ])
                }
            case "file.reveal":
                let path = (params["path"] as? String) ?? ""
                result = await MainActor.run { Coordinator.revealFile(path: path) }
            case "link.open":
                let kind = (params["kind"] as? String) ?? ""
                let target = (params["target"] as? String) ?? ""
                result = await Coordinator.openLink(kind: kind, target: target)
            case "clipboard.writeText":
                let text = (params["text"] as? String) ?? ""
                result = await MainActor.run { Coordinator.writeClipboard(text) }
            case "app.open":
                let ui = (params["ui"] as? String) ?? ""
                let query = (params["query"] as? [String: Any]) ?? [:]
                result = await Coordinator.openApp(ui: ui, query: query)
            case "app.setActiveChatSession":
                let sessionID = (params["session_id"] as? String) ?? ""
                LatestChatSessionsHistory.recordActiveSession(sessionID.isEmpty ? nil : sessionID)
                if !sessionID.isEmpty {
                    ActiveEntityHistory.record(repo: "Arbol", kind: "chat", entityID: sessionID)
                }
                DistributedNotificationCenter.default().postNotificationName(
                    Coordinator.activeChatSessionDidChangeNotification,
                    object: nil,
                    userInfo: ["session_id": sessionID],
                    deliverImmediately: true
                )
                // Opening an existing session is user activity just like
                // submitting a turn. Route it through the shared durable
                // request and five-minute admission control so it neither
                // creates another WebMailBridge in Elma nor duplicates a run.
                if WebMailBridge.activeChatSessionChangeRequestsAutomaticEmailSync(sessionID) {
                    Task { @MainActor in
                        WebMailBridge.requestAutomaticSyncAfterUserMessage()
                    }
                }
                result = ["ok": true]
            case "app.getActiveChatSession":
                result = ["ok": true, "session_id": LatestChatSessionsHistory.snapshot().currentSessionID ?? ""]
            case "app.consumeOpen":
                // The target renderer acknowledges only after its arbol-open
                // handler has accepted the payload. Compare the handoff's stable
                // identifier so a delayed acknowledgement cannot erase a newer open.
                let sessionID = (params["session_id"] as? String) ?? ""
                let sessionOpenID = (params["session_open_id"] as? String) ?? ""
                let draftID = (params["draft_id"] as? String) ?? ""
                let path = (params["path"] as? String) ?? ""
                let page = (params["page"] as? String) ?? ""
                let insertEntityURI = (params["insert_entity_uri"] as? String) ?? ""
                result = Coordinator.consumePendingOpen(
                    bundle: bundle, sessionID: sessionID, sessionOpenID: sessionOpenID, draftID: draftID,
                    path: path, page: page, insertEntityURI: insertEntityURI
                )
            case "app.setAlwaysOnTop":
                result = await MainActor.run { self.setAlwaysOnTop(params) }
            case "app.showOakenSwimlanesPanel":
                result = await MainActor.run { AppDelegate.shared?.showOakenSwimlanesPanel() ?? ["ok": false, "error": "Oaken panel is not initialized"] }
            case "app.oakenSwimlanesPanelReady":
                result = await MainActor.run { AppDelegate.shared?.oakenSwimlanesPanelDidBecomeReady() ?? ["ok": false] }
            case "app.closeOakenSwimlanesPanel":
                result = await MainActor.run { AppDelegate.shared?.closeOakenSwimlanesPanel() ?? ["ok": false] }
            case "app.openOakenSwimlane":
                let swimlaneID = (params["swimlane_id"] as? String) ?? ""
                result = await MainActor.run { AppDelegate.shared?.openOakenSwimlane(swimlaneID: swimlaneID) ?? ["ok": false] }
            case "app.oakenSwimlanesChanged":
                await MainActor.run { AppDelegate.shared?.notifyOakenSwimlanesChanged() }
                result = ["ok": true]
            case "app.dashboard.submitOakenTimeline":
                guard bundle == "oaken" else {
                    result = ["ok": false, "error": "Dashboard timeline submission is available in Oaken."]
                    break
                }
                result = await DashboardTimelineBridge.shared.submit(params: params)
            case "app.showEntityRelationshipSearch":
                let entity = params["entity"] as? [String: Any]
                let entityURI = (params["entity_uri"] as? String) ?? ""
                guard entity != nil || !entityURI.isEmpty else {
                    result = ["ok": false, "error": "missing Entity identity"]
                    break
                }
                result = await MainActor.run {
                    if let entity {
                        return AppDelegate.shared?.showEntityRelationshipSearch(entity: entity)
                            ?? ["ok": false, "error": "Entity Search is not initialized"]
                    }
                    return AppDelegate.shared?.showEntityRelationshipSearch(entityURI: entityURI)
                        ?? ["ok": false, "error": "Entity Search is not initialized"]
                }
            case "app.showEntitySearchForLivingTopic":
                guard bundle == "seqoya" else {
                    result = ["ok": false, "error": "Living Topic entity linking is available in Seqoya"]
                    break
                }
                let topicID = (params["living_topic_id"] as? String) ?? ""
                let topicTitle = (params["living_topic_title"] as? String) ?? "Living Topic"
                guard !topicID.isEmpty else {
                    result = ["ok": false, "error": "missing living topic id"]
                    break
                }
                result = await MainActor.run {
                    AppDelegate.shared?.showEntitySearchForLivingTopic(
                        livingTopicID: topicID, livingTopicTitle: topicTitle
                    ) ?? ["ok": false, "error": "Entity Search is not initialized"]
                }
            case "app.showEntitySearchForSwimmer":
                guard bundle == "oaken" else {
                    result = ["ok": false, "error": "Entity linking is available in Oaken"]
                    break
                }
                let swimlaneID = (params["swimlane_id"] as? String) ?? ""
                let swimmerID = (params["swimmer_id"] as? String) ?? ""
                let swimmerTitle = (params["swimmer_title"] as? String) ?? "Swimmer"
                guard !swimlaneID.isEmpty, !swimmerID.isEmpty else {
                    result = ["ok": false, "error": "missing swimlane or swimmer id"]
                    break
                }
                result = await MainActor.run {
                    AppDelegate.shared?.showEntitySearchForSwimmer(
                        swimlaneID: swimlaneID, swimmerID: swimmerID, swimmerTitle: swimmerTitle
                    ) ?? ["ok": false, "error": "Entity Search is not initialized"]
                }
            case "app.showEntitySearchForNewSwimlane":
                guard bundle == "oaken" else {
                    result = ["ok": false, "error": "New Swimlane entity picking is available in Oaken"]
                    break
                }
                result = await MainActor.run {
                    AppDelegate.shared?.showEntitySearchForNewSwimlane()
                        ?? ["ok": false, "error": "Entity Search is not initialized"]
                }
            case "app.beginWindowDrag":
                result = await MainActor.run { self.beginWindowDrag() }
            case "app.toggleWindowSize":
                result = await MainActor.run { self.toggleWindowSize() }
            case "app.expandWindow":
                result = await MainActor.run { self.expandWindow() }
            case "app.focusWindow":
                result = await MainActor.run { self.focusWindow() }
            case "app.closeWindow":
                result = await MainActor.run { self.closeWindow() }
            case "notify.show":
                result = await MainActor.run { self.showNotification(params) }
            case "sound.completion.play":
                result = await MainActor.run {
                    guard let sessionID = params["sessionId"] as? String, !sessionID.isEmpty,
                          let completionID = params["completionId"] as? String, !completionID.isEmpty else {
                        return ["ok": false, "error": "sessionId and completionId are required"] as [String: Any]
                    }
                    guard let delegate = AppDelegate.shared,
                          delegate.playCompletionSound(sessionID: sessionID, completionID: completionID) else {
                        return ["ok": false, "error": "Completion sound playback is unavailable"] as [String: Any]
                    }
                    return ["ok": true] as [String: Any]
                }
            case "sound.settings.get":
                result = await MainActor.run {
                    AppDelegate.shared?.completionSoundSettings()
                        ?? ["ok": false, "error": "Completion sound settings are unavailable"]
                }
            case "sound.settings.set":
                let enabled = params["enabled"] as? Bool
                let volume = params["volume"] as? Double
                guard (enabled != nil || volume != nil),
                      params["enabled"] == nil || enabled != nil,
                      params["volume"] == nil || (volume != nil && volume!.isFinite && (0...1).contains(volume!)) else {
                    result = ["ok": false, "error": "Expected enabled (boolean) or volume (0…1)"]
                    break
                }
                result = await MainActor.run {
                    AppDelegate.shared?.setCompletionSoundSettings(enabled: enabled, volume: volume)
                        ?? ["ok": false, "error": "Completion sound settings are unavailable"]
                }
            case "sound.completion.select":
                let name = (params["name"] as? String) ?? ""
                result = await MainActor.run {
                    AppDelegate.shared?.selectCompletionSound(named: name)
                        ?? ["ok": false, "error": "Completion sound settings are unavailable"]
                }
            case "sound.completion.preview":
                let name = (params["name"] as? String) ?? ""
                result = await MainActor.run {
                    AppDelegate.shared?.previewCompletionSound(named: name)
                        ?? ["ok": false, "error": "Completion sound playback is unavailable"]
                }
            case "comunicado.notification.deliver", "comunicado.macos.deliver":
                // Keep the old bridge method as an upgrade-safe alias for renderer
                // bundles installed before the Species was renamed.
                result = await MainActor.run { self.deliverNotificationComunicado(params) }
            case "comunicado.priority-notification.deliver":
                result = await MainActor.run { self.deliverPriorityNotificationComunicado(params) }
            case "comunicado.feed.state":
                result = await MainActor.run { AppDelegate.shared?.comunicadoFeedState() ?? ["ok": false, "error": "Comunicado Feed is not initialized"] }
            case "comunicado.feed.setEnabled":
                let enabled = (params["enabled"] as? Bool) ?? false
                result = await MainActor.run { AppDelegate.shared?.setComunicadoFeedEnabled(enabled) ?? ["ok": false, "error": "Comunicado Feed is not initialized"] }
            case "comunicado.species.states":
                result = await MainActor.run { AppDelegate.shared?.comunicadoSpeciesStates() ?? ["ok": false, "error": "Comunicado delivery is not initialized"] }
            case "comunicado.species.setEnabled":
                let species = (params["species"] as? String) ?? ""
                guard let enabled = params["enabled"] as? Bool else {
                    result = ["ok": false, "error": "Comunicado species and enabled state are required"]
                    break
                }
                result = await MainActor.run { AppDelegate.shared?.setComunicadoSpeciesEnabled(species, enabled: enabled) ?? ["ok": false, "error": "Comunicado delivery is not initialized"] }
            case "webMail.status":
                result = await WebMailBridge.shared.status()
            case "webMail.openUserMediatedCapture":
                result = await MainActor.run { WebMailBridge.shared.openUserMediatedCapture() }
            case "webMail.synchroniseAllUnfetched":
                result = await MainActor.run { WebMailBridge.shared.synchroniseAllUnfetched() }
            case "webMail.progress":
                result = await MainActor.run { WebMailBridge.shared.progress() }
            case "webMail.logout":
                result = await WebMailBridge.shared.logout()
            case "app.rebuildAndRestart", "app.rebuildRelaunch":
                // Keep the old method name as a compatibility alias for renderer
                // bundles installed before the fourth traffic light was renamed.
                result = await Coordinator.rebuildAndRestartCurrentUI()
            case "app.rebuildProgress":
                result = Coordinator.rebuildProgress()
            case "app.buildInfo":
                result = Coordinator.buildInfo()
            case "app.setActiveWorktree":
                let path = params["path"] as? String
                ArbolTrayController.setActiveRebuildWorktree(path)
                result = ["ok": true]
            default:                result = ["ok": false, "error": "unknown native method: \(method)"]
            }
            replyToJS(callbackId, ["ok": true, "result": result])
        }


        private var frameModeKey: String { "arbol-window-mode-\(bundle)" }
        private func frameKey(_ mode: String) -> String { "arbol-frame-\(bundle)-\(mode)" }

        @MainActor
        private func setAlwaysOnTop(_ params: [String: Any]) -> [String: Any] {
            let on = (params["on"] as? Bool) ?? false
            let minimal = (params["minimal"] as? Bool) ?? false
            guard let win = webView?.window else { return ["ok": false, "error": "window not ready"] }
            // Apply the window-chrome change on a fresh main-runloop turn instead
            // of inline. Hiding the traffic-light buttons (`isHidden`) and calling
            // `setFrame(display:)` invalidate Auto Layout; the renderer fires this
            // on mount (useEffect), which can land while the freshly-created window
            // is still inside its FIRST constraint-update pass. Mutating a view
            // mid-pass throws an uncaught NSException in
            // -[NSWindow _postWindowNeedsUpdateConstraints] and crashes the app
            // (Willo-only — only the "Keep on Top" mode drives this). Deferring
            // guarantees the active display cycle has committed first.
            DispatchQueue.main.async { [weak self] in self?.applyWindowMode(win, on: on, minimal: minimal) }
            return ["ok": true, "on": on, "mode": on ? (minimal ? "minimal" : "compact") : "full"]
        }

        @MainActor
        private func applyWindowMode(_ win: NSWindow, on: Bool, minimal: Bool = false) {
            let defaults = UserDefaults.standard
            let oldMode = defaults.string(forKey: frameModeKey) ?? "full"
            let newMode = on ? "compact" : "full"
            defaults.set(NSStringFromRect(win.frame), forKey: frameKey(oldMode))
            defaults.set(newMode, forKey: frameModeKey)

            win.level = on ? .floating : .normal
            if on {
                win.collectionBehavior.insert(.canJoinAllSpaces)
                win.collectionBehavior.insert(.fullScreenAuxiliary)
            } else {
                win.collectionBehavior.remove(.canJoinAllSpaces)
                win.collectionBehavior.remove(.fullScreenAuxiliary)
            }

            [NSWindow.ButtonType.closeButton, .miniaturizeButton, .zoomButton].forEach { button in
                win.standardWindowButton(button)?.isHidden = on
            }

            if on {
                // Minimal compact is intentionally narrow enough to behave as
                // an always-visible status widget. Both densities share the same
                // compact frame slot; switching density keeps the top/right edge
                // stable while the renderer preserves its pagination/search state.
                let compactWidth: CGFloat = minimal ? 270 : 390
                let defaultCompactHeight: CGFloat = 520
                let current = win.frame
                var rect: NSRect

                if let saved = defaults.string(forKey: frameKey(newMode)) {
                    let savedRect = NSRectFromString(saved)
                    let savedIsValid = savedRect.width > 200
                        && savedRect.height > 150
                        && NSScreen.screens.contains(where: { $0.frame.intersects(savedRect) })
                    if savedIsValid {
                        // Preserve compact position and height, but never restore
                        // its manually resized width when re-entering compact mode.
                        rect = savedRect
                        rect.origin.x = savedRect.maxX - compactWidth
                        rect.size.width = compactWidth
                    } else {
                        rect = NSRect(
                            x: current.maxX - compactWidth,
                            y: current.maxY - defaultCompactHeight,
                            width: compactWidth,
                            height: defaultCompactHeight
                        )
                    }
                } else {
                    rect = NSRect(
                        x: current.maxX - compactWidth,
                        y: current.maxY - defaultCompactHeight,
                        width: compactWidth,
                        height: defaultCompactHeight
                    )
                }

                let screen = NSScreen.screens.first(where: { $0.frame.intersects(rect) })
                    ?? NSScreen.screens.first(where: { $0.frame.intersects(current) })
                    ?? NSScreen.main
                if let visible = screen?.visibleFrame {
                    rect.origin.x = min(max(rect.origin.x, visible.minX), visible.maxX - compactWidth)
                    rect.origin.y = min(max(rect.origin.y, visible.minY), visible.maxY - rect.height)
                }
                win.setFrame(rect, display: true, animate: false)
            } else if let saved = defaults.string(forKey: frameKey(newMode)) {
                let rect = NSRectFromString(saved)
                if rect.width > 200, rect.height > 150, NSScreen.screens.contains(where: { $0.frame.intersects(rect) }) {
                    win.setFrame(rect, display: true, animate: false)
                }
            }
        }

        @MainActor
        private func beginWindowDrag() -> [String: Any] {
            guard let win = webView?.window else { return ["ok": false, "error": "window not ready"] }
            guard let event = NSApp.currentEvent else { return ["ok": false, "error": "no current event"] }
            win.performDrag(with: event)
            return ["ok": true]
        }

        static func isFullFrame(_ frame: NSRect, on screen: NSRect) -> Bool {
            let tolerance: CGFloat = 4
            return abs(frame.minX - screen.minX) <= tolerance
                && abs(frame.maxX - screen.maxX) <= tolerance
                && abs(frame.minY - screen.minY) <= tolerance
                && abs(frame.maxY - screen.maxY) <= tolerance
        }

        static func horizontalHalf(for previousFrame: NSRect?, on fullFrame: NSRect) -> (frame: NSRect, side: String) {
            // Include any odd remainder in the right half so the two frames
            // cover the usable desktop exactly without a gap or overlap.
            let leftWidth = floor(fullFrame.width / 2)
            let left = NSRect(x: fullFrame.minX, y: fullFrame.minY,
                              width: leftWidth, height: fullFrame.height)
            let right = NSRect(x: left.maxX, y: fullFrame.minY,
                               width: fullFrame.maxX - left.maxX, height: fullFrame.height)
            guard let previousFrame, !previousFrame.isEmpty, !previousFrame.isNull else {
                return (left, "left")
            }

            // Choose the side that contained most of the window's surface before
            // it was expanded. Area, rather than just the origin or center, also
            // handles windows that used to straddle the screen midpoint.
            func overlapArea(_ first: NSRect, _ second: NSRect) -> CGFloat {
                let overlap = first.intersection(second)
                return overlap.isNull || overlap.isEmpty ? 0 : overlap.width * overlap.height
            }
            let leftArea = overlapArea(previousFrame, left)
            let rightArea = overlapArea(previousFrame, right)
            if rightArea > leftArea { return (right, "right") }
            if leftArea > rightArea { return (left, "left") }

            // A frame outside the current visible area, or an exact 50/50 split,
            // has no area majority. Its center gives a stable and intuitive tie.
            return previousFrame.midX > fullFrame.midX ? (right, "right") : (left, "left")
        }

        private func rememberFrameBeforeExpansion(_ frame: NSRect, fullFrame: NSRect) {
            guard !Self.isFullFrame(frame, on: fullFrame) else { return }
            frameBeforeExpansion = frame
            UserDefaults.standard.set(NSStringFromRect(frame), forKey: frameBeforeExpansionKey)
        }

        private func rememberedFrameBeforeExpansion() -> NSRect? {
            if let frameBeforeExpansion { return frameBeforeExpansion }
            guard let value = UserDefaults.standard.string(forKey: frameBeforeExpansionKey) else { return nil }
            let frame = NSRectFromString(value)
            guard frame.width > 0, frame.height > 0 else { return nil }
            frameBeforeExpansion = frame
            return frame
        }

        @MainActor
        private func expandWindow() -> [String: Any] {
            guard let win = webView?.window else { return ["ok": false, "error": "window not ready"] }
            guard let screen = win.screen ?? NSScreen.main else { return ["ok": false, "error": "screen not ready"] }
            rememberFrameBeforeExpansion(win.frame, fullFrame: screen.visibleFrame)
            win.setFrame(screen.visibleFrame, display: true, animate: true)
            return ["ok": true, "mode": "full"]
        }

        @MainActor
        private func toggleWindowSize() -> [String: Any] {
            guard let win = webView?.window else { return ["ok": false, "error": "window not ready"] }
            guard let screen = win.screen ?? NSScreen.main else { return ["ok": false, "error": "screen not ready"] }

            // `visibleFrame` fills the usable desktop while leaving the menu bar
            // (including Arbol's tray item) and Dock visible. This deliberately
            // does not enter macOS full-screen mode or create a separate Space.
            let fullFrame = screen.visibleFrame
            if Self.isFullFrame(win.frame, on: fullFrame) {
                let destination = Self.horizontalHalf(
                    for: rememberedFrameBeforeExpansion(), on: fullFrame
                )
                win.setFrame(destination.frame, display: true, animate: true)
                return ["ok": true, "mode": "half", "side": destination.side]
            }

            rememberFrameBeforeExpansion(win.frame, fullFrame: fullFrame)
            win.setFrame(fullFrame, display: true, animate: true)
            return ["ok": true, "mode": "full"]
        }

        @MainActor
        private func closeWindow() -> [String: Any] {
            guard let window = webView?.window else { return ["ok": false, "error": "window not ready"] }
            window.performClose(nil)
            return ["ok": true]
        }

        @MainActor
        private func focusWindow() -> [String: Any] {
            guard let win = webView?.window else { return ["ok": false, "error": "window not ready"] }
            NSApp.activate(ignoringOtherApps: true)
            win.makeKeyAndOrderFront(nil)
            if let webView { win.makeFirstResponder(webView) }
            return ["ok": true]
        }

        @MainActor
        private func deliverNotificationComunicado(_ params: [String: Any]) -> [String: Any] {
            // With SwiftUI's `@NSApplicationDelegateAdaptor`, NSApp.delegate
            // can be a framework proxy rather than our AppDelegate instance.
            guard let delegate = AppDelegate.shared else {
                return ["ok": false, "error": "Notification Comunicado delivery is not initialized"]
            }
            do {
                let comunicado = try NotificationComunicadoSpecies.instantiate(from: params)
                guard delegate.emitNotificationComunicado(comunicado) else {
                    return ["ok": false, "error": "Notification Comunicado Feed is available in Willo Station"]
                }
                return ["ok": true, "id": comunicado.id]
            } catch {
                return ["ok": false, "error": error.localizedDescription]
            }
        }

        @MainActor
        private func deliverPriorityNotificationComunicado(_ params: [String: Any]) -> [String: Any] {
            guard let delegate = AppDelegate.shared else {
                return ["ok": false, "error": "Priority Notification Comunicado delivery is not initialized"]
            }
            do {
                let comunicado = try PriorityNotificationComunicadoSpecies.instantiate(from: params)
                guard delegate.emitPriorityNotificationComunicado(comunicado) else {
                    return ["ok": false, "error": "Priority Notification Comunicado Feed is unavailable or disabled"]
                }
                return ["ok": true, "id": comunicado.id]
            } catch {
                return ["ok": false, "error": error.localizedDescription]
            }
        }

        @MainActor
        private func showNotification(_ params: [String: Any]) -> [String: Any] {
            // Skip when this app is the frontmost window: the user is already
            // looking at the result, so a banner would just be noise.
            if NSApp.isActive, webView?.window?.isKeyWindow == true {
                return ["ok": true, "skipped": "foreground"]
            }
            guard let delegate = AppDelegate.shared else {
                return ["ok": false, "error": "native notification delivery is not initialized"]
            }
            let title = (params["title"] as? String) ?? "Arbol"
            let subtitle = (params["subtitle"] as? String) ?? ""
            let body = (params["body"] as? String) ?? ""
            delegate.presentAppNotification(title: title, subtitle: subtitle, body: body)
            return ["ok": true]
        }

        private static func repoRoot() -> URL? {
            let fm = FileManager.default
            var url = Bundle.main.bundleURL
            for _ in 0..<12 {
                let package = url.appendingPathComponent("renderer/package.json")
                let project = url.appendingPathComponent("app/Arbol.xcodeproj")
                if fm.fileExists(atPath: package.path) && fm.fileExists(atPath: project.path) { return url }
                url.deleteLastPathComponent()
            }
            let configuredRoot = UserDefaults.standard.string(forKey: "ArbolRepoPath") ?? ""
            let dev = configuredRoot.isEmpty
                ? fm.homeDirectoryForCurrentUser.appendingPathComponent("repos/sylvan-stack/arbol")
                : URL(fileURLWithPath: (configuredRoot as NSString).expandingTildeInPath)
            if fm.fileExists(atPath: dev.appendingPathComponent("renderer/package.json").path) { return dev }
            // Recover an existing preference pointing at the retired Arbol/main.
            if dev.lastPathComponent == "main", !fm.fileExists(atPath: dev.path) {
                let parent = dev.deletingLastPathComponent()
                if parent.lastPathComponent == "Arbol",
                   fm.fileExists(atPath: parent.appendingPathComponent(".git").path),
                   fm.fileExists(atPath: parent.appendingPathComponent("renderer/package.json").path) {
                    return parent
                }
            }
            return nil
        }

        private static func shellEscape(_ value: String) -> String {
            return "'" + value.replacingOccurrences(of: "'", with: "'\\''") + "'"
        }

        private static func currentRunningAppURL(ui: String) -> URL? {
            for app in NSWorkspace.shared.runningApplications {
                // Skip the resident ui-switcher agent (.accessory, stamped
                // bundle): it must never be reported as the running UI.
                guard app.activationPolicy == .regular,
                      let bundleURL = app.bundleURL,
                      let b = Bundle(url: bundleURL),
                      (b.object(forInfoDictionaryKey: "ArbolUI") as? String) == ui else { continue }
                return bundleURL
            }
            let ids = ["com.arbol.ui.\(ui)", "com.arbol.\(ui)", "ai.arbol.\(ui)", "org.arbol.\(ui)"]
            for id in ids {
                if let url = NSWorkspace.shared.urlForApplication(withBundleIdentifier: id) { return url }
            }
            return nil
        }

        static func worktreeName(fromBuildInfo info: [String: Any]) -> String? {
            guard let source = info["source"] as? String, !source.isEmpty else { return nil }
            let name = (source as NSString).lastPathComponent
            return name.isEmpty ? nil : name
        }

        private static func installedWorktreeName() -> String? {
            let url = FileManager.default.homeDirectoryForCurrentUser
                .appendingPathComponent("Applications/Arbol/BUILD_INFO.json")
            guard let data = try? Data(contentsOf: url),
                  let info = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return nil }
            return worktreeName(fromBuildInfo: info)
        }

        static func buildInfo() -> [String: Any] {
            var result: [String: Any] = [
                "ok": true,
                "lastRebuildFinishedAt": NSNull(),
                "worktreeName": installedWorktreeName() ?? NSNull(),
            ]
            let historyURL = FileManager.default.homeDirectoryForCurrentUser
                .appendingPathComponent("Library/Application Support/Arbol/rebuilds/history.json")
            guard let data = try? Data(contentsOf: historyURL),
                  let history = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let runs = history["runs"] as? [[String: Any]] else { return result }
            for run in runs.reversed() where run["ok"] as? Bool == true {
                if let finishedAt = run["finishedAt"] as? Double {
                    result["lastRebuildFinishedAt"] = finishedAt
                    return result
                }
                // Backward compatibility for history written before finishedAt
                // was persisted explicitly.
                if let startedAt = run["startedAt"] as? Double,
                   let duration = run["duration"] as? Double {
                    result["lastRebuildFinishedAt"] = startedAt + duration
                    return result
                }
            }
            return result
        }

        static func rebuildProgress() -> [String: Any] {
            let url = FileManager.default.homeDirectoryForCurrentUser
                .appendingPathComponent("Library/Application Support/Arbol/rebuilds/current.json")
            guard let data = try? Data(contentsOf: url),
                  var state = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
                return ["ok": true, "active": false]
            }
            let now = Date().timeIntervalSince1970
            let updated = state["updatedAt"] as? Double ?? 0
            // A dead Terminal or machine restart must not leave a permanent bar.
            if (state["active"] as? Bool) == true && now - updated > 1800 {
                state["active"] = false
                state["failed"] = true
                state["phase"] = "Rebuild progress became stale"
            }
            if (state["active"] as? Bool) == true,
               let estimateAtPhaseStart = state["expectedRemainingSeconds"] as? Double {
                let started = state["startedAt"] as? Double ?? now
                let phaseStarted = state["phaseStartedAt"] as? Double ?? now
                let phaseElapsed = max(0, now - phaseStarted)

                // The ETA and bar must describe the same predicted completion.
                // If 11 minutes have elapsed and 24 seconds remain, this puts the
                // bar near 97% rather than leaving it at an early milestone.
                let elapsed = max(0, now - started)
                let remaining = max(0, estimateAtPhaseStart - phaseElapsed)
                let predictedTotal = elapsed + remaining
                let etaProgress = predictedTotal > 0 ? elapsed / predictedTotal * 100 : 0

                // Never claim completion while the rebuild is still active.
                // A revised ETA can lower progress. Keeping a historical floor
                // would claim 98% while minutes of deployment work still remain.
                state["progress"] = min(98, etaProgress)
            }
            state["ok"] = true
            // Detailed event history remains on disk; the renderer only needs the
            // compact public status and therefore avoids shipping rebuild logs to JS.
            state.removeValue(forKey: "events")
            return state
        }

        @MainActor
        static func rebuildAndRestartCurrentUI() async -> [String: Any] {
            let ui = ARBOL_UI_KEY
            guard UI_SPECS[ui] != nil else { return ["ok": false, "error": "unknown current ui: \(ui)"] }
            guard let root = repoRoot() else { return ["ok": false, "error": "could not locate Arbol repo root"] }

            // Use the canonical per-UI rebuild script rather than merely reopening
            // the currently installed .app. It rebuilds the renderer and native
            // shell, stamps the selected UI bundle, signs it, and only then opens
            // the newly built app. Keeping that flow in scripts/rebuild-ui.sh also
            // prevents this bridge from drifting from command-line rebuilds.
            let rebuildScript = root.appendingPathComponent("scripts/rebuild-ui.sh")
            guard FileManager.default.isExecutableFile(atPath: rebuildScript.path) else {
                return ["ok": false, "error": "rebuild script is missing or not executable: \(rebuildScript.path)"]
            }

            let fallbackApp = currentRunningAppURL(ui: ui)?.path ?? ""
            let log = "/tmp/arbol-rebuild-\(ui).log"
            let command = """
            exec \(shellEscape(rebuildScript.path)) \(shellEscape(ui)) \(shellEscape(fallbackApp)) >> \(shellEscape(log)) 2>&1
            """
            let proc = Process()
            proc.executableURL = URL(fileURLWithPath: "/bin/zsh")
            proc.arguments = ["-lc", command]
            // This UI stays on screen for the whole rebuild: it is the progress
            // surface (RebuildProgress polls rebuilds/current.json) and a failed
            // build must not leave the user with no window at all — the same
            // "UIs stay up until cutover" policy as the tray rebuild. The script
            // terminates this exact process just before opening the fresh bundle,
            // so LaunchServices launches the new copy instead of activating the
            // instance being replaced.
            var environment = ProcessInfo.processInfo.environment
            environment["ARBOL_REBUILD_UI_PID"] = String(ProcessInfo.processInfo.processIdentifier)
            environment["ARBOL_REBUILD_LOG"] = log
            proc.environment = environment
            do {
                try proc.run()
                return ["ok": true, "ui": ui, "log": log]
            } catch {
                return ["ok": false, "error": error.localizedDescription, "log": log]
            }
        }

        static let pendingOpenNotification = Notification.Name("com.arbol.pending-open")

        static func pendingOpenQueryKey(bundle: String) -> String {
            "arbol-open-query-\(bundle)"
        }

        @MainActor
        static func notifyPendingOpen(bundle: String) {
            // Distributed notifications are the cross-process wake-up path for
            // Willo → Elma handoff when Elma is already running. Post on the
            // next runloop as well: activation/launch can race the first note,
            // especially when the target app is creating or reloading its
            // WKWebView. The payload itself stays in the shared defaults until a
            // renderer successfully consumes it, so duplicate notifications are
            // harmless and make the handoff much less lossy.
            let post = {
                DistributedNotificationCenter.default().postNotificationName(
                    pendingOpenNotification,
                    object: nil,
                    userInfo: ["bundle": bundle],
                    deliverImmediately: true
                )
            }
            post()
            DispatchQueue.main.async(execute: post)
        }

        @MainActor
        static func deliverPendingOpenToLocalWebViews(bundle: String) -> Bool {
            let key = pendingOpenQueryKey(bundle: bundle)
            guard let defaults = UserDefaults(suiteName: "group.arbol"),
                  let json = defaults.string(forKey: key) else { return false }
            let js = "window.__arbolPendingOpen = \(json); window.dispatchEvent && window.dispatchEvent(new CustomEvent('arbol-open', { detail: \(json) }))"
            var attempted = false
            for window in NSApp.windows {
                guard let contentView = window.contentView else { continue }
                for webView in findWebViews(in: contentView) {
                    attempted = true
                    // evaluateJavaScript succeeding only means WebKit ran this
                    // snippet; Elma may not have mounted its event listener yet.
                    // Keep the durable payload until app.consumeOpen confirms
                    // that the renderer actually accepted it.
                    webView.evaluateJavaScript(js, completionHandler: nil)
                }
            }
            return attempted
        }

        static func consumePendingOpen(
            bundle: String, sessionID: String, sessionOpenID: String = "", draftID: String = "", path: String = "",
            page: String = "", insertEntityURI: String = ""
        ) -> [String: Any] {
            if !page.isEmpty {
                let ui = UI_SPECS.first(where: { $0.value.bundle == bundle })?.key ?? ARBOL_UI_KEY
                GoToPageHistory.record(ui: ui, page: page)
            }
            let key = pendingOpenQueryKey(bundle: bundle)
            guard let defaults = UserDefaults(suiteName: "group.arbol"),
                  let json = defaults.string(forKey: key),
                  let data = json.data(using: .utf8),
                  let query = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
            else { return ["ok": true, "consumed": false] }
            let matches: Bool
            if !sessionID.isEmpty {
                matches = (query["session_id"] as? String) == sessionID
                    && (sessionOpenID.isEmpty || (query["session_open_id"] as? String) == sessionOpenID)
            } else if !draftID.isEmpty {
                matches = (query["draft_id"] as? String) == draftID
            } else if !path.isEmpty {
                matches = (query["path"] as? String) == path
            } else if !page.isEmpty {
                matches = (query["page"] as? String) == page
            } else if !insertEntityURI.isEmpty {
                matches = (query["insert_entity_uri"] as? String) == insertEntityURI
            } else {
                matches = false
            }
            guard matches else { return ["ok": true, "consumed": false] }
            defaults.removeObject(forKey: key)
            defaults.synchronize()
            return ["ok": true, "consumed": true]
        }

        @MainActor
        private static func findWebViews(in view: NSView) -> [WKWebView] {
            var result: [WKWebView] = []
            if let webView = view as? WKWebView { result.append(webView) }
            for subview in view.subviews {
                result.append(contentsOf: findWebViews(in: subview))
            }
            return result
        }

        // Activate another Arbol UI bundle (Willo → Elma handoff). The target
        // renderer receives the payload as a one-shot URL query in
        // localStorage; ContentView applies it before loading index.html so the
        // app can attach immediately on first paint.
        private static func jsonSafeOpenQueryValue(_ value: Any) -> Any? {
            // Preserve JSON scalar types across app.open handoff. Elma relies on
            // booleans such as `restore_draft` staying booleans; coercing every
            // value to String turns `false` into a truthy JS value and can make
            // Willo → Elma draft-session handoff miss the intended restore path.
            switch value {
            case let s as String:
                return s
            case let b as Bool:
                return b
            case let n as NSNumber:
                return n
            case let a as [Any]:
                return a.compactMap { jsonSafeOpenQueryValue($0) }
            case let d as [String: Any]:
                var out: [String: Any] = [:]
                for (k, v) in d {
                    if let safe = jsonSafeOpenQueryValue(v) { out[k] = safe }
                }
                return out
            default:
                return nil
            }
        }

        @MainActor
        static func revealFile(path rawPath: String) -> [String: Any] {
            let path = (rawPath as NSString).expandingTildeInPath
            guard !path.isEmpty, FileManager.default.fileExists(atPath: path) else {
                return ["ok": false, "error": "file does not exist: \(path)"]
            }
            NSWorkspace.shared.activateFileViewerSelecting([URL(fileURLWithPath: path)])
            return ["ok": true]
        }

        @MainActor
        static func writeClipboard(_ text: String) -> [String: Any] {
            guard !text.isEmpty else { return ["ok": false, "error": "clipboard text is empty"] }
            let pasteboard = NSPasteboard.general
            pasteboard.clearContents()
            guard pasteboard.setString(text, forType: .string) else {
                return ["ok": false, "error": "could not write to the macOS pasteboard"]
            }
            return ["ok": true]
        }

        /// Open links outside WebKit. HTTP(S) always goes through LaunchServices,
        /// which selects the user's default browser. Artifact paths deep-link to
        /// Seqoya's Artifacts page; other files use their normal macOS handler.
        @MainActor
        static func openLink(kind: String, target rawTarget: String) async -> [String: Any] {
            let target = rawTarget.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !target.isEmpty else { return ["ok": false, "error": "empty link"] }
            if kind == "http" {
                guard let url = URL(string: target),
                      let scheme = url.scheme?.lowercased(),
                      scheme == "http" || scheme == "https" else {
                    return ["ok": false, "error": "invalid HTTP URL"]
                }
                return ["ok": NSWorkspace.shared.open(url)]
            }
            guard kind == "file" else { return ["ok": false, "error": "unsupported link kind"] }

            // Keep :line/#anchor locators out of filesystem classification while
            // forwarding them to Seqoya so the document can land precisely.
            var locator = ""
            var pathPart = target
            if let hash = pathPart.firstIndex(of: "#") {
                locator = String(pathPart[hash...])
                pathPart = String(pathPart[..<hash])
            } else if let match = pathPart.range(of: #":\d+$"#, options: .regularExpression) {
                locator = String(pathPart[match.lowerBound...])
                pathPart = String(pathPart[..<match.lowerBound])
            }
            let expanded: String
            if pathPart.lowercased().hasPrefix("file://"), let url = URL(string: pathPart), url.isFileURL {
                expanded = url.path
            } else {
                expanded = (pathPart as NSString).expandingTildeInPath
            }
            let fileURL = URL(fileURLWithPath: expanded).standardizedFileURL
            let artifacts = FileManager.default.homeDirectoryForCurrentUser
                .appendingPathComponent("Artifacts").standardizedFileURL
            if fileURL.path != artifacts.path, fileURL.path.hasPrefix(artifacts.path + "/") {
                let relative = String(fileURL.path.dropFirst(artifacts.path.count + 1))
                let pieces = relative.split(separator: "/", maxSplits: 1, omittingEmptySubsequences: true)
                guard pieces.count == 2 else { return ["ok": false, "error": "artifact link must name a file"] }
                let corpus = String(pieces[0])
                let path = String(pieces[1]) + locator
                return await openApp(ui: "seqoya", query: [
                    "page": "artifacts", "repo": corpus, "corpus": corpus, "path": path,
                ])
            }
            guard FileManager.default.fileExists(atPath: fileURL.path) else {
                return ["ok": false, "error": "file does not exist: \(fileURL.path)"]
            }
            return ["ok": NSWorkspace.shared.open(fileURL)]
        }

        @MainActor
        static func openApp(ui: String, query: [String: Any]) async -> [String: Any] {
            guard let spec = UI_SPECS[ui] else { return ["ok": false, "error": "unknown ui: \(ui)"] }
            var q = query.compactMapValues(jsonSafeOpenQueryValue)
            ActiveEntityHistory.recordOpen(ui: ui, query: q)
            // One content-free identity follows a Chat Session open from native
            // handoff through metadata, transcript receipt, DOM commit and paint.
            // Callers may supply one for retry/replay; otherwise the host creates it.
            if q["session_id"] != nil && q["session_open_id"] == nil {
                q["session_open_id"] = UUID().uuidString.lowercased()
            }
            let openSessionID = q["session_id"] as? String ?? ""
            let openCorrelationID = q["session_open_id"] as? String ?? ""
            if !openSessionID.isEmpty {
                appendChatRenderDiagnostic(source: "native", fields: [
                    "stage": "native_open_received", "session_id": openSessionID,
                    "session_open_id": openCorrelationID, "target_ui": ui,
                ])
            }
            var deliveredLocally = false
            if !q.isEmpty, JSONSerialization.isValidJSONObject(q), let data = try? JSONSerialization.data(withJSONObject: q),
               let json = String(data: data, encoding: .utf8) {
                if let defaults = UserDefaults(suiteName: "group.arbol") {
                    defaults.set(json, forKey: pendingOpenQueryKey(bundle: spec.bundle))
                    defaults.synchronize()
                    if !openSessionID.isEmpty {
                        appendChatRenderDiagnostic(source: "native", fields: [
                            "stage": "native_open_persisted", "session_id": openSessionID,
                            "session_open_id": openCorrelationID, "target_ui": ui,
                        ])
                    }
                }
                notifyPendingOpen(bundle: spec.bundle)
                if (Bundle.main.object(forInfoDictionaryKey: "ArbolUI") as? String) == ui {
                    deliveredLocally = deliverPendingOpenToLocalWebViews(bundle: spec.bundle)
                }
            }
            // Prefer an already-running app whose Info.plist ArbolUI matches the
            // target (robust in dev, where bundle ids can vary). The resident
            // ui-switcher agent runs a stamped bundle at .accessory policy —
            // activating it would show nothing, so only regular apps count.
            var runningTarget: (app: NSRunningApplication, bundleURL: URL)?
            for app in NSWorkspace.shared.runningApplications {
                guard app.activationPolicy == .regular,
                      let bundleURL = app.bundleURL,
                      let b = Bundle(url: bundleURL),
                      (b.object(forInfoDictionaryKey: "ArbolUI") as? String) == ui else { continue }
                runningTarget = (app, bundleURL)
                break
            }
            if let target = runningTarget {
                // Cooperative activation (macOS 14+) quietly declines activate()
                // from a background process — from a hotkey that reads as "the
                // shortcut did nothing" even though it fired. Pull the activation
                // context to this process first, unhide the target, and verify:
                // if it still did not come forward, let it pull itself forward via
                // a reopen (openApplication), which the system always permits.
                let wasFrontmost = NSWorkspace.shared.frontmostApplication == target.app
                NSApp.activate(ignoringOtherApps: true)
                if target.app.isHidden { target.app.unhide() }
                target.app.activate(options: [.activateAllWindows, .activateIgnoringOtherApps])
                if !q.isEmpty { notifyPendingOpen(bundle: spec.bundle) }
                if !openSessionID.isEmpty {
                    appendChatRenderDiagnostic(source: "native", fields: [
                        "stage": "native_target_activated", "session_id": openSessionID,
                        "session_open_id": openCorrelationID, "target_ui": ui,
                        "delivered": deliveredLocally,
                    ])
                }
                if !wasFrontmost {
                    try? await Task.sleep(nanoseconds: 250_000_000)
                    if NSWorkspace.shared.frontmostApplication != target.app {
                        let cfg = NSWorkspace.OpenConfiguration()
                        cfg.activates = true
                        try? await NSWorkspace.shared.openApplication(at: target.bundleURL, configuration: cfg)
                    }
                }
                return ["ok": true, "activated": true, "delivered": deliveredLocally]
            }
            // Then try common bundle identifiers. If launch fails, still return
            // ok:false with a clear error instead of throwing through the bridge.
            let ids = ["com.arbol.ui.\(ui)", "com.arbol.\(ui)", "ai.arbol.\(ui)", "org.arbol.\(ui)"]
            for id in ids {
                if let url = NSWorkspace.shared.urlForApplication(withBundleIdentifier: id) {
                    do {
                        let cfg = NSWorkspace.OpenConfiguration()
                        cfg.activates = true
                        try await NSWorkspace.shared.openApplication(at: url, configuration: cfg)
                        if !q.isEmpty { notifyPendingOpen(bundle: spec.bundle) }
                        if !openSessionID.isEmpty {
                            appendChatRenderDiagnostic(source: "native", fields: [
                                "stage": "native_target_launched", "session_id": openSessionID,
                                "session_open_id": openCorrelationID, "target_ui": ui,
                                "delivered": deliveredLocally,
                            ])
                        }
                        return ["ok": true, "launched": true, "delivered": deliveredLocally]
                    } catch {
                        return ["ok": false, "error": "failed to open \(id): \(error)"]
                    }
                }
            }
            return ["ok": false, "error": "could not find app bundle for \(ui)"]
        }

        // Read a text-like local file for Elma's second-column preview. Bounded
        // and conservative: directories, very large/binary files, and non-file URLs are
        // rejected. Tilde paths and file:// URLs are accepted for convenience.
        static func readFilePreview(path rawPath: String) -> [String: Any] {
            let maxBytes = 512 * 1024
            let fm = FileManager.default
            let trimmed = rawPath.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !trimmed.isEmpty else { return ["ok": false, "path": rawPath, "error": "empty path"] }

            let expanded: String
            if trimmed.lowercased().hasPrefix("file://") {
                guard let url = URL(string: trimmed), url.isFileURL else {
                    return ["ok": false, "path": rawPath, "error": "invalid file URL"]
                }
                expanded = url.path
            } else {
                expanded = (trimmed as NSString).expandingTildeInPath
            }

            let url = URL(fileURLWithPath: expanded).standardizedFileURL
            var isDir: ObjCBool = false
            guard fm.fileExists(atPath: url.path, isDirectory: &isDir) else {
                return ["ok": false, "path": url.path, "error": "file does not exist"]
            }
            if isDir.boolValue {
                do {
                    let children = try fm.contentsOfDirectory(
                        at: url,
                        includingPropertiesForKeys: [.isDirectoryKey, .fileSizeKey],
                        options: [.skipsHiddenFiles]
                    )
                    let entries: [[String: Any]] = children.compactMap { child in
                        guard let values = try? child.resourceValues(forKeys: [.isDirectoryKey, .fileSizeKey]) else { return nil }
                        var entry: [String: Any] = [
                            "name": child.lastPathComponent,
                            "path": child.path,
                            "isDirectory": values.isDirectory == true,
                        ]
                        if values.isDirectory != true, let size = values.fileSize { entry["size"] = size }
                        return entry
                    }.sorted {
                        let leftDir = ($0["isDirectory"] as? Bool) == true
                        let rightDir = ($1["isDirectory"] as? Bool) == true
                        if leftDir != rightDir { return leftDir }
                        return (($0["name"] as? String) ?? "").localizedStandardCompare(($1["name"] as? String) ?? "") == .orderedAscending
                    }
                    return [
                        "ok": true,
                        "path": url.path,
                        "name": url.lastPathComponent.isEmpty ? url.path : url.lastPathComponent,
                        "isDirectory": true,
                        "entries": entries,
                    ]
                } catch {
                    return ["ok": false, "path": url.path, "error": "could not list directory: \(error.localizedDescription)"]
                }
            }
            guard let attrs = try? fm.attributesOfItem(atPath: url.path),
                  let size = attrs[.size] as? NSNumber else {
                return ["ok": false, "path": url.path, "error": "could not stat file"]
            }
            let total = size.intValue
            let readCount = min(total, maxBytes + 1)
            guard let handle = try? FileHandle(forReadingFrom: url) else {
                return ["ok": false, "path": url.path, "error": "could not open file"]
            }
            defer { try? handle.close() }
            let data = handle.readData(ofLength: readCount)
            let slice = data.prefix(maxBytes)
            guard !slice.contains(0) else {
                return ["ok": false, "path": url.path, "size": total, "error": "binary file preview is not supported"]
            }
            guard let content = String(data: slice, encoding: .utf8) ?? String(data: slice, encoding: .isoLatin1) else {
                return ["ok": false, "path": url.path, "size": total, "error": "file is not text"]
            }
            return [
                "ok": true,
                "path": url.path,
                "name": url.lastPathComponent,
                "content": content,
                "size": total,
                "truncated": total > maxBytes,
                "mime": "text/plain"
            ]
        }


        // Persist a large clipboard payload outside the repository so the draft
        // only contains a readable local-file link. The OS temp directory keeps
        // this ephemeral and avoids adding generated files to the user's checkout.
        static func createTemporaryTextFile(
            content: String,
            temporaryDirectory: URL = FileManager.default.temporaryDirectory
        ) -> [String: Any] {
            let fm = FileManager.default
            let directory = temporaryDirectory
                .appendingPathComponent("Arbol", isDirectory: true)
                .appendingPathComponent("pasted-text", isDirectory: true)
            let formatter = DateFormatter()
            formatter.locale = Locale(identifier: "en_US_POSIX")
            formatter.dateFormat = "yyyyMMdd-HHmmss"
            let filename = "paste-\(formatter.string(from: Date()))-\(UUID().uuidString.lowercased()).txt"
            let url = directory.appendingPathComponent(filename, isDirectory: false)
            guard let data = content.data(using: .utf8) else {
                return ["ok": false, "path": url.path, "error": "clipboard text is not valid UTF-8"]
            }
            do {
                try fm.createDirectory(at: directory, withIntermediateDirectories: true)
                try data.write(to: url, options: [.atomic])
                try fm.setAttributes([.posixPermissions: 0o600], ofItemAtPath: url.path)
                return ["ok": true, "path": url.path, "size": data.count]
            } catch {
                return ["ok": false, "path": url.path, "error": "could not save pasted text: \(error.localizedDescription)"]
            }
        }

        // Overwrite a text file from Elma's side-column editor. Mirrors the path
        // acceptance of readFilePreview (plain, ~, or file://), refuses empty paths
        // and directories, and writes UTF-8 atomically.
        static func writeFile(path rawPath: String, content: String) -> [String: Any] {
            let fm = FileManager.default
            let trimmed = rawPath.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !trimmed.isEmpty else { return ["ok": false, "path": rawPath, "error": "empty path"] }

            let expanded: String
            if trimmed.lowercased().hasPrefix("file://") {
                guard let url = URL(string: trimmed), url.isFileURL else {
                    return ["ok": false, "path": rawPath, "error": "invalid file URL"]
                }
                expanded = url.path
            } else {
                expanded = (trimmed as NSString).expandingTildeInPath
            }

            let url = URL(fileURLWithPath: expanded).standardizedFileURL
            var isDir: ObjCBool = false
            guard fm.fileExists(atPath: url.path, isDirectory: &isDir) else {
                return ["ok": false, "path": url.path, "error": "file does not exist"]
            }
            guard !isDir.boolValue else {
                return ["ok": false, "path": url.path, "error": "path is a directory"]
            }
            guard let data = content.data(using: .utf8) else {
                return ["ok": false, "path": url.path, "error": "content is not valid UTF-8"]
            }
            do {
                try data.write(to: url, options: .atomic)
                return ["ok": true, "path": url.path, "size": data.count]
            } catch {
                return ["ok": false, "path": url.path, "error": "could not write file: \(error.localizedDescription)"]
            }
        }

        // Open a native folder picker (Elma's ⌘0 "Other…"). Returns the chosen
        // directory's path + name, or {ok:false} when cancelled.
        @MainActor
        static func chooseInstructionFile() async -> [String: Any] {
            let panel = NSOpenPanel()
            panel.canChooseFiles = true
            panel.canChooseDirectories = false
            panel.allowsMultipleSelection = false
            panel.resolvesAliases = true
            panel.message = "Choose an instruction file to inject when the Mandate is used"
            let result = await panel.begin()
            guard result == .OK, let url = panel.url else { return ["ok": false, "cancelled": true] }
            return ["ok": true, "path": url.path]
        }

        @MainActor
        static func chooseFolder(startPath: String?) async -> [String: Any] {
            let panel = NSOpenPanel()
            panel.canChooseDirectories = true
            panel.canChooseFiles = false
            panel.allowsMultipleSelection = false
            panel.prompt = "Open"
            panel.message = "Choose a repository folder"
            let home = FileManager.default.homeDirectoryForCurrentUser
            if let sp = startPath, !sp.isEmpty {
                panel.directoryURL = URL(fileURLWithPath: (sp as NSString).expandingTildeInPath)
            } else {
                panel.directoryURL = home.appendingPathComponent("repo")
            }
            NSApp.activate(ignoringOtherApps: true)
            let resp = panel.runModal()
            if resp == .OK, let url = panel.url {
                return ["ok": true, "path": url.path, "name": url.lastPathComponent]
            }
            return ["ok": false]
        }

        private func handleRequest(_ body: [String: Any]) async {
            guard let callbackId = body["callbackId"] as? String,
                  let method = body["method"] as? String else { return }
            let params = body["params"] as? [String: Any] ?? [:]
            let sessionID = (params["chat_session_id"] as? String) ?? (params["id"] as? String) ?? ""
            let sessionOpenID = params["session_open_id"] as? String ?? ""
            let requestID = params["session_open_request_id"] as? String ?? ""
            let started = CFAbsoluteTimeGetCurrent()
            if !sessionOpenID.isEmpty {
                Self.appendChatRenderDiagnostic(source: "native", fields: [
                    "stage": "native_rpc_started", "method": method, "session_id": sessionID,
                    "session_open_id": sessionOpenID, "request_id": requestID,
                ])
            }
            do {
                let result = try await CoreClient.shared.call(method: method, params: params)
                if !sessionOpenID.isEmpty {
                    Self.appendChatRenderDiagnostic(source: "native", fields: [
                        "stage": "native_rpc_completed", "method": method, "session_id": sessionID,
                        "session_open_id": sessionOpenID, "request_id": requestID,
                        "duration_ms": (CFAbsoluteTimeGetCurrent() - started) * 1000,
                    ])
                }
                if WebMailBridge.coreRequestSubmitsUserMessage(method: method, params: params) {
                    Task { @MainActor in
                        WebMailBridge.requestAutomaticSyncAfterUserMessage()
                    }
                }
                replyToJS(callbackId, ["ok": true, "result": result])
            } catch {
                if !sessionOpenID.isEmpty {
                    Self.appendChatRenderDiagnostic(source: "native", fields: [
                        "stage": "native_rpc_failed", "method": method, "session_id": sessionID,
                        "session_open_id": sessionOpenID, "request_id": requestID,
                        "duration_ms": (CFAbsoluteTimeGetCurrent() - started) * 1000,
                        "detail": String(error.localizedDescription.prefix(2048)),
                    ])
                }
                // localizedDescription, not "\(error)": CoreError renders as
                // e.g. `connection("waiting: POSIXErrorCode…")` via the default
                // enum description, which the renderer shows verbatim in a
                // failed turn.
                replyToJS(callbackId, ["ok": false, "error": error.localizedDescription])
            }
        }

        private func handleRendererDiagnostic(_ body: [String: Any]) {
            guard let diagnostic = body["diagnostic"] as? [String: Any] else { return }
            Self.appendChatRenderDiagnostic(source: "renderer", fields: diagnostic)
        }

        static func appendChatRenderDiagnostic(source: String, fields: [String: Any]) {
            var record = fields
            record["ts"] = Date().timeIntervalSince1970
            record["source"] = source
            guard JSONSerialization.isValidJSONObject(record),
                  let data = try? JSONSerialization.data(withJSONObject: record),
                  var line = String(data: data, encoding: .utf8)
            else { return }
            line.append("\n")
            let logs = FileManager.default.homeDirectoryForCurrentUser
                .appendingPathComponent("Library/Application Support/Arbol/logs", isDirectory: true)
            try? FileManager.default.createDirectory(at: logs, withIntermediateDirectories: true)
            let url = logs.appendingPathComponent("chat-render.log")
            guard let bytes = line.data(using: .utf8) else { return }
            // Diagnostics-only log with no external rotation — cap it here or
            // it grows without bound (reached 238 MB in the field). One
            // rotated generation is kept for post-incident inspection.
            let maxBytes: UInt64 = 32 * 1024 * 1024
            if let size = (try? FileManager.default.attributesOfItem(atPath: url.path)[.size]) as? UInt64,
               size >= maxBytes {
                let rotated = logs.appendingPathComponent("chat-render.log.1")
                try? FileManager.default.removeItem(at: rotated)
                try? FileManager.default.moveItem(at: url, to: rotated)
            }
            if let handle = try? FileHandle(forWritingTo: url) {
                do {
                    try handle.seekToEnd()
                    try handle.write(contentsOf: bytes)
                    try handle.close()
                } catch { try? handle.close() }
            } else {
                try? bytes.write(to: url, options: .atomic)
            }
        }

        private func handleSubscribe(_ body: [String: Any]) async {
            guard let subId = body["subId"] as? String,
                  let stream = body["stream"] as? String else { return }
            let params = body["params"] as? [String: Any] ?? [:]
            let sessionID = params["chat_session_id"] as? String
            let sessionOpenID = params["session_open_id"] as? String ?? ""
            Self.appendChatRenderDiagnostic(source: "native", fields: [
                "stage": "native_subscribe", "sub_id": subId, "stream": stream,
                "session_id": sessionID ?? "", "session_open_id": sessionOpenID,
            ])
            do {
                try await CoreClient.shared.subscribe(stream: stream, subId: subId, params: params) { event in
                    Task { @MainActor in
                        if stream == "chat_session.render" {
                            let data = event["data"] as? [String: Any] ?? [:]
                            let view = data["view"] as? [String: Any] ?? [:]
                            var fields: [String: Any] = [
                                "stage": "native_stream_frame", "sub_id": subId, "stream": stream,
                                "session_id": sessionID ?? "", "session_open_id": sessionOpenID,
                                "event": event["event"] as? String ?? "",
                            ]
                            if let seq = data["projection_seq"] { fields["projection_seq"] = seq }
                            if let status = view["status"] { fields["projected_status"] = status }
                            Self.appendChatRenderDiagnostic(source: "native", fields: fields)
                        }
                        self.dispatchEventToJS(event)
                    }
                }
            } catch {
                // Surface error as a stream-error event.
                await MainActor.run {
                    self.dispatchEventToJS(["sub_id": subId, "event": "error", "data": ["message": error.localizedDescription]])
                }
            }
        }

        private func handleUnsubscribe(_ body: [String: Any]) async {
            guard let subId = body["sub_id"] as? String ?? body["subId"] as? String else { return }
            try? await CoreClient.shared.unsubscribe(subId: subId)
        }

        @MainActor
        private func replyToJS(_ id: String, _ payload: [String: Any]) {
            guard let json = (try? JSONSerialization.data(withJSONObject: payload)).flatMap({ String(data: $0, encoding: .utf8) }) else { return }
            let escapedId = id.replacingOccurrences(of: "\\", with: "\\\\").replacingOccurrences(of: "\"", with: "\\\"")
            webView?.evaluateJavaScript("window.__arbolReply && window.__arbolReply(\"\(escapedId)\", \(json))", completionHandler: nil)
        }

        @MainActor
        func deliverPendingOpen(bundle: String) {
            // Only consume the pending payload once there is a live webView to
            // receive it. The window can be closed/deallocated while the app
            // stays alive (or be mid-recreation on reactivation), in which case
            // `webView` is nil; removing the key here would silently drop the
            // handoff and the chat selected in Willo would never load. Leaving
            // it pending lets `makeWebView` bake it into the `?open=` URL when a
            // window is (re)created instead.
            guard let webView else { return }
            let key = Self.pendingOpenQueryKey(bundle: bundle)
            guard let json = UserDefaults(suiteName: "group.arbol")?.string(forKey: key) else { return }
            // Do not remove the shared payload merely because JavaScript ran:
            // the page can still be loading and have no arbol-open listener.
            // Elma clears it via app.consumeOpen after its handler accepts it.
            webView.evaluateJavaScript("window.__arbolPendingOpen = \(json); window.dispatchEvent && window.dispatchEvent(new CustomEvent('arbol-open', { detail: \(json) }))", completionHandler: nil)
        }

        @MainActor
        func dispatchEventToJS(_ event: [String: Any]) {
            guard let json = (try? JSONSerialization.data(withJSONObject: event)).flatMap({ String(data: $0, encoding: .utf8) }) else { return }
            webView?.evaluateJavaScript("window.__arbolEvent && window.__arbolEvent(\(json))") { _, error in
                if let error {
                    var fields: [String: Any] = [
                        "stage": "native_js_delivery_failed",
                        "sub_id": event["sub_id"] as? String ?? "",
                        "event": event["event"] as? String ?? "",
                        "detail": error.localizedDescription,
                    ]
                    let data = event["data"] as? [String: Any] ?? [:]
                    let view = data["view"] as? [String: Any] ?? [:]
                    if let seq = data["projection_seq"] { fields["projection_seq"] = seq }
                    if let status = view["status"] { fields["projected_status"] = status }
                    Self.appendChatRenderDiagnostic(source: "native", fields: fields)
                }
            }
        }
    }
}

/// Per-subscription Claude web sessions — the Arco model (no OAuth/CLI): each
/// subscription gets its own persistent, isolated `WKWebsiteDataStore` so the
/// user can be logged into multiple Claude accounts at once. Login is an in-app
/// claude.ai window; usage metrics are scraped from claude.ai/settings/usage.
@MainActor
final class ClaudeWeb: NSObject, WKUIDelegate {
    static let shared = ClaudeWeb()

    // Per-provider web-session config (login/usage URLs, the host that means
    // "logged in", and the JS that scrapes the usage page).
    struct ProviderCfg {
        let loginURL: URL
        let usageURL: URL
        let domain: String          // cookie domain + "logged in" host
        let contentProbe: String    // JS bool: has the usage content rendered?
        let extract: String         // JS function-body → usage dict
        let accountInfo: String?    // optional async JS → {name,email,organizationName}
    }
    private func config(for provider: String) -> ProviderCfg {
        switch provider {
        case "cursor":
            return ProviderCfg(
                loginURL: URL(string: "https://cursor.com/dashboard/usage")!,
                usageURL: URL(string: "https://cursor.com/dashboard/usage")!,
                domain: "cursor.com",
                contentProbe: "return document.body.innerText.toLowerCase().includes('usage') || document.body.innerText.includes('%');",
                extract: Self.cursorExtractScript,
                accountInfo: nil)
        default: // claude
            return ProviderCfg(
                loginURL: URL(string: "https://claude.ai/login")!,
                usageURL: URL(string: "https://claude.ai/settings/usage")!,
                domain: "claude.ai",
                contentProbe: "return document.body.innerText.includes('usage limits') || document.body.innerText.includes('% used') || document.body.innerText.includes('Current session');",
                extract: Self.extractScript,
                accountInfo: Self.accountInfoScript)
        }
    }

    private var scrapers: [String: WKWebView] = [:]
    private var loginWindows: [String: NSWindow] = [:]
    // Login state held on the instance (NOT captured by value in closures) so the
    // continuation is never retained by a disposed block — that was a crash.
    private var loginConts: [String: CheckedContinuation<[String: Any], Never>] = [:]
    private var loginTimers: [String: Timer] = [:]
    private var loginObservers: [String: NSObjectProtocol] = [:]

    private var oauthWindows: [String: NSWindow] = [:]
    private var oauthConts: [String: CheckedContinuation<[String: Any], Never>] = [:]
    private var oauthTimers: [String: Timer] = [:]
    private var oauthObservers: [String: NSObjectProtocol] = [:]

    // ── persistent isolated session per subscription ──────────────────────
    // One WKWebsiteDataStore instance PER subscription, cached and reused for the
    // login window, the scraper, and cookie checks. Creating multiple instances
    // for the same identifier does NOT share live cookie state — that's why login
    // didn't "stick".
    private var stores: [String: WKWebsiteDataStore] = [:]
    private func store(for sub: String) -> WKWebsiteDataStore {
        if let s = stores[sub] { return s }
        let s: WKWebsiteDataStore
        if #available(macOS 14.0, *) {
            s = WKWebsiteDataStore(forIdentifier: Self.stableUUID(for: sub))
        } else {
            s = .default() // pre-14 has no isolated persistent store
        }
        stores[sub] = s
        return s
    }

    private static func stableUUID(for sub: String) -> UUID {
        let d = Array(SHA256.hash(data: Data(("arbol-claude-usage-" + sub).utf8)))
        let u: uuid_t = (d[0], d[1], d[2], d[3], d[4], d[5], d[6], d[7],
                         d[8], d[9], d[10], d[11], d[12], d[13], d[14], d[15])
        return UUID(uuid: u)
    }

    private func scraper(for sub: String) -> WKWebView {
        if let w = scrapers[sub] { return w }
        let cfg = WKWebViewConfiguration()
        cfg.websiteDataStore = store(for: sub)
        let w = WKWebView(frame: NSRect(x: 0, y: 0, width: 1280, height: 900), configuration: cfg)
        w.uiDelegate = self
        scrapers[sub] = w
        return w
    }

    private func hasCookies(_ sub: String, domain: String) async -> Bool {
        let cookies = await store(for: sub).httpCookieStore.allCookies()
        return cookies.contains { $0.domain.contains(domain) }
    }

    /// Rewrite this subscription's session-only cookies as persistent (far-future
    /// expiry) so the login survives an app restart. WebKit does NOT persist
    /// session cookies (those with no expiry) — it drops them when the app quits,
    /// and many auth cookies are session-only, which is why logins didn't "stick"
    /// across launches. Re-setting them with an explicit `expires` makes the
    /// store write them to disk.
    private func persistSessionCookies(_ sub: String) async {
        let jar = store(for: sub).httpCookieStore
        let cookies = await jar.allCookies()
        let farFuture = Date().addingTimeInterval(60 * 60 * 24 * 365)
        for c in cookies where c.isSessionOnly || c.expiresDate == nil {
            var props = c.properties ?? [:]
            props[.expires] = farFuture
            props.removeValue(forKey: .discard)
            guard let persistent = HTTPCookie(properties: props) else { continue }
            await jar.setCookie(persistent)
        }
    }

    // OAuth popups (Google/SSO) → load in the same webview instead of a new one.
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                 for navigationAction: WKNavigationAction,
                 windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let url = navigationAction.request.url { webView.load(URLRequest(url: url)) }
        return nil
    }

    private func isLoginURL(_ url: URL?, domain: String) -> Bool {
        // Not on the provider's own domain (e.g. on an SSO/auth host) → still
        // logging in. On-domain with a login/auth path → login page too.
        guard let u = url, let host = u.host, host.contains(domain) else { return true }
        let p = u.path.lowercased()
        return p.contains("/login") || p.contains("/oauth") || p.contains("/signup")
            || p.contains("/sign-in") || p.contains("/auth")
    }

    /// Lightweight debug log for the web-session flow (→ /tmp/arbol-web.log).
    private func webLog(_ msg: String) {
        let line = "\(Date()): \(msg)\n"
        let url = URL(fileURLWithPath: "/tmp/arbol-web.log")
        guard let d = line.data(using: .utf8) else { return }
        if let h = try? FileHandle(forWritingTo: url) {
            h.seekToEndOfFile(); h.write(d); try? h.close()
        } else {
            try? d.write(to: url)
        }
    }

    // ── usage scrape ──────────────────────────────────────────────────────
    func fetchUsage(_ sub: String, provider: String) async -> [String: Any] {
        // z.ai is a separate vendor family: its usage lives in z.ai's quota API,
        // fetched by the core daemon (subscription.zai.usage). There is no web
        // session — never fall through to the claude.ai scraper.
        if provider == "zai" {
            return ["ok": false,
                    "error": "z.ai usage comes from the z.ai quota API — no claude.ai web session."]
        }
        let cfg = config(for: provider)
        // Create the scraper webview first so the network process that owns the
        // persisted cookie store is live, then warm the store. We must NOT gate on
        // a cookie count taken before a webview exists: right after an app relaunch
        // the cookie store is cold and allCookies() reports empty until a webview's
        // network process attaches and loads it from disk — that false negative is
        // what made restored logins look logged-out every restart. The page load
        // below sends the persisted session cookies; if they're truly missing or
        // expired, the site redirects to its login page, which we detect.
        let w = scraper(for: sub)
        let warm = await store(for: sub).httpCookieStore.allCookies()
        webLog("fetchUsage \(sub) [\(provider)]: warmed \(warm.filter { $0.domain.contains(cfg.domain) }.count) cookie(s) for \(cfg.domain)")
        w.load(URLRequest(url: cfg.usageURL))
        try? await Task.sleep(nanoseconds: 3_000_000_000)

        if isLoginURL(w.url, domain: cfg.domain) {
            webLog("fetchUsage \(sub): on login page after load (url=\(w.url?.absoluteString ?? "nil")) → needsLogin")
            return ["ok": false, "needsLogin": true, "error": "Not logged in to \(cfg.domain)."]
        }
        // Poll for usage content (or a login redirect) up to ~25s.
        var gotContent = false
        for _ in 0..<50 {
            if isLoginURL(w.url, domain: cfg.domain) {
                return ["ok": false, "needsLogin": true, "error": "Session expired. Please log in again."]
            }
            let has = (try? await w.callAsyncJavaScript(cfg.contentProbe,
                arguments: [:], contentWorld: .page)) as? Bool ?? false
            if has { gotContent = true; break }
            try? await Task.sleep(nanoseconds: 500_000_000)
        }
        guard gotContent else { return ["ok": false, "error": "Timed out loading usage page."] }
        try? await Task.sleep(nanoseconds: 1_000_000_000)

        var data: [String: Any]
        do {
            data = (try await w.callAsyncJavaScript("return (" + cfg.extract + ")();",
                                                    arguments: [:], contentWorld: .page)) as? [String: Any] ?? [:]
        } catch {
            return ["ok": false, "error": "Extraction failed: \(error)"]
        }
        if let acct = cfg.accountInfo,
           let info = (try? await w.callAsyncJavaScript("return await (" + acct + ")();",
                                                        arguments: [:], contentWorld: .page)) as? [String: Any] {
            data["accountName"] = info["name"] ?? NSNull()
            data["accountEmail"] = info["email"] ?? NSNull()
            data["organizationName"] = info["organizationName"] ?? NSNull()
        }
        data["provider"] = provider
        // Refresh may have rotated the auth cookies — re-pin them as persistent
        // so the session keeps surviving restarts.
        await persistSessionCookies(sub)
        return ["ok": true, "data": data]
    }

    // ── recent requests (Cursor only) ──────────────────────────────────────
    func fetchRequests(_ sub: String, provider: String) async -> [String: Any] {
        guard provider == "cursor" else {
            return ["ok": false, "error": "requests not supported for \(provider)"]
        }
        let cfg = config(for: provider)
        // Same cold-cookie-store caveat as fetchUsage: don't gate on a cookie
        // count; load and detect a login redirect instead.
        let w = scraper(for: sub)
        _ = await store(for: sub).httpCookieStore.allCookies()
        w.load(URLRequest(url: cfg.usageURL))
        try? await Task.sleep(nanoseconds: 3_000_000_000)
        if isLoginURL(w.url, domain: cfg.domain) {
            return ["ok": false, "needsLogin": true, "error": "Not logged in to \(cfg.domain)."]
        }
        // Wait for a table (the requests list) to render.
        for _ in 0..<40 {
            let has = (try? await w.callAsyncJavaScript(
                "return !!document.querySelector('table tr') || document.querySelectorAll('[role=row]').length > 1;",
                arguments: [:], contentWorld: .page)) as? Bool ?? false
            if has { break }
            try? await Task.sleep(nanoseconds: 500_000_000)
        }
        try? await Task.sleep(nanoseconds: 1_000_000_000)
        let rows = (try? await w.callAsyncJavaScript("return (" + Self.cursorRequestsScript + ")();",
                                                     arguments: [:], contentWorld: .page)) as? [[String: Any]] ?? []
        return ["ok": true, "rows": rows]
    }

    // ── Core OAuth login window ────────────────────────────────────────────
    // Shows Core's PKCE/OAuth URL in an Arbol-owned WKWebView. This keeps auth
    // inside the app while still letting core's loopback server capture the
    // authorization callback and store the resulting subscription credential.
    func openOAuth(_ sub: String, provider: String, urlString: String, redirectURI: String) async -> [String: Any] {
        guard let url = URL(string: urlString), let host = url.host else {
            return ["ok": false, "error": "invalid OAuth URL"]
        }
        guard host == "claude.ai" || host.hasSuffix(".claude.ai") || host == "platform.claude.com" || host.hasSuffix(".platform.claude.com") else {
            return ["ok": false, "error": "refusing to open non-Claude OAuth URL: \(host)"]
        }
        if oauthConts[sub] != nil { finishOAuth(sub, ok: false, error: "replaced by a new login") }
        return await withCheckedContinuation { (cont: CheckedContinuation<[String: Any], Never>) in
            oauthConts[sub] = cont

            let cfg = WKWebViewConfiguration()
            // Reuse the same isolated persistent session as usage scraping, so
            // Claude's login form/session is managed internally per subscription.
            cfg.websiteDataStore = store(for: sub)
            let wv = WKWebView(frame: NSRect(x: 0, y: 0, width: 1100, height: 820), configuration: cfg)
            wv.uiDelegate = self
            let win = NSWindow(contentRect: wv.frame,
                               styleMask: [.titled, .closable, .resizable],
                               backing: .buffered, defer: false)
            win.title = "Authorize \(provider == "claude" ? "Claude" : provider)"
            win.contentView = wv
            win.center()
            oauthWindows[sub] = win

            oauthObservers[sub] = NotificationCenter.default.addObserver(
                forName: NSWindow.willCloseNotification, object: win, queue: .main
            ) { [weak self] _ in
                Task { @MainActor in self?.finishOAuth(sub, ok: false, error: "login window closed") }
            }

            win.makeKeyAndOrderFront(nil)
            NSApp.activate(ignoringOtherApps: true)
            wv.load(URLRequest(url: url))

            oauthTimers[sub] = Timer.scheduledTimer(withTimeInterval: 0.5, repeats: true) { [weak self, weak wv] _ in
                guard let wv, let current = wv.url else { return }
                let h = current.host?.lowercased() ?? ""
                guard (h == "localhost" || h == "127.0.0.1") && current.path == "/callback" else { return }
                Task { @MainActor in
                    guard let self else { return }
                    self.oauthTimers[sub]?.invalidate()
                    self.oauthTimers[sub] = nil
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.75) { [weak self] in
                        self?.finishOAuth(sub, ok: true, error: nil)
                    }
                }
            }
        }
    }

    private func finishOAuth(_ sub: String, ok: Bool, error: String?) {
        guard let cont = oauthConts.removeValue(forKey: sub) else { return }
        oauthTimers[sub]?.invalidate()
        oauthTimers[sub] = nil
        if let obs = oauthObservers.removeValue(forKey: sub) {
            NotificationCenter.default.removeObserver(obs)
        }
        if let win = oauthWindows.removeValue(forKey: sub) {
            if win.isVisible { win.orderOut(nil) }
        }
        if ok {
            Task { await self.persistSessionCookies(sub) }
            cont.resume(returning: ["ok": true])
        } else {
            cont.resume(returning: ["ok": false, "error": error ?? "OAuth login cancelled"])
        }
    }

    // ── in-app login ──────────────────────────────────────────────────────
    func login(_ sub: String, provider: String) async -> [String: Any] {
        // z.ai authenticates with a static API key (subscription.set_token),
        // never a web login window.
        if provider == "zai" {
            return ["ok": false, "error": "z.ai uses a static API key — no web login."]
        }
        // If a login is already pending for this sub, cancel it first.
        if loginConts[sub] != nil { finishLogin(sub, ok: false) }
        let pcfg = config(for: provider)
        return await withCheckedContinuation { (cont: CheckedContinuation<[String: Any], Never>) in
            loginConts[sub] = cont

            let cfg = WKWebViewConfiguration()
            cfg.websiteDataStore = store(for: sub)
            let wv = WKWebView(frame: NSRect(x: 0, y: 0, width: 1100, height: 800), configuration: cfg)
            wv.uiDelegate = self
            let win = NSWindow(contentRect: wv.frame,
                               styleMask: [.titled, .closable, .resizable],
                               backing: .buffered, defer: false)
            win.title = "Log in to \(provider == "cursor" ? "Cursor" : "Claude")"
            win.contentView = wv
            win.center()
            loginWindows[sub] = win

            // Closures capture only self + the sub string + a weak webview — never
            // the continuation (which lives in loginConts).
            loginObservers[sub] = NotificationCenter.default.addObserver(
                forName: NSWindow.willCloseNotification, object: win, queue: .main
            ) { [weak self] _ in
                Task { @MainActor in self?.finishLogin(sub, ok: false) }
            }

            win.makeKeyAndOrderFront(nil)
            NSApp.activate(ignoringOtherApps: true)
            wv.load(URLRequest(url: pcfg.loginURL))

            let domain = pcfg.domain
            loginTimers[sub] = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { [weak self, weak wv] _ in
                guard let wv, let u = wv.url else { return }
                Task { @MainActor in
                    guard let self, !self.isLoginURL(u, domain: domain) else { return }
                    // Logged in. Stop polling, let cookies settle, then finish.
                    self.loginTimers[sub]?.invalidate()
                    self.loginTimers[sub] = nil
                    DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) { [weak self] in
                        self?.finishLogin(sub, ok: true)
                    }
                }
            }
        }
    }

    /// Resume the pending login exactly once (guarded by removeValue) and tear
    /// down the window/timer/observer.
    private func finishLogin(_ sub: String, ok: Bool) {
        guard let cont = loginConts.removeValue(forKey: sub) else { return }
        loginTimers[sub]?.invalidate()
        loginTimers[sub] = nil
        if let obs = loginObservers.removeValue(forKey: sub) {
            NotificationCenter.default.removeObserver(obs)
        }
        if let win = loginWindows.removeValue(forKey: sub) {
            if win.isVisible { win.orderOut(nil) }
        }
        // Pin the freshly-set session cookies as persistent so the login is
        // remembered after the app restarts (see persistSessionCookies).
        if ok { Task { await self.persistSessionCookies(sub) } }
        cont.resume(returning: ["ok": ok])
    }

    func logout(_ sub: String) async -> [String: Any] {
        let s = store(for: sub)
        let types = WKWebsiteDataStore.allWebsiteDataTypes()
        await s.removeData(ofTypes: types, modifiedSince: Date(timeIntervalSince1970: 0))
        scrapers[sub] = nil
        return ["ok": true]
    }

    // ── injected JS (ported verbatim from Arco's claude-usage-scraper) ──────
    private static let extractScript = #"""
function() {
  const result = { accountName: null, accountEmail: null, organizationName: null,
    planType: null, currentSession: null, weeklyLimits: [], additionalFeatures: [],
    scrapedAt: Date.now() };
  const body = document.body.innerText;
  const lines = body.split('\n').map(l => l.trim()).filter(Boolean);
  const planLineIdx = lines.findIndex(l => /usage limits/i.test(l));
  if (planLineIdx >= 0) {
    const pm = lines[planLineIdx].match(/(Team|Pro|Free|Max\s*\([^)]+\))/i);
    if (pm) { result.planType = pm[1]; }
    else if (planLineIdx + 1 < lines.length) {
      const pm2 = lines[planLineIdx + 1].match(/^(Team|Pro|Free|Max(?:\s*\([^)]+\))?)$/i);
      if (pm2) result.planType = pm2[1];
    }
  }
  let weeklyStart = -1, additionalStart = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^Weekly limits$/i.test(lines[i])) weeklyStart = i;
    if (/^Additional features$/i.test(lines[i])) additionalStart = i;
  }
  function findMeters(startIdx, endIdx) {
    const meters = [];
    for (let i = startIdx; i < endIdx && i < lines.length; i++) {
      const pctMatch = lines[i].match(/^(\d+)%\s*used$/);
      if (!pctMatch) continue;
      const pct = parseInt(pctMatch[1], 10);
      let subtitle = '', label = '';
      for (let j = i - 1; j >= startIdx; j--) {
        const line = lines[j];
        if (/^ⓘ$/.test(line)) continue;
        if (/^learn more/i.test(line)) continue;
        if (/^last updated/i.test(line)) continue;
        if (!subtitle) { subtitle = line; } else { label = line; break; }
      }
      meters.push({ label, subtitle, pct });
    }
    return meters;
  }
  const csEnd = weeklyStart > 0 ? weeklyStart : (additionalStart > 0 ? additionalStart : lines.length);
  const csMeters = findMeters(0, csEnd);
  if (csMeters.length > 0) {
    const cs = csMeters[0];
    result.currentSession = { label: cs.label || 'Current session', resetInfo: cs.subtitle,
      percentUsed: cs.pct, displayText: cs.pct + '% used' };
  }
  if (weeklyStart >= 0) {
    const wEnd = additionalStart > 0 ? additionalStart : lines.length;
    result.weeklyLimits = findMeters(weeklyStart, wEnd).map(m => ({ label: m.label,
      resetInfo: m.subtitle, percentUsed: m.pct, displayText: m.pct + '% used' }));
  }
  if (additionalStart >= 0) {
    for (let i = additionalStart + 1; i < lines.length; i++) {
      const countMatch = lines[i].match(/^(\d+)\s*\/\s*(\d+)$/);
      if (!countMatch) continue;
      let label = '';
      for (let j = i - 1; j > additionalStart; j--) {
        const line = lines[j];
        if (/^ⓘ$/.test(line)) continue;
        if (/^you haven't/i.test(line)) continue;
        if (line.length > 3) { label = line; break; }
      }
      result.additionalFeatures.push({ label: label,
        used: parseInt(countMatch[1], 10), total: parseInt(countMatch[2], 10) });
    }
  }
  return result;
}
"""#

    private static let accountInfoScript = #"""
async function() {
  const info = { name: null, email: null, organizationName: null };
  try {
    const res = await fetch('/api/auth/session');
    if (res.ok) { const data = await res.json();
      info.email = data.user?.email || null;
      info.name = data.user?.fullName || data.account?.name || info.email; }
  } catch {}
  try {
    const res = await fetch('/api/organizations');
    if (res.ok) { const orgs = await res.json();
      if (orgs && orgs.length > 0) { info.organizationName = orgs[0].name || null;
        if (!info.name) info.name = info.organizationName; } }
  } catch {}
  return info;
}
"""#

    // Cursor usage scrape — cursor.com/dashboard/usage takes two shapes:
    //  • Pro plans show two summary cards ("Your included usage" + "On-Demand
    //    Usage") → parsed into the `included` / `onDemand` billing buckets. Each
    //    card holds spend amounts (`.text-xl`, e.g. "US$0.58" "/ US$20"), a
    //    progress bar (inline `width: N%`), and a footer (reset date / team spend).
    //  • Team plans have NO buckets — just a per-request analytics table. That's
    //    aggregated into a `summary` (period + request/token/spend totals) which
    //    the UI renders as metric tiles instead.
    // A trimmed raw text dump is kept as a fallback when neither shape matches.
    private static let cursorExtractScript = #"""
function() {
  const result = { accountName: null, accountEmail: null, organizationName: null,
    planType: null, currentSession: null, weeklyLimits: [], additionalFeatures: [],
    included: null, onDemand: null, summary: null, raw: null, scrapedAt: Date.now() };
  const txt = (el) => ((el && (el.innerText || el.textContent)) || '').replace(/\s+/g, ' ').trim();
  const body = document.body.innerText || '';
  // Plan label only from the explicit "<plan> Plan" header — matching a bare
  // word picked up "Free" from a row's Type column on Team accounts.
  const pm = body.match(/\b(Ultra|Business|Team|Pro|Free)\s+Plan\b/i);
  if (pm) result.planType = pm[1].charAt(0).toUpperCase() + pm[1].slice(1).toLowerCase();

  // "US$0.58" / "$1,234.50" / "<$0.01" → number (null if no amount present).
  function dollars(s) {
    if (!s) return null;
    if (/<\s*\$?0?\.?0*1\b/.test(s)) return 0;
    const m = s.replace(/,/g, '').match(/\$\s*([\d.]+)/);
    return m ? parseFloat(m[1]) : null;
  }

  // "850.4K" / "1.4M" / "16.4K" / "-" → number of tokens (0 when absent).
  function tokens(s) {
    if (!s) return 0;
    const m = s.replace(/,/g, '').match(/([\d.]+)\s*([KMB])?/i);
    if (!m) return 0;
    const n = parseFloat(m[1]); if (isNaN(n)) return 0;
    const mult = { K: 1e3, M: 1e6, B: 1e9 }[(m[2] || '').toUpperCase()] || 1;
    return Math.round(n * mult);
  }

  // The summary card whose small header label matches `labelRe`, parsed into a
  // bucket. Climbs label → wrapper → card root so the footer (reset/team spend)
  // is in scope alongside the amounts and the % bar.
  function bucket(labelRe, outLabel) {
    let label = null;
    for (const d of document.querySelectorAll('div')) {
      const t = (d.textContent || '').trim();
      if (t.length < 40 && labelRe.test(t) && !d.querySelector('div')) { label = d; break; }
    }
    if (!label) return null;
    let root = (label.parentElement && label.parentElement.parentElement) || label.parentElement;
    if (!root || !root.querySelector('div[style*="width"]')) root = label.parentElement;
    if (!root) return null;
    const amounts = Array.from(root.querySelectorAll('.text-xl')).map(txt).filter(Boolean);
    if (!amounts.length) return null;
    const used = dollars(amounts[0]) ?? 0;
    let total = null;
    for (let k = 1; k < amounts.length; k++) { const d = dollars(amounts[k]); if (d != null) { total = d; break; } }
    let pct = null;
    const bar = root.querySelector('div[style*="width"]');
    if (bar) { const wm = (bar.getAttribute('style') || '').match(/width:\s*([\d.]+)%/); if (wm) pct = parseFloat(wm[1]); }
    const foots = Array.from(root.querySelectorAll('.text-tertiary, span')).map(txt).filter(Boolean);
    let resetInfo = '';
    const r = foots.find((t) => /reset/i.test(t)); if (r) resetInfo = r;
    if (total == null) { const ts = foots.find((t) => /team spend/i.test(t)); if (ts) { const d = dollars(ts); if (d != null) total = d; } }
    if (pct == null) pct = total ? Math.min(100, (used / total) * 100) : 0;
    if (total == null) total = used;
    return { label: outLabel, percentUsed: pct, used: used, total: total, displayText: amounts.join(' '), resetInfo: resetInfo };
  }

  result.included = bucket(/included usage/i, 'Included');
  result.onDemand = bucket(/on-?demand/i, 'On-Demand');

  // Team plans have no buckets — aggregate the analytics table into a period
  // summary. Reads the same ARIA grid (Date·User·Type·Model·Tokens·Cost) the
  // recent-requests scrape uses, summing the Tokens and Cost columns.
  if (!result.included && !result.onDemand) {
    const grid = document.querySelector('[role="table"]');
    let count = 0, totTokens = 0, totCost = 0, parsed = false;
    if (grid) {
      const heads = Array.from(grid.querySelectorAll('[role="columnheader"]')).map(h => txt(h).toLowerCase());
      const ti = heads.findIndex(h => h.includes('token'));
      const ci = heads.findIndex(h => h.includes('cost'));
      for (const r of grid.querySelectorAll('[role="row"]')) {
        const cells = Array.from(r.querySelectorAll('[role="cell"]'));
        if (!cells.length) continue;
        count++;
        if (ti >= 0 && cells[ti]) totTokens += tokens(txt(cells[ti]));
        if (ci >= 0 && cells[ci]) { const d = dollars(txt(cells[ci])); if (d != null) totCost += d; }
      }
      parsed = count > 0;
    }
    if (parsed) {
      // Period: prefer the date-range pill ("May 28 - Jun 03"), else the
      // "...from DD/MM/YYYY to DD/MM/YYYY" sentence.
      let period = '';
      const pillRe = /\b([A-Z][a-z]{2}\s+\d{1,2})\s*[-–]\s*([A-Z][a-z]{2}\s+\d{1,2})\b/;
      const pill = body.match(pillRe);
      if (pill) period = pill[1] + ' - ' + pill[2];
      else { const fr = body.match(/from\s+([\d/]+)\s+to\s+([\d/]+)/i); if (fr) period = fr[1] + ' – ' + fr[2]; }
      result.summary = { periodLabel: period, requestCount: count,
        totalTokens: totTokens, totalCost: Math.round(totCost * 100) / 100 };
    }
  }

  // Keep a raw dump only when nothing structured parsed — otherwise it's noise.
  if (!result.included && !result.onDemand && !result.summary) result.raw = body.slice(0, 2000);
  return result;
}
"""#

    // Recent-requests scrape for cursor.com/dashboard/usage. The events list is
    // an ARIA grid (role="table") with columns Date · User · Type · Model ·
    // Tokens · Cost; rows are mapped by header name → when / model / detail
    // (tokens) / cost. Cost cells render "US$0.56" + an "Included"/"On-Demand"
    // tag with no separator, so the row's `title` (the bare amount) is preferred.
    // Falls back to the largest <table> if the ARIA grid isn't present.
    private static let cursorRequestsScript = #"""
function() {
  const cellText = (el) => ((el && (el.innerText || el.textContent)) || '').replace(/\s+/g, ' ').trim();
  const costOf = (cell) => {
    if (!cell) return '';
    const t = cell.querySelector('[title]');
    if (t && t.getAttribute('title')) return t.getAttribute('title').trim();
    return cellText(cell).replace(/(Included|On-?Demand)\s*$/i, '').trim();
  };
  const aria = document.querySelector('[role="table"]');
  if (aria) {
    const heads = Array.from(aria.querySelectorAll('[role="columnheader"]')).map(h => (h.innerText || '').trim().toLowerCase());
    const find = (n) => heads.findIndex(h => h.includes(n));
    const di = find('date'), mi = find('model'), ti = find('token'), ci = find('cost');
    const out = [];
    for (const r of aria.querySelectorAll('[role="row"]')) {
      const cells = Array.from(r.querySelectorAll('[role="cell"]'));
      if (!cells.length) continue;
      const c = cells.map(cellText);
      out.push({
        when: di >= 0 ? c[di] : (c[0] || ''),
        model: mi >= 0 ? c[mi] : '',
        detail: ti >= 0 ? c[ti] : '',
        cost: costOf(ci >= 0 ? cells[ci] : cells[cells.length - 1]),
      });
    }
    if (out.length) return out.slice(0, 60);
  }
  // Fallback: largest <table> → when / model / detail / cost by position.
  let best = null, n = 0;
  for (const t of document.querySelectorAll('table')) {
    const c = t.querySelectorAll('tbody tr, tr').length;
    if (c > n) { best = t; n = c; }
  }
  let rows = [];
  if (best) {
    rows = Array.from(best.querySelectorAll('tbody tr, tr')).map(tr =>
      Array.from(tr.querySelectorAll('td,th')).map(cellText)
    ).filter(c => c.filter(Boolean).length >= 2).map(cells => ({
      when: cells[0] || '', model: cells[1] || '',
      detail: cells.slice(2, Math.max(2, cells.length - 1)).join(' '),
      cost: cells[cells.length - 1] || '',
    }));
  }
  return rows.slice(0, 60);
}
"""#
}
