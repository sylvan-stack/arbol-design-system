import AppKit

/// Willo-owned delivery host for the generic Debug Comunicado Species.
///
/// Only Willo subscribes to request Signals, so multiple Arbol UI processes
/// cannot present duplicate panels. Startup and reconnect both catch up from
/// the last Signal sequence the user acknowledged with an Action.
@MainActor
final class DebugComunicadoController: NSObject, NSWindowDelegate {
    private static let requestType = "comunicado.debug.requested"
    static let panelCollectionBehavior: NSWindow.CollectionBehavior = [
        .canJoinAllSpaces, .fullScreenAuxiliary,
    ]
    // This is an acknowledgement cursor, not a download cursor. A request is
    // durable until the user closes its Presentation with an Action.
    private static let checkpointKey = "arbol.debug-comunicado.acknowledged-signal-seq"

    private var panel: NSPanel?
    private struct PendingComunicado {
        let comunicado: DebugComunicado
        let requestSeq: Int?
    }

    private struct RequestReference {
        let signalID: String
        let requestSeq: Int?
    }

    private var current: PendingComunicado?
    private var queue: [PendingComunicado] = []
    private var requestQueue: [RequestReference] = []
    private var resolvingRequest = false
    private var seen = Set<String>()
    private var reconnectInstalled = false
    private var workspaceActivationObserver: NSObjectProtocol?
    private let subscriptionID = "native-debug-comunicados"

    func startIfAvailable() {
        guard ARBOL_UI_KEY == "willo" else { return }
        if !reconnectInstalled {
            reconnectInstalled = true
            Task {
                await CoreClient.shared.onReconnect { [weak self] in
                    Task { @MainActor in self?.subscribe(catchUp: true) }
                }
            }
        }
        if workspaceActivationObserver == nil {
            workspaceActivationObserver = NSWorkspace.shared.notificationCenter.addObserver(
                forName: NSWorkspace.didActivateApplicationNotification,
                object: nil, queue: .main
            ) { [weak self] _ in
                Task { @MainActor in
                    guard let self,
                          !Self.isArbolUI(NSWorkspace.shared.frontmostApplication)
                    else { return }
                    self.presentNextIfNeeded()
                }
            }
        }
        subscribe(catchUp: true)
    }

    private func subscribe(catchUp: Bool) {
        var params: [String: Any] = ["types": [Self.requestType]]
        if catchUp {
            params["since_seq"] = UserDefaults.standard.integer(forKey: Self.checkpointKey)
        }
        Task {
            do {
                try await CoreClient.shared.subscribe(
                    stream: "signals", subId: subscriptionID, params: params
                ) { [weak self] envelope in
                    Task { @MainActor in self?.receive(envelope) }
                }
            } catch {
                // CoreClient's reconnect path invokes us again. Avoid presenting
                // an AppKit error solely because Core is currently restarting.
            }
        }
    }

    private func receive(_ envelope: [String: Any]) {
        guard (envelope["event"] as? String) == "signal",
              let request = envelope["data"] as? [String: Any]
        else { return }
        let requestSeq = Self.intValue(request["seq"])
        // Disabled is a delivery decision, not merely a feed-visibility choice:
        // discard requests while it is off so they cannot surface later after
        // the user re-enables the Species or restarts Willo.
        guard AppDelegate.shared?.comunicadoSpeciesEnabled("debug") != false else {
            acknowledge(requestSeq: requestSeq)
            return
        }
        guard let requestData = request["data"] as? [String: Any],
              let signalID = requestData["signal_id"] as? String,
              !signalID.isEmpty else { return }
        // The stream is ordered by durable sequence. Resolve references through
        // one serial queue so concurrent signal.get calls cannot reorder two
        // Comunicados and move the acknowledgement cursor past an older one.
        guard seen.insert(signalID).inserted else { return }
        requestQueue.append(RequestReference(signalID: signalID, requestSeq: requestSeq))
        resolveNextRequest()
    }

    private func resolveNextRequest() {
        guard !resolvingRequest, !requestQueue.isEmpty else { return }
        resolvingRequest = true
        let reference = requestQueue.removeFirst()
        Task {
            defer {
                Task { @MainActor in
                    self.resolvingRequest = false
                    self.resolveNextRequest()
                }
            }
            do {
                let result = try await CoreClient.shared.call(
                    method: "signal.get", params: ["id": reference.signalID]
                )
                guard let signal = result["signal"] as? [String: Any] else { return }
                let comunicado = try DebugComunicado.instantiate(signal: signal)
                await MainActor.run {
                    self.enqueue(comunicado, requestSeq: reference.requestSeq)
                }
            } catch {
                // Do not let an RPC failure turn the in-process dedupe set into
                // an acknowledgement. The durable stream will replay this
                // unacknowledged reference after Core reconnects.
                await MainActor.run { self.seen.remove(reference.signalID) }
            }
        }
    }

    private func enqueue(_ comunicado: DebugComunicado, requestSeq: Int?) {
        // The setting can change while signal.get is resolving. Recheck at the
        // presentation boundary so a disabled Species has no pending delivery.
        guard AppDelegate.shared?.comunicadoSpeciesEnabled("debug") != false else {
            acknowledge(requestSeq: requestSeq)
            return
        }
        AppDelegate.shared?.appendDebugComunicadoToFeed(comunicado)
        // Keep the instance queued while an Arbol UI is foreground. It becomes
        // eligible as soon as the user returns to another application; no
        // diagnostic Signal is lost merely because it arrived while inspecting
        // Arbol itself.
        queue.append(PendingComunicado(comunicado: comunicado, requestSeq: requestSeq))
        presentNextIfNeeded()
    }

    private func presentNextIfNeeded() {
        guard AppDelegate.shared?.comunicadoSpeciesEnabled("debug") != false else { return }
        guard !Self.isArbolUI(NSWorkspace.shared.frontmostApplication) else { return }
        guard panel == nil, !queue.isEmpty else { return }
        let pending = queue.removeFirst()
        let comunicado = pending.comunicado
        current = pending

        let panel = NSPanel(
            contentRect: NSRect(x: 0, y: 0, width: 620, height: 560),
            styleMask: [.titled, .closable, .nonactivatingPanel, .fullSizeContentView],
            backing: .buffered,
            defer: false
        )
        panel.title = "Debug Comunicado"
        panel.titleVisibility = .hidden
        panel.titlebarAppearsTransparent = true
        panel.isFloatingPanel = true
        panel.level = .floating
        panel.hidesOnDeactivate = false
        panel.becomesKeyOnlyIfNeeded = true
        // `.transient` is intentionally not used here. AppKit orders transient
        // panels owned by an inactive application back out immediately, even
        // after `orderFrontRegardless()`. A Debug Comunicado is persistent and
        // must remain over the user's current application until an Action closes
        // it.
        panel.collectionBehavior = Self.panelCollectionBehavior
        panel.animationBehavior = .none
        panel.isReleasedWhenClosed = false
        panel.delegate = self
        panel.contentView = makeContentView(for: comunicado)
        position(panel)
        self.panel = panel
        panel.orderFrontRegardless()
    }

    private func makeContentView(for comunicado: DebugComunicado) -> NSView {
        let effect = NSVisualEffectView()
        effect.material = .hudWindow
        effect.blendingMode = .behindWindow
        effect.state = .active

        let title = NSTextField(labelWithString: "Debug Comunicado")
        title.font = .systemFont(ofSize: 18, weight: .semibold)
        let type = NSTextField(labelWithString: comunicado.signalType)
        type.font = .monospacedSystemFont(ofSize: 12, weight: .medium)
        type.textColor = .secondaryLabelColor
        type.lineBreakMode = .byTruncatingMiddle

        let text = NSTextView()
        text.string = comunicado.formattedSignal
        text.isEditable = false
        text.isSelectable = true
        text.drawsBackground = false
        text.font = .monospacedSystemFont(ofSize: 11.5, weight: .regular)
        text.textColor = .labelColor
        text.textContainerInset = NSSize(width: 10, height: 10)
        let scroll = NSScrollView()
        scroll.documentView = text
        scroll.hasVerticalScroller = true
        scroll.hasHorizontalScroller = false
        scroll.drawsBackground = true
        scroll.backgroundColor = NSColor.textBackgroundColor.withAlphaComponent(0.72)
        scroll.borderType = .bezelBorder

        let dismiss = NSButton(title: "Dismiss", target: self, action: #selector(dismissPressed))
        dismiss.bezelStyle = .rounded
        let chat = NSButton(title: "Chat", target: self, action: #selector(chatPressed))
        chat.bezelStyle = .rounded
        chat.keyEquivalent = "\r"

        let buttons = NSStackView(views: [NSView(), dismiss, chat])
        buttons.orientation = .horizontal
        buttons.spacing = 10
        let stack = NSStackView(views: [title, type, scroll, buttons])
        stack.orientation = .vertical
        stack.alignment = .leading
        stack.spacing = 8
        stack.translatesAutoresizingMaskIntoConstraints = false
        effect.addSubview(stack)
        scroll.translatesAutoresizingMaskIntoConstraints = false
        buttons.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            stack.leadingAnchor.constraint(equalTo: effect.leadingAnchor, constant: 18),
            stack.trailingAnchor.constraint(equalTo: effect.trailingAnchor, constant: -18),
            stack.topAnchor.constraint(equalTo: effect.topAnchor, constant: 22),
            stack.bottomAnchor.constraint(equalTo: effect.bottomAnchor, constant: -16),
            scroll.widthAnchor.constraint(equalTo: stack.widthAnchor),
            scroll.heightAnchor.constraint(greaterThanOrEqualToConstant: 380),
            buttons.widthAnchor.constraint(equalTo: stack.widthAnchor),
        ])
        return effect
    }

    private func position(_ panel: NSPanel) {
        let screen = NSScreen.main ?? NSScreen.screens.first
        guard let visible = screen?.visibleFrame else { panel.center(); return }
        var frame = panel.frame
        frame.origin.x = visible.maxX - frame.width - 24
        frame.origin.y = visible.maxY - frame.height - 24
        panel.setFrame(frame, display: false)
    }

    @objc private func dismissPressed() { finishCurrent() }

    @objc private func chatPressed() {
        guard let signalID = current?.comunicado.signalID else { finishCurrent(); return }
        // Close before creating/activating Elma, as required by the Action.
        finishCurrent(presentNext: false)
        Task {
            do {
                let result = try await CoreClient.shared.call(
                    method: "comunicado.debug.create_chat_draft",
                    params: ["signal_id": signalID]
                )
                guard let draftID = result["draft_id"] as? String else { return }
                _ = await ContentView.Coordinator.openApp(
                    ui: "elma", query: ["draft_id": draftID]
                )
            } catch {
                // The durable Signal remains available; failure is intentionally
                // non-modal so this diagnostic popup never steals focus.
            }
        }
    }

    private func finishCurrent(presentNext: Bool = true) {
        let old = panel
        let acknowledgedSeq = current?.requestSeq
        let dismissedSignalID = current?.comunicado.signalID
        panel = nil
        current = nil
        acknowledge(requestSeq: acknowledgedSeq)
        old?.delegate = nil
        old?.orderOut(nil)
        old?.close()
        if let dismissedSignalID {
            AppDelegate.shared?.dismissDebugComunicadoInFeed(signalID: dismissedSignalID)
        }
        if presentNext { presentNextIfNeeded() }
    }

    func windowWillClose(_ notification: Notification) {
        guard notification.object as AnyObject? === panel else { return }
        let acknowledgedSeq = current?.requestSeq
        let dismissedSignalID = current?.comunicado.signalID
        panel = nil
        current = nil
        acknowledge(requestSeq: acknowledgedSeq)
        if let dismissedSignalID {
            AppDelegate.shared?.dismissDebugComunicadoInFeed(signalID: dismissedSignalID)
        }
        presentNextIfNeeded()
    }

    /// Stop this Species immediately, including queued and active native panels.
    /// Each discarded request is acknowledged so it is not replayed when the
    /// Species is enabled again or Willo reconnects.
    func setDeliveryEnabled(_ enabled: Bool) {
        guard !enabled else { return }
        requestQueue.forEach { acknowledge(requestSeq: $0.requestSeq) }
        requestQueue.removeAll()
        queue.forEach { acknowledge(requestSeq: $0.requestSeq) }
        queue.removeAll()
        if current != nil {
            finishCurrent(presentNext: false)
        }
    }

    private func acknowledge(requestSeq: Int?) {
        guard let requestSeq else { return }
        let checkpoint = UserDefaults.standard.integer(forKey: Self.checkpointKey)
        UserDefaults.standard.set(max(checkpoint, requestSeq), forKey: Self.checkpointKey)
    }

    static func isArbolUI(_ application: NSRunningApplication?) -> Bool {
        guard let bundleURL = application?.bundleURL,
              let bundle = Bundle(url: bundleURL),
              let key = bundle.object(forInfoDictionaryKey: "ArbolUI") as? String
        else { return false }
        return UI_SPECS[key] != nil
    }

    private static func intValue(_ value: Any?) -> Int? {
        if let value = value as? Int { return value }
        if let value = value as? NSNumber { return value.intValue }
        return nil
    }
}
