import AppKit
import Carbon

/// The last Entity the user visited is shared by every Arbol UI process. A Visit
/// is recorded only for a full Entity view; list expansion and selection do not
/// call this store. Keeping the latest Visit when a page has no Entity context
/// gives Cmd+L its cross-app fallback (for example Elma Chat → Willo Station).
enum ActiveEntityHistory {
    private static let key = "arbol-most-recently-visited-entity"

    static func snapshot(defaults: UserDefaults? = UserDefaults(suiteName: "group.arbol")) -> [String: Any]? {
        defaults?.dictionary(forKey: key)
    }

    static func record(
        repo: String, kind: String, entityID: String, title: String? = nil,
        defaults: UserDefaults? = UserDefaults(suiteName: "group.arbol")
    ) {
        guard let defaults, !kind.isEmpty, !entityID.isEmpty else { return }
        var value: [String: Any] = [
            "repo": repo.isEmpty ? "Any" : repo,
            "kind": kind,
            "entity_id": entityID,
            "visited_at": Date().timeIntervalSince1970,
        ]
        if let title, !title.isEmpty { value["title"] = title }
        defaults.set(value, forKey: key)
    }

    /// Record only open payloads that identify one dedicated Entity page.
    static func recordOpen(ui: String, query: [String: Any]) {
        if ui == "elma", let id = query["session_id"] as? String, !id.isEmpty {
            record(repo: "Arbol", kind: "chat", entityID: id)
        } else if ui == "oaken", (query["page"] as? String) == "entity",
                  let kind = query["entity_kind"] as? String,
                  let id = query["entity_id"] as? String {
            record(repo: "Any", kind: kind, entityID: id)
        } else if ui == "seqoya", (query["page"] as? String) == "living-topics",
                  let id = query["living_topic_id"] as? String, !id.isEmpty {
            record(repo: "Arbol", kind: "living_topic", entityID: id)
        }
    }
}

private struct LinkedEntityRow {
    let repo: String
    let kind: String
    let entityID: String
    let title: String
    let relationship: String
    let direction: String

    init?(_ value: [String: Any]) {
        guard let kind = value["kind"] as? String,
              let entityID = value["entity_id"] as? String,
              let title = value["title"] as? String else { return nil }
        repo = (value["repo"] as? String) ?? "Any"
        self.kind = kind
        self.entityID = entityID
        self.title = title
        relationship = (value["relationship_type"] as? String) ?? "related"
        direction = (value["direction"] as? String) ?? "outgoing"
    }
}

final class LinkedEntitiesHotkeyController: NSObject {
    private var keyMonitor: Any?
    private lazy var popup = LinkedEntitiesController()

    func installIfAvailable() {
        guard keyMonitor == nil else { return }
        keyMonitor = NSEvent.addLocalMonitorForEvents(matching: .keyDown) { [weak self] event in
            guard Self.shouldHandle(event: event, hasVisibleWindow: NSApp.windows.contains(where: \.isVisible)) else {
                return event
            }
            self?.popup.toggle()
            return nil
        }
    }

    static func shouldHandle(event: NSEvent, hasVisibleWindow: Bool) -> Bool {
        guard hasVisibleWindow, event.keyCode == UInt16(kVK_ANSI_L) else { return false }
        return event.modifierFlags.intersection(.deviceIndependentFlagsMask) == [.command]
    }

    deinit { if let keyMonitor { NSEvent.removeMonitor(keyMonitor) } }
}

private final class LinkedEntitiesPanel: NSPanel {
    var handleKeyDown: ((NSEvent) -> Bool)?
    override var canBecomeKey: Bool { true }
    override var canBecomeMain: Bool { false }
    override func sendEvent(_ event: NSEvent) {
        if event.type == .keyDown, handleKeyDown?(event) == true { return }
        super.sendEvent(event)
    }
}

private final class LinkedEntitiesController: NSObject, NSTableViewDataSource, NSTableViewDelegate {
    private var panel: LinkedEntitiesPanel?
    private let contextLabel = NSTextField(labelWithString: "")
    private let statusLabel = NSTextField(labelWithString: "")
    private let table = NSTableView()
    private var rows: [LinkedEntityRow] = []
    private var loadTask: Task<Void, Never>?

    func toggle() { panel?.isVisible == true ? dismiss() : show() }

    private func show() {
        if panel == nil { buildPanel() }
        rows = []
        table.reloadData()
        contextLabel.stringValue = "Linked Entities"
        statusLabel.stringValue = "Loading…"
        statusLabel.isHidden = false
        panel?.center()
        panel?.makeKeyAndOrderFront(nil)
        load()
    }

    private func dismiss() {
        loadTask?.cancel()
        panel?.orderOut(nil)
    }

    private func load() {
        loadTask?.cancel()
        guard let active = ActiveEntityHistory.snapshot(),
              let kind = active["kind"] as? String,
              let entityID = active["entity_id"] as? String else {
            statusLabel.stringValue = "Visit an Entity page first to see its links."
            return
        }
        let title = (active["title"] as? String) ?? entityID
        contextLabel.stringValue = "Linked to \(title)"
        let entity: [String: Any] = [
            "repo": (active["repo"] as? String) ?? "Any", "kind": kind, "entity_id": entityID,
        ]
        loadTask = Task { [weak self] in
            do {
                let response = try await CoreClient.shared.call(
                    method: "entity.linked", params: ["entity": entity, "limit": 100]
                )
                guard !Task.isCancelled else { return }
                let found = (response["entities"] as? [[String: Any]] ?? []).compactMap(LinkedEntityRow.init)
                self?.rows = found
                self?.table.reloadData()
                self?.statusLabel.stringValue = found.isEmpty ? "This Entity has no linked Entities." : ""
                self?.statusLabel.isHidden = !found.isEmpty
                if !found.isEmpty { self?.table.selectRowIndexes(IndexSet(integer: 0), byExtendingSelection: false) }
            } catch {
                guard !Task.isCancelled else { return }
                self?.statusLabel.stringValue = "Linked Entities unavailable: \(error.localizedDescription)"
                self?.statusLabel.isHidden = false
            }
        }
    }

    private func buildPanel() {
        let panel = LinkedEntitiesPanel(
            contentRect: NSRect(x: 0, y: 0, width: 650, height: 500),
            styleMask: [.titled, .fullSizeContentView, .nonactivatingPanel], backing: .buffered, defer: false
        )
        panel.title = "Linked Entities"
        panel.titleVisibility = .hidden
        panel.titlebarAppearsTransparent = true
        panel.isFloatingPanel = true
        panel.level = .floating
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
        panel.hidesOnDeactivate = true

        let root = NSView()
        panel.contentView = root
        contextLabel.font = .systemFont(ofSize: 20, weight: .semibold)
        contextLabel.lineBreakMode = .byTruncatingTail
        let scroll = NSScrollView()
        scroll.hasVerticalScroller = true
        scroll.drawsBackground = false
        let column = NSTableColumn(identifier: NSUserInterfaceItemIdentifier("linked"))
        column.resizingMask = .autoresizingMask
        table.addTableColumn(column)
        table.headerView = nil
        table.rowHeight = 52
        table.intercellSpacing = NSSize(width: 0, height: 2)
        table.backgroundColor = .clear
        table.delegate = self
        table.dataSource = self
        table.target = self
        table.doubleAction = #selector(openSelected)
        scroll.documentView = table
        statusLabel.textColor = .secondaryLabelColor
        statusLabel.alignment = .center
        let footer = NSTextField(labelWithString: "↑/↓ select · Enter open · Esc close")
        footer.font = .systemFont(ofSize: 11)
        footer.textColor = .secondaryLabelColor
        [contextLabel, scroll, statusLabel, footer].forEach {
            $0.translatesAutoresizingMaskIntoConstraints = false
            root.addSubview($0)
        }
        NSLayoutConstraint.activate([
            contextLabel.topAnchor.constraint(equalTo: root.topAnchor, constant: 30),
            contextLabel.leadingAnchor.constraint(equalTo: root.leadingAnchor, constant: 24),
            contextLabel.trailingAnchor.constraint(equalTo: root.trailingAnchor, constant: -24),
            scroll.topAnchor.constraint(equalTo: contextLabel.bottomAnchor, constant: 16),
            scroll.leadingAnchor.constraint(equalTo: root.leadingAnchor, constant: 14),
            scroll.trailingAnchor.constraint(equalTo: root.trailingAnchor, constant: -14),
            statusLabel.centerXAnchor.constraint(equalTo: scroll.centerXAnchor),
            statusLabel.centerYAnchor.constraint(equalTo: scroll.centerYAnchor),
            footer.topAnchor.constraint(equalTo: scroll.bottomAnchor, constant: 10),
            footer.leadingAnchor.constraint(equalTo: root.leadingAnchor, constant: 24),
            footer.bottomAnchor.constraint(equalTo: root.bottomAnchor, constant: -14),
        ])
        panel.handleKeyDown = { [weak self] event in self?.handleKey(event) ?? false }
        self.panel = panel
    }

    private func handleKey(_ event: NSEvent) -> Bool {
        if event.keyCode == UInt16(kVK_Escape) { dismiss(); return true }
        if event.keyCode == UInt16(kVK_Return) || event.keyCode == UInt16(kVK_ANSI_KeypadEnter) {
            openSelected(); return true
        }
        if event.keyCode == UInt16(kVK_UpArrow) || event.keyCode == UInt16(kVK_DownArrow) {
            guard !rows.isEmpty else { return true }
            let delta = event.keyCode == UInt16(kVK_UpArrow) ? -1 : 1
            let next = min(max(0, max(0, table.selectedRow) + delta), rows.count - 1)
            table.selectRowIndexes(IndexSet(integer: next), byExtendingSelection: false)
            table.scrollRowToVisible(next)
            return true
        }
        return false
    }

    @objc private func openSelected() {
        guard rows.indices.contains(table.selectedRow) else { return }
        let row = rows[table.selectedRow]
        dismiss()
        Task {
            do {
                let response = try await CoreClient.shared.call(method: "entity.go_to", params: [
                    "kind": row.kind, "entity_id": row.entityID,
                ])
                guard let destination = response["destination"] as? [String: Any],
                      (destination["type"] as? String) == "app",
                      let ui = destination["ui"] as? String else { return }
                _ = await ContentView.Coordinator.openApp(
                    ui: ui, query: destination["query"] as? [String: Any] ?? [:]
                )
            } catch { NSSound.beep() }
        }
    }

    func numberOfRows(in tableView: NSTableView) -> Int { rows.count }

    func tableView(_ tableView: NSTableView, viewFor tableColumn: NSTableColumn?, row: Int) -> NSView? {
        guard rows.indices.contains(row) else { return nil }
        let item = rows[row]
        let cell = NSTableCellView()
        let badge = NSTextField(labelWithString: item.kind.uppercased())
        badge.font = .monospacedSystemFont(ofSize: 10, weight: .bold)
        badge.textColor = .secondaryLabelColor
        let title = NSTextField(labelWithString: item.title)
        title.font = .systemFont(ofSize: 14, weight: .semibold)
        title.lineBreakMode = .byTruncatingTail
        let relation = NSTextField(labelWithString: "\(item.relationship) · \(item.direction)")
        relation.font = .systemFont(ofSize: 11)
        relation.textColor = .secondaryLabelColor
        let repo = NSTextField(labelWithString: item.repo)
        repo.font = .monospacedSystemFont(ofSize: 10, weight: .regular)
        repo.textColor = .tertiaryLabelColor
        [badge, title, relation, repo].forEach { $0.translatesAutoresizingMaskIntoConstraints = false; cell.addSubview($0) }
        NSLayoutConstraint.activate([
            badge.leadingAnchor.constraint(equalTo: cell.leadingAnchor, constant: 10),
            badge.topAnchor.constraint(equalTo: cell.topAnchor, constant: 8), badge.widthAnchor.constraint(equalToConstant: 88),
            title.leadingAnchor.constraint(equalTo: badge.trailingAnchor, constant: 6),
            title.trailingAnchor.constraint(equalTo: repo.leadingAnchor, constant: -8), title.topAnchor.constraint(equalTo: cell.topAnchor, constant: 6),
            relation.leadingAnchor.constraint(equalTo: title.leadingAnchor), relation.topAnchor.constraint(equalTo: title.bottomAnchor, constant: 4),
            repo.trailingAnchor.constraint(equalTo: cell.trailingAnchor, constant: -10), repo.centerYAnchor.constraint(equalTo: title.centerYAnchor),
        ])
        return cell
    }
}
