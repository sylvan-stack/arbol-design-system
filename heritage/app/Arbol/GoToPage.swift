import AppKit
import Carbon

struct GoToPageItem: Equatable {
    let id: String
    let ui: String
    let uiName: String
    let name: String
    let page: String

    static let all: [GoToPageItem] = [
        .init(id: "oaken.swimlanes", ui: "oaken", uiName: "Oaken", name: "Swimlanes", page: "swimlanes"),
        .init(id: "oaken.jira", ui: "oaken", uiName: "Oaken", name: "Jira", page: "jira"),
        .init(id: "oaken.grafts", ui: "oaken", uiName: "Oaken", name: "Grafts", page: "grafts"),
        .init(id: "oaken.merge-requests", ui: "oaken", uiName: "Oaken", name: "Merge Requests", page: "merge-requests"),
        .init(id: "elma.chat", ui: "elma", uiName: "Elma", name: "Chat", page: "chat"),
        .init(id: "elma.change-walkthrough", ui: "elma", uiName: "Elma", name: "Change Walkthrough", page: "change-walkthrough"),
        .init(id: "willo.stations", ui: "willo", uiName: "Willo", name: "Stations", page: "stations"),
        .init(id: "willo.agentic-stations", ui: "willo", uiName: "Willo", name: "Agentic Stations", page: "agentic-stations"),
        .init(id: "willo.stewards", ui: "willo", uiName: "Willo", name: "Stewards", page: "stewards"),
        .init(id: "willo.comunicados", ui: "willo", uiName: "Willo", name: "Comunicados", page: "comunicados"),
        .init(id: "willo.slack", ui: "willo", uiName: "Willo", name: "Slack", page: "slack"),
        .init(id: "willo.emails", ui: "willo", uiName: "Willo", name: "Emails", page: "emails"),
        .init(id: "willo.blueprint-runs", ui: "willo", uiName: "Willo", name: "Blueprint Runs", page: "runs"),
        .init(id: "seqoya.dashboard", ui: "seqoya", uiName: "Seqoya", name: "Dashboard", page: "dashboard"),
        .init(id: "seqoya.intelligence-providers", ui: "seqoya", uiName: "Seqoya", name: "Intelligence Providers", page: "intelligence-providers"),
        .init(id: "seqoya.brain-recipes", ui: "seqoya", uiName: "Seqoya", name: "Brain Recipes", page: "brain-recipes"),
        .init(id: "seqoya.quick-text", ui: "seqoya", uiName: "Seqoya", name: "Quick Text", page: "quick-text"),
        .init(id: "seqoya.feature-toggles", ui: "seqoya", uiName: "Seqoya", name: "Feature Toggles", page: "feature-toggles"),
        .init(id: "seqoya.living-topics", ui: "seqoya", uiName: "Seqoya", name: "Living Topics", page: "living-topics"),
        .init(id: "seqoya.stewardship", ui: "seqoya", uiName: "Seqoya", name: "Stewardship", page: "stewardship"),
        .init(id: "seqoya.blueprints", ui: "seqoya", uiName: "Seqoya", name: "Blueprints", page: "blueprints"),
        .init(id: "seqoya.reactions", ui: "seqoya", uiName: "Seqoya", name: "Reactions", page: "reactions"),
        .init(id: "seqoya.repos", ui: "seqoya", uiName: "Seqoya", name: "Repos", page: "repos"),
        .init(id: "seqoya.secrets", ui: "seqoya", uiName: "Seqoya", name: "Secrets", page: "secrets"),
        .init(id: "seqoya.chunks-viewer", ui: "seqoya", uiName: "Seqoya", name: "Chunks Viewer", page: "chunks-viewer"),
        .init(id: "seqoya.refresher", ui: "seqoya", uiName: "Seqoya", name: "Refresher", page: "refresher"),
        .init(id: "seqoya.artifacts", ui: "seqoya", uiName: "Seqoya", name: "Artifacts", page: "artifacts"),
        .init(id: "seqoya.retrieval", ui: "seqoya", uiName: "Seqoya", name: "Retrieval", page: "retrieval"),
        .init(id: "seqoya.monitoring", ui: "seqoya", uiName: "Seqoya", name: "Monitoring", page: "monitoring"),
    ]
}

enum GoToPageHistory {
    private static let key = "arbol-go-to-page-last-opened"

    static func snapshot(defaults: UserDefaults? = UserDefaults(suiteName: "group.arbol")) -> [String: TimeInterval] {
        guard let values = defaults?.dictionary(forKey: key) else { return [:] }
        return values.reduce(into: [:]) { result, entry in
            if let number = entry.value as? NSNumber { result[entry.key] = number.doubleValue }
        }
    }

    static func record(ui: String, page: String, at timestamp: TimeInterval = Date().timeIntervalSince1970,
                       defaults: UserDefaults? = UserDefaults(suiteName: "group.arbol")) {
        guard let item = GoToPageItem.all.first(where: { $0.ui == ui && $0.page == page }), let defaults else { return }
        var values = snapshot(defaults: defaults)
        values[item.id] = timestamp
        defaults.set(values, forKey: key)
    }

    static func results(query: String, history: [String: TimeInterval]) -> [GoToPageItem] {
        let query = normalized(query)
        return GoToPageItem.all
            .filter { query.isEmpty || fuzzyMatch(query, in: normalized("\($0.name) \($0.uiName)")) }
            .sorted {
                let lhs = history[$0.id] ?? 0
                let rhs = history[$1.id] ?? 0
                if lhs != rhs { return lhs > rhs }
                if $0.name != $1.name { return $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
                return $0.uiName.localizedCaseInsensitiveCompare($1.uiName) == .orderedAscending
            }
    }

    static func fuzzyMatch(_ needle: String, in haystack: String) -> Bool {
        var index = needle.startIndex
        for character in haystack where index < needle.endIndex {
            if character == needle[index] { index = needle.index(after: index) }
        }
        return index == needle.endIndex
    }

    private static func normalized(_ value: String) -> String {
        value.folding(options: [.caseInsensitive, .diacriticInsensitive], locale: .current)
            .filter { !$0.isWhitespace && !$0.isPunctuation }
    }
}

final class GoToPageHotkeyController: NSObject {
    private var keyMonitor: Any?
    private lazy var popup = GoToPageController()

    func installIfAvailable() {
        guard keyMonitor == nil else { return }
        // Cmd+G belongs to the currently active Arbol UI. Keeping this local
        // avoids activating the arbitrary process that happened to acquire a
        // global-hotkey lock and therefore avoids revealing another UI shell.
        keyMonitor = NSEvent.addLocalMonitorForEvents(matching: .keyDown) { [weak self] event in
            guard Self.shouldHandle(event: event, hasVisibleWindow: NSApp.windows.contains(where: \.isVisible)) else {
                return event
            }
            self?.popup.toggle()
            return nil
        }
    }

    static func shouldHandle(event: NSEvent, hasVisibleWindow: Bool) -> Bool {
        guard hasVisibleWindow, event.keyCode == UInt16(kVK_ANSI_G) else { return false }
        return event.modifierFlags.intersection(.deviceIndependentFlagsMask) == [.command]
    }

    deinit {
        if let keyMonitor { NSEvent.removeMonitor(keyMonitor) }
    }
}

final class GoToPagePanel: NSPanel {
    var handleKeyDown: ((NSEvent) -> Bool)?
    override var canBecomeKey: Bool { true }
    override var canBecomeMain: Bool { false }
    override func sendEvent(_ event: NSEvent) {
        if event.type == .keyDown, handleKeyDown?(event) == true { return }
        super.sendEvent(event)
    }
}

final class GoToPageController: NSObject, NSSearchFieldDelegate, NSTableViewDataSource, NSTableViewDelegate {
    private var panel: GoToPagePanel?
    private let searchField = NSSearchField()
    private let table = NSTableView()
    private let footer = NSTextField(labelWithString: "↑/↓ select · Enter open · 0–9 open immediately · Esc close")
    private var rows: [GoToPageItem] = []
    private var localOutsideClickMonitor: Any?
    private var globalOutsideClickMonitor: Any?
    private var appDeactivateObserver: NSObjectProtocol?

    func toggle() { panel?.isVisible == true ? dismiss() : show() }

    private var emailsEnabled = false

    private func show() {
        emailsEnabled = false
        Task { @MainActor [weak self] in
            let enabled = await WebMailBridge.emailsFeatureEnabled()
            self?.emailsEnabled = enabled
            self?.refresh()
        }
        if panel == nil { buildPanel() }
        searchField.stringValue = ""
        refresh()
        panel?.center()
        // Cmd+G is process-local and can only arrive while this Arbol UI is
        // active, so showing the popup must not activate or reveal any UI shell.
        panel?.makeKeyAndOrderFront(nil)
        panel?.makeFirstResponder(searchField)
        installOutsideClickDismissal()
    }

    private func dismiss() {
        guard panel?.isVisible == true else { return }
        panel?.orderOut(nil)
        removeOutsideClickDismissal()
    }

    private func installOutsideClickDismissal() {
        removeOutsideClickDismissal()
        let mouseDownMask: NSEvent.EventTypeMask = [.leftMouseDown, .rightMouseDown, .otherMouseDown]

        // Preserve clicks inside the popup. A click in another window owned by
        // this Arbol process dismisses the popup without consuming that click.
        localOutsideClickMonitor = NSEvent.addLocalMonitorForEvents(matching: mouseDownMask) { [weak self] event in
            guard let self else { return event }
            if event.window !== self.panel {
                DispatchQueue.main.async { [weak self] in self?.dismiss() }
            }
            return event
        }

        // Clicks delivered to another app are not visible to a local monitor.
        // Global monitors are passive, so the original click still reaches its
        // destination while the popup closes.
        globalOutsideClickMonitor = NSEvent.addGlobalMonitorForEvents(matching: mouseDownMask) { [weak self] _ in
            DispatchQueue.main.async { [weak self] in self?.dismiss() }
        }

        appDeactivateObserver = NotificationCenter.default.addObserver(
            forName: NSApplication.didResignActiveNotification,
            object: NSApp,
            queue: .main
        ) { [weak self] _ in
            self?.dismiss()
        }
    }

    private func removeOutsideClickDismissal() {
        if let localOutsideClickMonitor {
            NSEvent.removeMonitor(localOutsideClickMonitor)
            self.localOutsideClickMonitor = nil
        }
        if let globalOutsideClickMonitor {
            NSEvent.removeMonitor(globalOutsideClickMonitor)
            self.globalOutsideClickMonitor = nil
        }
        if let appDeactivateObserver {
            NotificationCenter.default.removeObserver(appDeactivateObserver)
            self.appDeactivateObserver = nil
        }
    }

    private func buildPanel() {
        let panel = GoToPagePanel(contentRect: NSRect(x: 0, y: 0, width: 620, height: 520),
                                  styleMask: [.titled, .fullSizeContentView, .nonactivatingPanel], backing: .buffered, defer: false)
        panel.title = "Go To Page"
        panel.titleVisibility = .hidden
        panel.titlebarAppearsTransparent = true
        panel.isFloatingPanel = true
        panel.level = .floating
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
        panel.hidesOnDeactivate = false
        panel.backgroundColor = .windowBackgroundColor

        let root = NSView()
        root.translatesAutoresizingMaskIntoConstraints = false
        panel.contentView = root

        let title = NSTextField(labelWithString: "Go To Page")
        title.font = .systemFont(ofSize: 20, weight: .semibold)
        title.translatesAutoresizingMaskIntoConstraints = false
        searchField.placeholderString = "Fuzzy search every page…"
        searchField.controlSize = .large
        searchField.delegate = self
        searchField.translatesAutoresizingMaskIntoConstraints = false

        let scroll = NSScrollView()
        scroll.hasVerticalScroller = true
        scroll.drawsBackground = false
        scroll.translatesAutoresizingMaskIntoConstraints = false
        let column = NSTableColumn(identifier: NSUserInterfaceItemIdentifier("page"))
        column.resizingMask = .autoresizingMask
        table.addTableColumn(column)
        table.headerView = nil
        table.rowHeight = 42
        table.intercellSpacing = NSSize(width: 0, height: 2)
        table.backgroundColor = .clear
        table.delegate = self
        table.dataSource = self
        table.target = self
        table.doubleAction = #selector(openSelected)
        scroll.documentView = table
        footer.textColor = .secondaryLabelColor
        footer.font = .systemFont(ofSize: 11)
        footer.translatesAutoresizingMaskIntoConstraints = false

        [title, searchField, scroll, footer].forEach(root.addSubview)
        NSLayoutConstraint.activate([
            title.topAnchor.constraint(equalTo: root.topAnchor, constant: 28),
            title.leadingAnchor.constraint(equalTo: root.leadingAnchor, constant: 24),
            searchField.topAnchor.constraint(equalTo: title.bottomAnchor, constant: 14),
            searchField.leadingAnchor.constraint(equalTo: root.leadingAnchor, constant: 20),
            searchField.trailingAnchor.constraint(equalTo: root.trailingAnchor, constant: -20),
            scroll.topAnchor.constraint(equalTo: searchField.bottomAnchor, constant: 12),
            scroll.leadingAnchor.constraint(equalTo: root.leadingAnchor, constant: 14),
            scroll.trailingAnchor.constraint(equalTo: root.trailingAnchor, constant: -14),
            footer.topAnchor.constraint(equalTo: scroll.bottomAnchor, constant: 10),
            footer.leadingAnchor.constraint(equalTo: root.leadingAnchor, constant: 24),
            footer.bottomAnchor.constraint(equalTo: root.bottomAnchor, constant: -14),
        ])
        panel.handleKeyDown = { [weak self] event in self?.handleKey(event) ?? false }
        self.panel = panel
    }

    func controlTextDidChange(_ obj: Notification) { refresh() }

    private func refresh() {
        rows = GoToPageHistory.results(query: searchField.stringValue, history: GoToPageHistory.snapshot())
            .filter { $0.id != "willo.emails" || emailsEnabled }
        table.reloadData()
        if !rows.isEmpty { table.selectRowIndexes(IndexSet(integer: 0), byExtendingSelection: false) }
    }

    private func handleKey(_ event: NSEvent) -> Bool {
        if event.keyCode == UInt16(kVK_Escape) { dismiss(); return true }
        if event.keyCode == UInt16(kVK_Return) || event.keyCode == UInt16(kVK_ANSI_KeypadEnter) { openSelected(); return true }
        if event.keyCode == UInt16(kVK_UpArrow) || event.keyCode == UInt16(kVK_DownArrow) {
            let delta = event.keyCode == UInt16(kVK_UpArrow) ? -1 : 1
            let current = max(0, table.selectedRow)
            let next = min(max(0, current + delta), max(0, rows.count - 1))
            table.selectRowIndexes(IndexSet(integer: next), byExtendingSelection: false)
            table.scrollRowToVisible(next)
            return true
        }
        if event.modifierFlags.intersection([.command, .control, .option]).isEmpty,
           let digit = event.charactersIgnoringModifiers?.first?.wholeNumberValue,
           rows.indices.contains(digit) {
            open(rows[digit])
            return true
        }
        return false
    }

    @objc private func openSelected() {
        guard rows.indices.contains(table.selectedRow) else { return }
        open(rows[table.selectedRow])
    }

    private func open(_ item: GoToPageItem) {
        GoToPageHistory.record(ui: item.ui, page: item.page)
        dismiss()
        Task { @MainActor in _ = await ContentView.Coordinator.openApp(ui: item.ui, query: ["page": item.page]) }
    }

    deinit {
        removeOutsideClickDismissal()
    }

    func numberOfRows(in tableView: NSTableView) -> Int { rows.count }

    func tableView(_ tableView: NSTableView, viewFor tableColumn: NSTableColumn?, row: Int) -> NSView? {
        guard rows.indices.contains(row) else { return nil }
        let item = rows[row]
        let cell = NSTableCellView()
        let number = NSTextField(labelWithString: row < 10 ? String(row) : "")
        number.alignment = .center
        number.font = .monospacedDigitSystemFont(ofSize: 13, weight: .semibold)
        number.textColor = row < 10 ? .secondaryLabelColor : .clear
        number.wantsLayer = true
        number.layer?.cornerRadius = 5
        number.layer?.backgroundColor = NSColor.controlBackgroundColor.cgColor
        let name = NSTextField(labelWithString: item.name)
        name.font = .systemFont(ofSize: 14, weight: .medium)
        let ui = NSTextField(labelWithString: item.uiName)
        ui.font = .systemFont(ofSize: 12)
        ui.textColor = .secondaryLabelColor
        [number, name, ui].forEach { $0.translatesAutoresizingMaskIntoConstraints = false; cell.addSubview($0) }
        NSLayoutConstraint.activate([
            number.leadingAnchor.constraint(equalTo: cell.leadingAnchor, constant: 8), number.centerYAnchor.constraint(equalTo: cell.centerYAnchor),
            number.widthAnchor.constraint(equalToConstant: 25), number.heightAnchor.constraint(equalToConstant: 24),
            name.leadingAnchor.constraint(equalTo: number.trailingAnchor, constant: 12), name.centerYAnchor.constraint(equalTo: cell.centerYAnchor),
            ui.trailingAnchor.constraint(equalTo: cell.trailingAnchor, constant: -12), ui.centerYAnchor.constraint(equalTo: cell.centerYAnchor),
            name.trailingAnchor.constraint(lessThanOrEqualTo: ui.leadingAnchor, constant: -12),
        ])
        return cell
    }
}
