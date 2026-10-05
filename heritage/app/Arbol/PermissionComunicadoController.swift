import AppKit

/// Willo-owned, cross-application Presentation for permission-request Comunicados.
/// The panel is non-activating and floating, so a decision can be taken without
/// opening either Willo or the originating Elma Chat Session.
@MainActor
final class PermissionComunicadoController: NSObject, NSWindowDelegate {
    private struct Item {
        let id: String
        let title: String
        let message: String
        let details: String
        let incidentReport: String
        let oneOff: Bool
    }

    private var timer: Timer?
    private var panel: NSPanel?
    private var current: Item?
    private var queue: [Item] = []
    private var known = Set<String>()
    private var detailsScroll: NSScrollView?
    private var polling = false

    func startIfAvailable() {
        guard ARBOL_UI_KEY == "willo", timer == nil else { return }
        refresh()
        timer = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { [weak self] _ in
            Task { @MainActor in self?.refresh() }
        }
    }

    private func refresh() {
        guard !polling else { return }
        polling = true
        Task {
            defer { Task { @MainActor in self.polling = false } }
            do {
                let result = try await CoreClient.shared.call(
                    method: "comunicado.list", params: ["status": "action_required", "limit": 200]
                )
                let rows = result["items"] as? [[String: Any]] ?? []
                await MainActor.run { self.reconcile(rows) }
            } catch {
                // Core reconnect is handled by the next poll. Keep an already
                // presented durable request visible while Core is unavailable.
            }
        }
    }

    private func reconcile(_ rows: [[String: Any]]) {
        let permissionRows = rows.filter { ($0["species"] as? String) == "permission-request" }
        let actionable = Set(permissionRows.compactMap { $0["comunicado_id"] as? String })
        queue.removeAll { !actionable.contains($0.id) }
        if let current, !actionable.contains(current.id) { finishCurrent() }

        for row in permissionRows {
            guard let id = row["comunicado_id"] as? String, known.insert(id).inserted else { continue }
            let payload = row["payload"] as? [String: Any] ?? [:]
            let title = (payload["chat_session_title"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines)
            let message = (payload["request_message"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines)
            let details = payload["technical_details"] as? String ?? row["content"] as? String ?? ""
            let requestID = payload["request_id"] as? String ?? id
            let incidentReport = permissionIncidentReport(
                id: requestID, payload: payload, fallbackDetails: details
            )
            let oneOff = (payload["approval_policy"] as? String) == "every_time"
                || (payload["canonical_kind"] as? String) == "bash:protected-lifecycle"
            queue.append(Item(
                id: id,
                title: title?.isEmpty == false ? title! : "Untitled Chat Session",
                message: message?.isEmpty == false ? message! : "Approve this request?",
                details: details,
                incidentReport: incidentReport,
                oneOff: oneOff
            ))
        }
        presentNextIfNeeded()
    }

    private func presentNextIfNeeded() {
        guard panel == nil, !queue.isEmpty else { return }
        let item = queue.removeFirst()
        current = item
        let panel = NSPanel(
            contentRect: NSRect(x: 0, y: 0, width: 500, height: 250),
            styleMask: [.titled, .nonactivatingPanel, .fullSizeContentView],
            backing: .buffered, defer: false
        )
        panel.titleVisibility = .hidden
        panel.titlebarAppearsTransparent = true
        panel.isFloatingPanel = true
        panel.level = .statusBar
        panel.hidesOnDeactivate = false
        panel.becomesKeyOnlyIfNeeded = true
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
        panel.animationBehavior = .none
        panel.isReleasedWhenClosed = false
        panel.delegate = self
        panel.contentView = makeContentView(item)
        position(panel)
        self.panel = panel
        panel.orderFrontRegardless()
    }

    private func makeContentView(_ item: Item) -> NSView {
        let effect = NSVisualEffectView()
        effect.material = .hudWindow
        effect.blendingMode = .behindWindow
        effect.state = .active

        let species = NSTextField(labelWithString: "Permission request")
        species.font = .systemFont(ofSize: 11, weight: .semibold)
        species.textColor = .secondaryLabelColor
        let chat = NSTextField(labelWithString: item.title)
        chat.font = .systemFont(ofSize: 14, weight: .semibold)
        chat.lineBreakMode = .byTruncatingTail
        let message = NSTextField(wrappingLabelWithString: item.message)
        message.font = .systemFont(ofSize: 18, weight: .semibold)

        let detailsButton = NSButton(title: "Technical details", target: self, action: #selector(toggleDetails))
        detailsButton.bezelStyle = .disclosure
        let copyIncidentButton = button("Copy incident", #selector(copyIncidentPressed))
        copyIncidentButton.toolTip = "Copy the incident ID and permission-request details"
        copyIncidentButton.controlSize = .small
        let detailsActions = NSStackView(views: [detailsButton, NSView(), copyIncidentButton])
        detailsActions.orientation = .horizontal
        detailsActions.alignment = .centerY
        let text = NSTextView()
        text.string = item.details
        text.isEditable = false
        text.isSelectable = true
        text.drawsBackground = false
        text.font = .monospacedSystemFont(ofSize: 11, weight: .regular)
        text.textContainerInset = NSSize(width: 8, height: 8)
        let scroll = NSScrollView()
        scroll.documentView = text
        scroll.hasVerticalScroller = true
        scroll.borderType = .bezelBorder
        scroll.isHidden = true
        detailsScroll = scroll

        var actionButtons: [NSView] = []
        actionButtons.append(button("Reject", #selector(rejectPressed)))
        if item.oneOff { actionButtons.append(button("Stop", #selector(stopPressed))) }
        let approve = button("Approve", #selector(approvePressed))
        approve.keyEquivalent = "\r"
        actionButtons.append(approve)
        let actions = NSStackView(views: [NSView()] + actionButtons)
        actions.orientation = .horizontal
        actions.spacing = 8

        let stack = NSStackView(views: [species, chat, message, detailsActions, scroll, actions])
        stack.orientation = .vertical
        stack.alignment = .leading
        stack.spacing = 8
        stack.translatesAutoresizingMaskIntoConstraints = false
        effect.addSubview(stack)
        detailsActions.translatesAutoresizingMaskIntoConstraints = false
        scroll.translatesAutoresizingMaskIntoConstraints = false
        actions.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            stack.leadingAnchor.constraint(equalTo: effect.leadingAnchor, constant: 18),
            stack.trailingAnchor.constraint(equalTo: effect.trailingAnchor, constant: -18),
            stack.topAnchor.constraint(equalTo: effect.topAnchor, constant: 20),
            stack.bottomAnchor.constraint(equalTo: effect.bottomAnchor, constant: -16),
            message.widthAnchor.constraint(equalTo: stack.widthAnchor),
            detailsActions.widthAnchor.constraint(equalTo: stack.widthAnchor),
            scroll.widthAnchor.constraint(equalTo: stack.widthAnchor),
            scroll.heightAnchor.constraint(equalToConstant: 140),
            actions.widthAnchor.constraint(equalTo: stack.widthAnchor),
        ])
        return effect
    }

    private func button(_ title: String, _ action: Selector) -> NSButton {
        let button = NSButton(title: title, target: self, action: action)
        button.bezelStyle = .rounded
        return button
    }

    @objc private func toggleDetails(_ sender: NSButton) {
        guard let panel, let scroll = detailsScroll else { return }
        let show = scroll.isHidden
        scroll.isHidden = !show
        sender.state = show ? .on : .off
        var frame = panel.frame
        let delta: CGFloat = show ? 148 : -148
        frame.origin.y -= delta
        frame.size.height += delta
        panel.setFrame(frame, display: true, animate: true)
    }

    @objc private func copyIncidentPressed() {
        guard let report = current?.incidentReport else { return }
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(report, forType: .string)
    }

    private func permissionIncidentReport(
        id: String, payload: [String: Any], fallbackDetails: String
    ) -> String {
        let tool = payload["tool_kind"] as? String ?? "unknown"
        let origin = payload["origin"] as? String ?? "arbol"
        let reason = payload["reason"] as? String
        let canonical = payload["canonical_kind"] as? String
        let policy = payload["approval_policy"] as? String
        let params: String
        if let value = payload["params"], JSONSerialization.isValidJSONObject(value),
           let data = try? JSONSerialization.data(withJSONObject: value, options: [.prettyPrinted, .sortedKeys]),
           let json = String(data: data, encoding: .utf8) {
            params = json
        } else {
            params = fallbackDetails
        }
        var lines = [
            "Arbol permission incident",
            "ID: \(id)",
            "Tool: \(tool)",
            "Origin: \(origin)",
        ]
        if let canonical, !canonical.isEmpty { lines.append("Canonical kind: \(canonical)") }
        if let policy, !policy.isEmpty { lines.append("Approval policy: \(policy)") }
        if let reason, !reason.isEmpty { lines.append("Reason: \(reason)") }
        lines.append("Requested action:\n\(fallbackDetails)")
        lines.append("Parameters:\n\(params)")
        return lines.joined(separator: "\n")
    }

    @objc private func approvePressed() { decide("approve") }
    @objc private func rejectPressed() { decide("reject") }
    @objc private func stopPressed() { decide("stop") }

    private func decide(_ action: String) {
        guard let item = current else { return }
        panel?.contentView?.subviews.first?.isHidden = true
        Task {
            do {
                _ = try await CoreClient.shared.call(
                    method: "comunicado.decide",
                    params: ["comunicado_id": item.id, "action": action]
                )
                await MainActor.run { self.finishCurrent() }
            } catch {
                await MainActor.run { self.panel?.contentView?.subviews.first?.isHidden = false }
            }
        }
    }

    private func finishCurrent() {
        let old = panel
        panel = nil
        current = nil
        detailsScroll = nil
        old?.delegate = nil
        old?.orderOut(nil)
        old?.close()
        presentNextIfNeeded()
    }

    func windowWillClose(_ notification: Notification) {
        guard notification.object as AnyObject? === panel else { return }
        panel = nil
        current = nil
        detailsScroll = nil
        presentNextIfNeeded()
    }

    private func position(_ panel: NSPanel) {
        guard let visible = (NSScreen.main ?? NSScreen.screens.first)?.visibleFrame else {
            panel.center(); return
        }
        var frame = panel.frame
        frame.origin.x = visible.maxX - frame.width - 24
        frame.origin.y = visible.maxY - frame.height - 24
        panel.setFrame(frame, display: false)
    }
}
