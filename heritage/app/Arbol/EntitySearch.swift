import AppKit
import Carbon
import ApplicationServices

struct EntitySearchResult {
    let entityID: String
    let uri: String
    let repo: String
    let kind: String
    let kindTag: String
    let title: String
    let filePath: String?
    let displayPath: String?

    init?(_ value: [String: Any]) {
        guard let entityID = value["entity_id"] as? String,
              let uri = value["uri"] as? String,
              let repo = value["repo_name"] as? String,
              let kind = value["kind"] as? String,
              let title = value["title"] as? String else { return nil }
        self.entityID = entityID
        self.uri = uri
        self.repo = repo
        self.kind = kind
        self.kindTag = (value["kind_tag"] as? String) ?? String(kind.prefix(3))
        self.title = title
        self.filePath = value["file_path"] as? String
        self.displayPath = value["display_path"] as? String
    }

    var cacheValue: [String: Any] {
        var value: [String: Any] = [
            "entity_id": entityID, "uri": uri, "repo_name": repo,
            "kind": kind, "kind_tag": kindTag, "title": title,
        ]
        if let filePath { value["file_path"] = filePath }
        if let displayPath { value["display_path"] = displayPath }
        return value
    }
}

/// A small stale-while-revalidate cache makes the popup useful on its first
/// frame instead of making every invocation wait for Core and PostgreSQL. Core
/// remains authoritative: every cache hit is refreshed immediately, and the
/// replacement is persisted atomically for the next UI process/launch.
final class EntitySearchResultCache {
    private let fileURL: URL
    private let maximumQueries: Int
    private var values: [String: [EntitySearchResult]] = [:]
    private var order: [String] = []

    init(fileURL: URL? = nil, maximumQueries: Int = 40) {
        let directory = FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent("Library/Application Support/Arbol", isDirectory: true)
        self.fileURL = fileURL ?? directory.appendingPathComponent("entity-search-cache.json")
        self.maximumQueries = maximumQueries
        load()
    }

    func results(for query: String) -> [EntitySearchResult]? {
        let key = Self.key(query)
        guard let result = values[key] else { return nil }
        touch(key)
        return result
    }

    func store(_ results: [EntitySearchResult], for query: String) {
        let key = Self.key(query)
        // Telegram visibility and VIP order must be read from Core on every open.
        values[key] = results.filter { !["telegram", "telegram_conversation"].contains($0.kind) }
        touch(key)
        while order.count > maximumQueries {
            values.removeValue(forKey: order.removeFirst())
        }
        persist()
    }

    private static func key(_ query: String) -> String {
        query.trimmingCharacters(in: .whitespacesAndNewlines).folding(options: [.caseInsensitive, .diacriticInsensitive], locale: .current)
    }

    private func touch(_ key: String) {
        order.removeAll { $0 == key }
        order.append(key)
    }

    private func load() {
        guard let data = try? Data(contentsOf: fileURL),
              let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let storedOrder = object["order"] as? [String],
              let queries = object["queries"] as? [String: Any] else { return }
        for key in storedOrder.suffix(maximumQueries) {
            guard let rows = queries[key] as? [[String: Any]] else { continue }
            values[key] = rows.compactMap(EntitySearchResult.init).filter { !["telegram", "telegram_conversation"].contains($0.kind) }
            order.append(key)
        }
    }

    private func persist() {
        let queries = Dictionary(uniqueKeysWithValues: order.compactMap { key in
            values[key].map { (key, $0.map(\.cacheValue)) }
        })
        guard JSONSerialization.isValidJSONObject(["order": order, "queries": queries]),
              let data = try? JSONSerialization.data(
                withJSONObject: ["order": order, "queries": queries], options: [.sortedKeys]
              ) else { return }
        do {
            try FileManager.default.createDirectory(
                at: fileURL.deletingLastPathComponent(), withIntermediateDirectories: true
            )
            try data.write(to: fileURL, options: .atomic)
        } catch {
            // Cache persistence is best-effort and must never make search fail.
        }
    }
}

struct EntityLinkEndpoint {
    let entityID: String
    let uri: String
    let repo: String
    let kind: String
    let title: String

    init?(_ result: EntitySearchResult) {
        self.entityID = result.entityID
        self.uri = result.uri
        self.repo = result.repo
        self.kind = result.kind
        self.title = result.title
    }

    init?(value: [String: Any]) {
        guard let entityID = value["entity_id"] as? String,
              let repo = value["repo"] as? String,
              let kind = value["kind"] as? String,
              let title = value["title"] as? String,
              !entityID.isEmpty, !repo.isEmpty, !kind.isEmpty, !title.isEmpty else { return nil }
        self.entityID = entityID
        self.repo = repo
        self.kind = kind
        self.title = title
        self.uri = (value["uri"] as? String) ?? ""
    }

    init?(uri: String) {
        guard uri.first == "[", uri.last == "]" else { return nil }
        let parts = String(uri.dropFirst().dropLast()).split(separator: ":", omittingEmptySubsequences: false).map(String.init)
        let decoded: (String, String, String, String)
        if parts.count == 4 {
            decoded = (parts[0], parts[1], parts[2], parts[3])
        } else if parts.count == 3 {
            decoded = ("any", parts[0], parts[1], parts[2])
        } else { return nil }
        let (repoTag, kindTag, entityID, title64) = decoded
        let repos = [
            "arb": "Arbol", "myc": "Mycel", "uni": "Universe", "inf": "Infer",
            "blue": "Blueprint", "any": "Any",
        ]
        let kinds = [
            "tic": "ticket", "grf": "graft", "mr": "mr", "cmt": "commit",
            "slk": "slack", "tel": "telegram", "tlc": "telegram_conversation", "eml": "email", "cnf": "confluence", "com": "comunicado",
            "cht": "chat", "arf": "artifact", "req": "requirement", "inv": "invariant",
            "glo": "glossary", "sec": "secret", "fly": "flyer", "brn": "branch",
            "liv": "living_topic", "mnd": "mandate", "pmt": "prompt", "rsp": "response",
        ]
        guard let repo = repos[repoTag], let kind = kinds[kindTag], !entityID.isEmpty,
              let data = Data(base64Encoded: title64),
              let title = String(data: data, encoding: .utf8), !title.isEmpty else { return nil }
        self.entityID = entityID
        self.uri = uri
        self.repo = repo
        self.kind = kind
        self.title = title
    }

    var rpcValue: [String: Any] {
        ["entity_id": entityID, "repo": repo, "kind": kind, "uri": uri]
    }
}

struct EntityRelationshipTypeOption {
    let name: String
    let section: String
    let direction: String

    init?(_ value: [String: Any]) {
        guard let name = value["name"] as? String,
              let section = value["section"] as? String,
              let direction = value["direction"] as? String else { return nil }
        self.name = name
        self.section = section
        self.direction = direction
    }
}

struct EntityRelationshipSelection {
    let name: String
    let direction: String?
}

// MARK: - Global Cmd+E

final class EntitySearchHotkeyController: NSObject {
    private var hotKeyRef: EventHotKeyRef?
    private var eventHandlerRef: EventHandlerRef?
    private var retryTimer: Timer?
    private var lockFD: Int32 = -1
    private lazy var popup = EntitySearchController()

    func showForRelationship(source: EntityLinkEndpoint) {
        popup.showForSelection(
            subtitle: "Link another Entity to “\(source.title)”",
            actionLabel: "choose Entity",
            excluding: source
        ) { [weak self] result in
            guard let target = EntityLinkEndpoint(result) else { return }
            await MainActor.run {
                self?.popup.showRelationshipTypes(source: source, target: target)
            }
        }
    }

    func showForEntityLink(
        swimmerTitle: String,
        onSelect: @escaping (EntitySearchResult) async throws -> Void
    ) {
        popup.showForSelection(
            subtitle: "Link to “\(swimmerTitle)” · All repositories",
            actionLabel: "link to Swimmer",
            onSelect: onSelect
        )
    }

    func showForLivingTopicLink(
        topicTitle: String,
        onSelect: @escaping (EntitySearchResult) async throws -> Void
    ) {
        popup.showForSelection(
            subtitle: "Link to Living Topic “\(topicTitle)” · All repositories",
            actionLabel: "link Entity",
            onSelect: onSelect
        )
    }

    func showForNewSwimlanePick(
        onSelect: @escaping (EntitySearchResult) async throws -> Void
    ) {
        popup.showForSelection(
            subtitle: "Add Entity to the new Swimlane · All repositories",
            actionLabel: "add Entity",
            onSelect: onSelect
        )
    }

    func installIfAvailable() {
        guard hotKeyRef == nil else { retryTimer?.invalidate(); retryTimer = nil; return }
        guard acquireLock() else { scheduleRetry(); return }
        registerHotkey()
    }

    private func acquireLock() -> Bool {
        if lockFD >= 0 { return true }
        let dir = FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent("Library/Application Support/Arbol")
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        let fd = open(dir.appendingPathComponent("entity-search-hotkey.lock").path, O_CREAT | O_RDWR, 0o644)
        guard fd >= 0 else { return true }
        if flock(fd, LOCK_EX | LOCK_NB) != 0 { close(fd); return false }
        lockFD = fd
        return true
    }

    private func scheduleRetry() {
        guard retryTimer == nil else { return }
        retryTimer = Timer.scheduledTimer(withTimeInterval: 5, repeats: true) { [weak self] _ in
            self?.installIfAvailable()
        }
        retryTimer?.tolerance = 1
    }

    private func registerHotkey() {
        var type = EventTypeSpec(eventClass: OSType(kEventClassKeyboard), eventKind: UInt32(kEventHotKeyPressed))
        let pointer = Unmanaged.passUnretained(self).toOpaque()
        let callback: EventHandlerUPP = { _, event, userData in
            guard let event, let userData else { return OSStatus(eventNotHandledErr) }
            var identifier = EventHotKeyID()
            let status = GetEventParameter(
                event, EventParamName(kEventParamDirectObject), EventParamType(typeEventHotKeyID),
                nil, MemoryLayout<EventHotKeyID>.size, nil, &identifier
            )
            guard status == noErr, identifier.signature == EntitySearchHotkeyController.fourCharCode("ENTS") else {
                return OSStatus(eventNotHandledErr)
            }
            let owner = Unmanaged<EntitySearchHotkeyController>.fromOpaque(userData).takeUnretainedValue()
            DispatchQueue.main.async { owner.popup.toggle() }
            return noErr
        }
        guard InstallEventHandler(GetApplicationEventTarget(), callback, 1, &type, pointer, &eventHandlerRef) == noErr else {
            scheduleRetry(); return
        }
        let id = EventHotKeyID(signature: Self.fourCharCode("ENTS"), id: 1)
        if RegisterEventHotKey(UInt32(kVK_ANSI_E), UInt32(cmdKey), id, GetApplicationEventTarget(), 0, &hotKeyRef) == noErr {
            retryTimer?.invalidate(); retryTimer = nil
        } else {
            if let eventHandlerRef { RemoveEventHandler(eventHandlerRef); self.eventHandlerRef = nil }
            if lockFD >= 0 { close(lockFD); lockFD = -1 }
            scheduleRetry()
        }
    }

    private static func fourCharCode(_ string: String) -> OSType {
        string.unicodeScalars.prefix(4).reduce(0) { ($0 << 8) + OSType($1.value) }
    }

    deinit {
        if let hotKeyRef { UnregisterEventHotKey(hotKeyRef) }
        if let eventHandlerRef { RemoveEventHandler(eventHandlerRef) }
        if lockFD >= 0 { close(lockFD) }
    }
}

final class EntitySearchPanel: NSPanel {
    var handleKeyDown: ((NSEvent) -> Bool)?

    override var canBecomeKey: Bool { true }
    override var canBecomeMain: Bool { false }

    override func sendEvent(_ event: NSEvent) {
        if event.type == .keyDown, handleKeyDown?(event) == true { return }
        super.sendEvent(event)
    }
}

final class EntitySearchController: NSObject, NSSearchFieldDelegate, NSTableViewDataSource, NSTableViewDelegate {
    private var panel: EntitySearchPanel?
    private let searchField = NSSearchField()
    private let table = NSTableView()
    private let statusLabel = NSTextField(labelWithString: "")
    private let subtitleLabel = NSTextField(labelWithString: "All repositories · URI, title, or file path")
    private let filterHintLabel = NSTextField(labelWithString: "Filter by type · tel: Telegram · slk: Slack · arf: Artifacts · grf: Grafts · tic: Tickets · cht: Chats")
    private let footerLabel = NSTextField(labelWithString: "↑/↓ select · Enter paste or copy URI · ⇧Enter copy URI · ⌘Enter open · Esc close")
    private var rows: [EntitySearchResult] = []
    private var generation = 0
    private var searchTask: Task<Void, Never>?
    private var selectionTask: Task<Void, Never>?
    private var selectionAction: ((EntitySearchResult) async throws -> Void)?
    private var performingSelection = false
    private var excludedEntity: EntityLinkEndpoint?
    private var keyMonitor: Any?
    private var relationshipDialog: EntityRelationshipTypeDialogController?
    private let resultCache = EntitySearchResultCache()

    /// The application and editable accessibility element that owned focus when
    /// Entity Search was invoked. The floating panel temporarily becomes key,
    /// so this context must be captured before presenting it.
    private struct InvocationTarget {
        let application: NSRunningApplication
        let editableElement: AXUIElement?
        let isElma: Bool

        var acceptsEntity: Bool { isElma || editableElement != nil }
    }
    private var invocationTarget: InvocationTarget?

    func toggle() {
        if panel?.isVisible == true { dismiss() } else { show() }
    }

    func show() {
        present(
            subtitle: "All repositories · URI, title, or file path",
            footer: "↑/↓ select · Enter paste or copy URI · ⇧Enter copy URI · ⌘Enter open · Esc close",
            selectionAction: nil,
            excludedEntity: nil
        )
    }

    func showForSelection(
        subtitle: String,
        actionLabel: String,
        excluding excludedEntity: EntityLinkEndpoint? = nil,
        onSelect: @escaping (EntitySearchResult) async throws -> Void
    ) {
        present(
            subtitle: subtitle,
            footer: "↑/↓ select · Enter \(actionLabel) · Esc close",
            selectionAction: onSelect,
            excludedEntity: excludedEntity
        )
    }

    func showRelationshipTypes(source: EntityLinkEndpoint, target: EntityLinkEndpoint) {
        generation += 1
        searchTask?.cancel()
        selectionTask?.cancel()
        removeKeyMonitor()
        panel?.orderOut(nil)
        selectionAction = nil
        performingSelection = false
        Task { [weak self] in
            do {
                let response = try await CoreClient.shared.call(
                    method: "entity.relationship_types",
                    params: ["source_kind": source.kind, "target_kind": target.kind]
                )
                let options = (response["relationship_types"] as? [[String: Any]] ?? [])
                    .compactMap(EntityRelationshipTypeOption.init)
                guard !Task.isCancelled else { return }
                await MainActor.run { [weak self] in
                    self?.presentRelationshipTypeDialog(source: source, target: target, options: options)
                }
            } catch {
                await MainActor.run { [weak self] in
                    self?.showOpenNotification(
                        entity: EntitySearchResult([
                            "entity_id": target.entityID, "uri": target.uri,
                            "repo_name": target.repo, "kind": target.kind,
                            "title": target.title,
                        ])!,
                        reason: error.localizedDescription,
                        subtitle: "Couldn’t load relationship types"
                    )
                }
            }
        }
    }

    private func presentRelationshipTypeDialog(
        source: EntityLinkEndpoint, target: EntityLinkEndpoint,
        options: [EntityRelationshipTypeOption]
    ) {
        let dialog = EntityRelationshipTypeDialogController(
            source: source, target: target, options: options
        ) { [weak self] selections in
            guard let self else { return }
            try await self.createRelationships(source: source, target: target, selections: selections)
        }
        relationshipDialog = dialog
        dialog.show { [weak self] in self?.relationshipDialog = nil }
    }

    private func createRelationships(
        source: EntityLinkEndpoint, target: EntityLinkEndpoint,
        selections: [EntityRelationshipSelection]
    ) async throws {
        let values: [[String: Any]] = selections.map { selection in
            var value: [String: Any] = ["name": selection.name]
            if let direction = selection.direction { value["direction"] = direction }
            return value
        }
        _ = try await CoreClient.shared.call(method: "entity.link", params: [
            "source": source.rpcValue,
            "target": target.rpcValue,
            "relationship_types": values,
        ])
        _ = try? await CoreClient.shared.call(method: "entity.record_access", params: [
            "repo": source.repo, "kind": source.kind,
            "entity_id": source.entityID, "access_kind": "link_entity",
        ])
        _ = try? await CoreClient.shared.call(method: "entity.record_access", params: [
            "repo": target.repo, "kind": target.kind,
            "entity_id": target.entityID, "access_kind": "link_entity",
        ])
    }

    private func present(
        subtitle: String, footer: String,
        selectionAction: ((EntitySearchResult) async throws -> Void)?,
        excludedEntity: EntityLinkEndpoint? = nil
    ) {
        let panel = ensurePanel()
        invocationTarget = selectionAction == nil ? captureInvocationTarget() : nil
        searchTask?.cancel()
        selectionTask?.cancel()
        self.selectionAction = selectionAction
        self.excludedEntity = excludedEntity
        performingSelection = false
        searchField.isEnabled = true
        table.isEnabled = true
        subtitleLabel.stringValue = subtitle
        footerLabel.stringValue = footer
        searchField.stringValue = ""
        if let cached = cachedResults(for: "") {
            rows = cached
            table.reloadData()
            statusLabel.stringValue = "No entities cataloged yet"
            statusLabel.isHidden = !cached.isEmpty
            if !cached.isEmpty {
                table.selectRowIndexes(IndexSet(integer: 0), byExtendingSelection: false)
            }
        } else {
            rows = []
            table.reloadData()
            statusLabel.stringValue = "Loading recent entities…"
            statusLabel.isHidden = false
        }
        position(panel)
        // Cmd+E is Arbol-wide, and whichever UI acquired the singleton hotkey
        // lock owns this panel. Keep it non-activating so a background owner
        // (for example Oaken) does not become the foreground UI merely because
        // it happened to register the shortcut first. The panel can still
        // become key and accept search input independently of all main UIs.
        panel.orderFrontRegardless()
        panel.makeKey()
        panel.makeFirstResponder(searchField)
        installKeyMonitor()
        runSearch("")
    }

    private func dismiss() {
        generation += 1
        searchTask?.cancel()
        searchTask = nil
        selectionTask?.cancel()
        selectionTask = nil
        selectionAction = nil
        performingSelection = false
        removeKeyMonitor()
        panel?.orderOut(nil)
    }

    /// The field editor can consume Return before an NSSearchField delegate sees
    /// it. Monitor keyboard events at the application boundary and consume the
    /// palette commands before AppKit dispatches them to that field editor.
    private func installKeyMonitor() {
        removeKeyMonitor()
        keyMonitor = NSEvent.addLocalMonitorForEvents(matching: .keyDown) { [weak self] event in
            guard let self, self.panel?.isVisible == true else { return event }
            return self.handleKeyDown(event) ? nil : event
        }
    }

    private func removeKeyMonitor() {
        if let keyMonitor {
            NSEvent.removeMonitor(keyMonitor)
            self.keyMonitor = nil
        }
    }

    private func handleKeyDown(_ event: NSEvent) -> Bool {
        guard panel?.isVisible == true else { return false }
        switch event.keyCode {
        case UInt16(kVK_Escape):
            if !performingSelection { dismiss() }
            return true
        case UInt16(kVK_UpArrow): moveSelection(by: -1); return true
        case UInt16(kVK_DownArrow): moveSelection(by: 1); return true
        case UInt16(kVK_Return), UInt16(kVK_ANSI_KeypadEnter):
            if selectionAction != nil {
                performSelectionAction()
            } else {
                let modifiers = event.modifierFlags.intersection(.deviceIndependentFlagsMask)
                if modifiers.contains(.command) {
                    openSelected()
                } else if modifiers.contains(.shift) {
                    copySelected()
                } else {
                    useSelectedEntity()
                }
            }
            return true
        default: return false
        }
    }

    private func moveSelection(by delta: Int) {
        guard !rows.isEmpty else { return }
        let current = table.selectedRow >= 0 ? table.selectedRow : (delta > 0 ? -1 : 0)
        let next = min(max(0, current + delta), rows.count - 1)
        table.selectRowIndexes(IndexSet(integer: next), byExtendingSelection: false)
        table.scrollRowToVisible(next)
    }

    private func ensurePanel() -> EntitySearchPanel {
        if let panel { return panel }
        let panel = EntitySearchPanel(
            contentRect: NSRect(x: 0, y: 0, width: 720, height: 590),
            styleMask: [.titled, .closable, .nonactivatingPanel, .fullSizeContentView],
            backing: .buffered, defer: false
        )
        panel.titleVisibility = .hidden
        panel.titlebarAppearsTransparent = true
        panel.level = .floating
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .transient]
        panel.isReleasedWhenClosed = false
        panel.standardWindowButton(.closeButton)?.isHidden = true
        panel.standardWindowButton(.miniaturizeButton)?.isHidden = true
        panel.standardWindowButton(.zoomButton)?.isHidden = true
        panel.ignoresMouseEvents = true
        // This remains as a fallback for key events sent directly to the panel;
        // the local monitor is the primary path for field-editor Return events.
        panel.handleKeyDown = { [weak self] event in self?.handleKeyDown(event) ?? false }

        let root = NSView()
        root.wantsLayer = true
        root.layer?.backgroundColor = NSColor.windowBackgroundColor.cgColor
        panel.contentView = root

        let title = NSTextField(labelWithString: "Entity Search")
        title.font = .systemFont(ofSize: 20, weight: .semibold)
        subtitleLabel.font = .monospacedSystemFont(ofSize: 11, weight: .medium)
        subtitleLabel.textColor = .secondaryLabelColor
        searchField.placeholderString = "Search all entities"
        searchField.font = .systemFont(ofSize: 15)
        filterHintLabel.font = .monospacedSystemFont(ofSize: 10.5, weight: .medium)
        filterHintLabel.textColor = .tertiaryLabelColor
        filterHintLabel.lineBreakMode = .byTruncatingTail
        searchField.delegate = self
        searchField.target = nil
        searchField.action = nil

        let column = NSTableColumn(identifier: NSUserInterfaceItemIdentifier("entity"))
        column.resizingMask = .autoresizingMask
        table.addTableColumn(column)
        table.headerView = nil
        table.rowHeight = 54
        table.intercellSpacing = NSSize(width: 0, height: 2)
        table.backgroundColor = .clear
        table.delegate = self
        table.dataSource = self
        let scroll = NSScrollView()
        scroll.documentView = table
        scroll.hasVerticalScroller = true
        scroll.drawsBackground = false

        statusLabel.font = .systemFont(ofSize: 13, weight: .medium)
        statusLabel.textColor = .secondaryLabelColor
        statusLabel.alignment = .center
        statusLabel.lineBreakMode = .byTruncatingTail

        footerLabel.font = .monospacedSystemFont(ofSize: 10.5, weight: .medium)
        footerLabel.textColor = .tertiaryLabelColor

        [title, subtitleLabel, searchField, filterHintLabel, scroll, statusLabel, footerLabel].forEach {
            $0.translatesAutoresizingMaskIntoConstraints = false; root.addSubview($0)
        }
        NSLayoutConstraint.activate([
            title.topAnchor.constraint(equalTo: root.topAnchor, constant: 34),
            title.leadingAnchor.constraint(equalTo: root.leadingAnchor, constant: 22),
            subtitleLabel.centerYAnchor.constraint(equalTo: title.centerYAnchor),
            subtitleLabel.trailingAnchor.constraint(equalTo: root.trailingAnchor, constant: -22),
            searchField.topAnchor.constraint(equalTo: title.bottomAnchor, constant: 14),
            searchField.leadingAnchor.constraint(equalTo: root.leadingAnchor, constant: 20),
            searchField.trailingAnchor.constraint(equalTo: root.trailingAnchor, constant: -20),
            filterHintLabel.topAnchor.constraint(equalTo: searchField.bottomAnchor, constant: 7),
            filterHintLabel.leadingAnchor.constraint(equalTo: searchField.leadingAnchor, constant: 2),
            filterHintLabel.trailingAnchor.constraint(equalTo: searchField.trailingAnchor, constant: -2),
            scroll.topAnchor.constraint(equalTo: filterHintLabel.bottomAnchor, constant: 10),
            scroll.leadingAnchor.constraint(equalTo: root.leadingAnchor, constant: 14),
            scroll.trailingAnchor.constraint(equalTo: root.trailingAnchor, constant: -14),
            scroll.bottomAnchor.constraint(equalTo: footerLabel.topAnchor, constant: -8),
            statusLabel.centerXAnchor.constraint(equalTo: scroll.centerXAnchor),
            statusLabel.centerYAnchor.constraint(equalTo: scroll.centerYAnchor),
            statusLabel.leadingAnchor.constraint(greaterThanOrEqualTo: scroll.leadingAnchor, constant: 20),
            statusLabel.trailingAnchor.constraint(lessThanOrEqualTo: scroll.trailingAnchor, constant: -20),
            footerLabel.leadingAnchor.constraint(equalTo: root.leadingAnchor, constant: 22),
            footerLabel.trailingAnchor.constraint(equalTo: root.trailingAnchor, constant: -22),
            footerLabel.bottomAnchor.constraint(equalTo: root.bottomAnchor, constant: -14),
            footerLabel.heightAnchor.constraint(equalToConstant: 16),
        ])
        self.panel = panel
        return panel
    }

    func controlTextDidChange(_ obj: Notification) {
        statusLabel.stringValue = "Searching…"
        statusLabel.isHidden = false
        runSearch(searchField.stringValue)
    }

    private func cachedResults(for query: String) -> [EntitySearchResult]? {
        resultCache.results(for: query).map(filterExcluded)
    }

    private func filterExcluded(_ results: [EntitySearchResult]) -> [EntitySearchResult] {
        guard let excludedEntity else { return results }
        return results.filter {
            $0.kind != excludedEntity.kind || $0.entityID != excludedEntity.entityID
        }
    }

    private func runSearch(_ query: String) {
        generation += 1
        let current = generation
        searchTask?.cancel()
        if let cached = cachedResults(for: query) {
            rows = cached
            table.reloadData()
            statusLabel.stringValue = query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                ? "No entities cataloged yet" : "No entities found"
            statusLabel.isHidden = !cached.isEmpty
            if cached.isEmpty { table.deselectAll(nil) }
            else { table.selectRowIndexes(IndexSet(integer: 0), byExtendingSelection: false) }
        }
        searchTask = Task { [weak self] in
            if !query.isEmpty { try? await Task.sleep(nanoseconds: 60_000_000) }
            guard !Task.isCancelled else { return }
            do {
                let response = try await CoreClient.shared.call(
                    method: "entity.search", params: ["query": query, "limit": 20]
                )
                let authoritative = (response["entities"] as? [[String: Any]] ?? [])
                    .compactMap(EntitySearchResult.init)
                await MainActor.run { [weak self] in
                    guard let self, current == self.generation else { return }
                    self.resultCache.store(authoritative, for: query)
                    let found = self.filterExcluded(authoritative)
                    self.rows = found
                    self.table.reloadData()
                    self.statusLabel.stringValue = query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                        ? "No entities cataloged yet" : "No entities found"
                    self.statusLabel.isHidden = !found.isEmpty
                    if found.isEmpty { self.table.deselectAll(nil) }
                    else { self.table.selectRowIndexes(IndexSet(integer: 0), byExtendingSelection: false) }
                }
            } catch {
                await MainActor.run { [weak self] in
                    guard let self, current == self.generation else { return }
                    self.rows = []; self.table.reloadData()
                    self.statusLabel.stringValue = "Entity Search unavailable: \(error.localizedDescription)"
                    self.statusLabel.isHidden = false
                }
            }
        }
    }

    func numberOfRows(in tableView: NSTableView) -> Int { rows.count }

    func tableView(_ tableView: NSTableView, viewFor tableColumn: NSTableColumn?, row: Int) -> NSView? {
        guard rows.indices.contains(row) else { return nil }
        let entity = rows[row]
        let id = NSUserInterfaceItemIdentifier("EntityCell")
        let cell = (tableView.makeView(withIdentifier: id, owner: self) as? NSTableCellView) ?? {
            let view = NSTableCellView(); view.identifier = id
            let badge = NSTextField(labelWithString: "")
            badge.tag = 1; badge.font = .monospacedSystemFont(ofSize: 10, weight: .bold); badge.textColor = .secondaryLabelColor
            let name = NSTextField(labelWithString: "")
            name.tag = 2; name.font = .systemFont(ofSize: 13.5, weight: .semibold); name.lineBreakMode = .byTruncatingTail
            let path = NSTextField(labelWithString: "")
            path.tag = 3; path.font = .monospacedSystemFont(ofSize: 10.5, weight: .regular); path.textColor = .secondaryLabelColor; path.lineBreakMode = .byTruncatingMiddle
            let repo = NSTextField(labelWithString: "")
            repo.tag = 4; repo.font = .monospacedSystemFont(ofSize: 10.5, weight: .medium); repo.textColor = .tertiaryLabelColor; repo.alignment = .right
            [badge, name, path, repo].forEach { $0.translatesAutoresizingMaskIntoConstraints = false; view.addSubview($0) }
            NSLayoutConstraint.activate([
                badge.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 10), badge.widthAnchor.constraint(equalToConstant: 42), badge.topAnchor.constraint(equalTo: view.topAnchor, constant: 8),
                name.leadingAnchor.constraint(equalTo: badge.trailingAnchor, constant: 4), name.trailingAnchor.constraint(equalTo: repo.leadingAnchor, constant: -8), name.topAnchor.constraint(equalTo: view.topAnchor, constant: 6),
                repo.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -10), repo.widthAnchor.constraint(equalToConstant: 100), repo.centerYAnchor.constraint(equalTo: name.centerYAnchor),
                path.leadingAnchor.constraint(equalTo: name.leadingAnchor), path.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -10), path.topAnchor.constraint(equalTo: name.bottomAnchor, constant: 4),
            ])
            return view
        }()
        (cell.viewWithTag(1) as? NSTextField)?.stringValue = "[\(entity.kindTag.uppercased())]"
        (cell.viewWithTag(2) as? NSTextField)?.stringValue = entity.title
        (cell.viewWithTag(3) as? NSTextField)?.stringValue = entity.displayPath ?? "\(entity.kind) · \(entity.entityID)"
        (cell.viewWithTag(4) as? NSTextField)?.stringValue = Self.repoDisplayLabel(entity.repo)
        cell.toolTip = entity.uri
        return cell
    }

    /// Display-only Arbol repo terms (GLOSSARY). Raw codenames stay functional
    /// everywhere they are sent to Core; only the visible cell text is renamed.
    private static func repoDisplayLabel(_ name: String) -> String {
        return name
    }

    private func selectedEntity() -> EntitySearchResult? {
        guard panel?.isVisible == true else { return nil }
        let index = table.selectedRow >= 0 ? table.selectedRow : 0
        guard rows.indices.contains(index) else { return nil }
        return rows[index]
    }

    private func performSelectionAction() {
        guard !performingSelection, let entity = selectedEntity(), let action = selectionAction else { return }
        performingSelection = true
        searchField.isEnabled = false
        table.isEnabled = false
        statusLabel.stringValue = "Linking “\(entity.title)”…"
        statusLabel.isHidden = false
        selectionTask = Task { [weak self] in
            do {
                try await action(entity)
                guard !Task.isCancelled else { return }
                await MainActor.run { [weak self] in self?.dismiss() }
            } catch {
                guard !Task.isCancelled else { return }
                await MainActor.run { [weak self] in
                    guard let self else { return }
                    self.performingSelection = false
                    self.searchField.isEnabled = true
                    self.table.isEnabled = true
                    self.statusLabel.stringValue = "Could not link Entity: \(error.localizedDescription)"
                    self.statusLabel.isHidden = false
                    self.panel?.makeFirstResponder(self.searchField)
                }
            }
        }
    }

    private func captureInvocationTarget() -> InvocationTarget? {
        guard let application = NSWorkspace.shared.frontmostApplication else { return nil }
        let isElma: Bool = {
            guard let bundleURL = application.bundleURL, let bundle = Bundle(url: bundleURL) else { return false }
            return (bundle.object(forInfoDictionaryKey: "ArbolUI") as? String) == "elma"
        }()

        let appElement = AXUIElementCreateApplication(application.processIdentifier)
        var focusedValue: CFTypeRef?
        let focusedElement: AXUIElement? = {
            guard AXUIElementCopyAttributeValue(
                appElement, kAXFocusedUIElementAttribute as CFString, &focusedValue
            ) == .success, let value = focusedValue else { return nil }
            return (value as! AXUIElement)
        }()
        let editableElement = focusedElement.flatMap { element -> AXUIElement? in
            var settable = DarwinBoolean(false)
            guard AXUIElementIsAttributeSettable(
                element, kAXSelectedTextAttribute as CFString, &settable
            ) == .success, settable.boolValue else { return nil }
            return element
        }
        return InvocationTarget(application: application, editableElement: editableElement, isElma: isElma)
    }

    /// Plain Return follows the invocation context: Elma receives a native
    /// composer handoff (and renders the URI as an Entity Chip), another focused
    /// editor receives selected text through Accessibility, and non-editing
    /// contexts fall back to copying the canonical URI.
    private func useSelectedEntity() {
        guard let entity = selectedEntity() else { return }
        guard let target = invocationTarget, target.acceptsEntity else {
            copySelected()
            return
        }
        dismiss()
        if target.isElma {
            Task { [weak self] in
                let result = await ContentView.Coordinator.openApp(
                    ui: "elma", query: ["insert_entity_uri": entity.uri]
                )
                guard (result["ok"] as? Bool) == true else {
                    await MainActor.run {
                        self?.copyEntityURI(entity)
                        self?.showOpenNotification(
                            entity: entity,
                            reason: (result["error"] as? String) ?? "Elma could not accept the Entity",
                            subtitle: "Entity URI copied instead"
                        )
                    }
                    return
                }
                await self?.recordAccess(entity, kind: "paste_uri")
            }
            return
        }

        guard let element = target.editableElement else {
            copyEntityURI(entity)
            return
        }
        target.application.activate(options: [.activateAllWindows, .activateIgnoringOtherApps])
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.08) { [weak self] in
            let status = AXUIElementSetAttributeValue(
                element, kAXSelectedTextAttribute as CFString, entity.uri as CFTypeRef
            )
            guard status == .success else {
                self?.copyEntityURI(entity)
                self?.showOpenNotification(
                    entity: entity,
                    reason: "The previously focused editor no longer accepts text",
                    subtitle: "Entity URI copied instead"
                )
                return
            }
            Task { await self?.recordAccess(entity, kind: "paste_uri") }
        }
    }

    private func copyEntityURI(_ entity: EntitySearchResult) {
        let item = NSPasteboardItem()
        guard item.setString(entity.uri, forType: .string) else {
            showOpenNotification(entity: entity, reason: "Could not create pasteboard content", subtitle: "Couldn’t copy Entity URI")
            return
        }
        let pasteboard = NSPasteboard.general
        pasteboard.clearContents()
        guard pasteboard.writeObjects([item]), pasteboard.string(forType: .string) == entity.uri else {
            showOpenNotification(entity: entity, reason: "Could not write to the macOS pasteboard", subtitle: "Couldn’t copy Entity URI")
            return
        }
    }

    private func recordAccess(_ entity: EntitySearchResult, kind: String) async {
        _ = try? await CoreClient.shared.call(method: "entity.record_access", params: [
            "repo": entity.repo, "kind": entity.kind,
            "entity_id": entity.entityID, "access_kind": kind,
        ])
    }

    @objc private func copySelected() {
        guard let entity = selectedEntity() else { return }
        copyEntityURI(entity)
        guard NSPasteboard.general.string(forType: .string) == entity.uri else { return }
        dismiss()
        Task { await recordAccess(entity, kind: "copy_uri") }
    }

    private func openSelected() {
        guard let entity = selectedEntity() else { return }

        if entity.kind == "artifact", let path = entity.filePath {
            let fileURL = URL(fileURLWithPath: (path as NSString).expandingTildeInPath).standardizedFileURL
            guard FileManager.default.fileExists(atPath: fileURL.path) else {
                showOpenNotification(entity: entity, reason: "The cataloged file no longer exists: \(path)")
                return
            }
            dismiss()
            DetachedArtifactViewLauncher().open(
                path: fileURL.path, repoName: entity.repo, repoPath: nil, theme: nil
            )
            ActiveEntityHistory.record(
                repo: entity.repo, kind: entity.kind, entityID: entity.entityID, title: entity.title
            )
            Task { await recordAccess(entity, kind: "open") }
            return
        }

        dismiss()
        Task { [weak self] in
            do {
                let response = try await CoreClient.shared.call(method: "entity.go_to", params: [
                    "kind": entity.kind, "entity_id": entity.entityID,
                ])
                guard let destination = response["destination"] as? [String: Any],
                      (destination["type"] as? String) == "app",
                      let ui = destination["ui"] as? String else {
                    let destination = response["destination"] as? [String: Any]
                    await self?.showOpenNotification(
                        entity: entity,
                        reason: (destination?["reason"] as? String) ?? "No corresponding page is available"
                    )
                    return
                }
                let result = await ContentView.Coordinator.openApp(
                    ui: ui, query: destination["query"] as? [String: Any] ?? [:]
                )
                guard (result["ok"] as? Bool) == true else {
                    await self?.showOpenNotification(
                        entity: entity,
                        reason: (result["error"] as? String) ?? "The corresponding app could not be opened"
                    )
                    return
                }
                _ = try? await CoreClient.shared.call(method: "entity.record_access", params: [
                    "repo": entity.repo, "kind": entity.kind,
                    "entity_id": entity.entityID, "access_kind": "open",
                ])
            } catch {
                await self?.showOpenNotification(entity: entity, reason: error.localizedDescription)
            }
        }
    }

    private func showOpenNotification(entity: EntitySearchResult, reason: String, subtitle: String? = nil) {
        guard let delegate = NSApp.delegate as? AppDelegate else { return }
        delegate.presentAppNotification(
            title: "Arbol",
            subtitle: subtitle ?? "Couldn’t open \(entity.title)",
            body: reason
        )
    }

    private func position(_ panel: NSPanel) {
        let visible = (NSScreen.main ?? NSScreen.screens.first)?.visibleFrame
            ?? NSRect(x: 0, y: 0, width: 1440, height: 900)
        panel.setFrameOrigin(NSPoint(x: round(visible.midX - panel.frame.width / 2),
                                     y: round(visible.midY - panel.frame.height / 2 + 30)))
    }

    func control(_ control: NSControl, textView: NSTextView, doCommandBy commandSelector: Selector) -> Bool {
        switch commandSelector {
        case #selector(NSResponder.moveDown(_:)): moveSelection(by: 1); return true
        case #selector(NSResponder.moveUp(_:)): moveSelection(by: -1); return true
        case #selector(NSResponder.insertNewline(_:)), #selector(NSResponder.insertNewlineIgnoringFieldEditor(_:)):
            if selectionAction != nil {
                performSelectionAction()
            } else {
                let modifiers = NSApp.currentEvent?.modifierFlags.intersection(.deviceIndependentFlagsMask) ?? []
                if modifiers.contains(.command) { openSelected() }
                else if modifiers.contains(.shift) { copySelected() }
                else { useSelectedEntity() }
            }
            return true
        case #selector(NSResponder.cancelOperation(_:)):
            if !performingSelection { dismiss() }
            return true
        default: return false
        }
    }

    deinit {
        removeKeyMonitor()
        panel?.handleKeyDown = nil
        searchTask?.cancel()
        selectionTask?.cancel()
    }
}

// MARK: - Relationship type picker

final class EntityRelationshipTypeDialogController: NSObject, NSTokenFieldDelegate {
    private let source: EntityLinkEndpoint
    private let target: EntityLinkEndpoint
    private let options: [EntityRelationshipTypeOption]
    private let onSubmit: ([EntityRelationshipSelection]) async throws -> Void
    private var panel: EntitySearchPanel?
    private let tokenField = NSTokenField()
    private let suggestions = NSStackView()
    private let statusLabel = NSTextField(labelWithString: "")
    private var closeHandler: (() -> Void)?
    private var keyMonitor: Any?
    private var submitting = false

    init(
        source: EntityLinkEndpoint, target: EntityLinkEndpoint,
        options: [EntityRelationshipTypeOption],
        onSubmit: @escaping ([EntityRelationshipSelection]) async throws -> Void
    ) {
        self.source = source
        self.target = target
        self.options = options
        self.onSubmit = onSubmit
    }

    func show(onClose: @escaping () -> Void) {
        closeHandler = onClose
        let panel = ensurePanel()
        position(panel)
        NSApp.activate(ignoringOtherApps: true)
        panel.makeKeyAndOrderFront(nil)
        panel.makeFirstResponder(tokenField)
        keyMonitor = NSEvent.addLocalMonitorForEvents(matching: .keyDown) { [weak self] event in
            guard let self, self.panel?.isVisible == true else { return event }
            if event.keyCode == UInt16(kVK_Escape) { self.dismiss(); return nil }
            if event.keyCode == UInt16(kVK_Return) || event.keyCode == UInt16(kVK_ANSI_KeypadEnter) {
                self.submit(); return nil
            }
            return event
        }
    }

    private func ensurePanel() -> EntitySearchPanel {
        if let panel { return panel }
        let panel = EntitySearchPanel(
            contentRect: NSRect(x: 0, y: 0, width: 620, height: 520),
            styleMask: [.titled, .closable, .fullSizeContentView], backing: .buffered, defer: false
        )
        panel.titleVisibility = .hidden
        panel.titlebarAppearsTransparent = true
        panel.level = .floating
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .transient]
        panel.isReleasedWhenClosed = false
        panel.standardWindowButton(.closeButton)?.isHidden = true
        panel.standardWindowButton(.miniaturizeButton)?.isHidden = true
        panel.standardWindowButton(.zoomButton)?.isHidden = true

        let root = NSView()
        root.wantsLayer = true
        root.layer?.backgroundColor = NSColor.windowBackgroundColor.cgColor
        panel.contentView = root

        let title = NSTextField(labelWithString: "Relationship types")
        title.font = .systemFont(ofSize: 20, weight: .semibold)
        let subtitle = NSTextField(wrappingLabelWithString: "“\(source.title)” → “\(target.title)”")
        subtitle.font = .monospacedSystemFont(ofSize: 11, weight: .medium)
        subtitle.textColor = .secondaryLabelColor
        subtitle.maximumNumberOfLines = 2
        tokenField.placeholderString = "relationship type (empty = related)"
        tokenField.tokenStyle = .rounded
        tokenField.delegate = self
        tokenField.font = .monospacedSystemFont(ofSize: 13, weight: .medium)

        suggestions.orientation = .vertical
        suggestions.alignment = .leading
        suggestions.spacing = 8
        let groups = [
            ("direct", "Preferred direction"),
            ("reverse", "Reverse direction"),
            ("other", "Other existing types"),
        ]
        for (section, label) in groups {
            let matches = options.filter { $0.section == section }
            guard !matches.isEmpty else { continue }
            let heading = NSTextField(labelWithString: label.uppercased())
            heading.font = .monospacedSystemFont(ofSize: 9.5, weight: .bold)
            heading.textColor = .tertiaryLabelColor
            suggestions.addArrangedSubview(heading)
            for option in matches {
                let arrow = option.direction == "reverse" ? "  ←" : "  →"
                let button = NSButton(title: option.name + arrow, target: self, action: #selector(addSuggestion(_:)))
                button.bezelStyle = .roundRect
                button.font = .monospacedSystemFont(ofSize: 10.5, weight: .medium)
                button.identifier = NSUserInterfaceItemIdentifier(option.name)
                button.toolTip = option.direction == "reverse"
                    ? "Creates \(target.kind) → \(source.kind)"
                    : "Creates \(source.kind) → \(target.kind)"
                suggestions.addArrangedSubview(button)
            }
        }
        let scroll = NSScrollView()
        scroll.documentView = suggestions
        scroll.hasVerticalScroller = true
        scroll.drawsBackground = false

        statusLabel.font = .systemFont(ofSize: 11, weight: .medium)
        statusLabel.textColor = .secondaryLabelColor
        statusLabel.isHidden = true
        let footer = NSTextField(labelWithString: "Enter link · comma adds another type · Esc cancel")
        footer.font = .monospacedSystemFont(ofSize: 10.5, weight: .medium)
        footer.textColor = .tertiaryLabelColor

        [title, subtitle, tokenField, scroll, statusLabel, footer].forEach {
            $0.translatesAutoresizingMaskIntoConstraints = false
            root.addSubview($0)
        }
        suggestions.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            title.topAnchor.constraint(equalTo: root.topAnchor, constant: 34),
            title.leadingAnchor.constraint(equalTo: root.leadingAnchor, constant: 22),
            title.trailingAnchor.constraint(equalTo: root.trailingAnchor, constant: -22),
            subtitle.topAnchor.constraint(equalTo: title.bottomAnchor, constant: 5),
            subtitle.leadingAnchor.constraint(equalTo: title.leadingAnchor),
            subtitle.trailingAnchor.constraint(equalTo: title.trailingAnchor),
            tokenField.topAnchor.constraint(equalTo: subtitle.bottomAnchor, constant: 16),
            tokenField.leadingAnchor.constraint(equalTo: title.leadingAnchor),
            tokenField.trailingAnchor.constraint(equalTo: title.trailingAnchor),
            tokenField.heightAnchor.constraint(greaterThanOrEqualToConstant: 34),
            scroll.topAnchor.constraint(equalTo: tokenField.bottomAnchor, constant: 14),
            scroll.leadingAnchor.constraint(equalTo: title.leadingAnchor),
            scroll.trailingAnchor.constraint(equalTo: title.trailingAnchor),
            scroll.bottomAnchor.constraint(equalTo: statusLabel.topAnchor, constant: -8),
            suggestions.widthAnchor.constraint(greaterThanOrEqualTo: scroll.widthAnchor, constant: -16),
            statusLabel.leadingAnchor.constraint(equalTo: title.leadingAnchor),
            statusLabel.trailingAnchor.constraint(equalTo: title.trailingAnchor),
            statusLabel.bottomAnchor.constraint(equalTo: footer.topAnchor, constant: -7),
            footer.leadingAnchor.constraint(equalTo: title.leadingAnchor),
            footer.trailingAnchor.constraint(equalTo: title.trailingAnchor),
            footer.bottomAnchor.constraint(equalTo: root.bottomAnchor, constant: -14),
        ])
        self.panel = panel
        return panel
    }

    @objc private func addSuggestion(_ sender: NSButton) {
        guard let name = sender.identifier?.rawValue else { return }
        var values = tokenNames()
        if !values.contains(name) { values.append(name) }
        tokenField.objectValue = values
        panel?.makeFirstResponder(tokenField)
    }

    private func tokenNames() -> [String] {
        let raw: [String]
        if let values = tokenField.objectValue as? [String] { raw = values }
        else if let values = tokenField.objectValue as? [Any] { raw = values.map { String(describing: $0) } }
        else { raw = tokenField.stringValue.split(separator: ",").map(String.init) }
        var seen = Set<String>()
        return raw.flatMap { $0.split(separator: ",").map(String.init) }
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() }
            .filter { !$0.isEmpty && seen.insert($0).inserted }
    }

    private func submit() {
        guard !submitting else { return }
        let names = tokenNames()
        var selections: [EntityRelationshipSelection] = []
        for name in names {
            if let option = options.first(where: { $0.name == name }) {
                selections.append(EntityRelationshipSelection(name: name, direction: option.direction))
                continue
            }
            guard EntityRelationshipTypeDialogController.validType(name) else {
                showStatus("Use letters, numbers, underscores, dots, colons, or hyphens.", error: true)
                return
            }
            if source.kind != target.kind {
                guard let direction = askDirection(for: name) else { return }
                selections.append(EntityRelationshipSelection(name: name, direction: direction))
            } else {
                selections.append(EntityRelationshipSelection(name: name, direction: "forward"))
            }
        }
        submitting = true
        tokenField.isEnabled = false
        showStatus("Linking Entities…", error: false)
        Task { [weak self] in
            guard let self else { return }
            do {
                try await onSubmit(selections)
                await MainActor.run { self.dismiss() }
            } catch {
                await MainActor.run {
                    self.submitting = false
                    self.tokenField.isEnabled = true
                    self.showStatus("Could not link Entities: \(error.localizedDescription)", error: true)
                    self.panel?.makeFirstResponder(self.tokenField)
                }
            }
        }
    }

    private static func validType(_ value: String) -> Bool {
        value.range(of: "^[a-z][a-z0-9_.:-]{0,79}$", options: .regularExpression) != nil
    }

    private func askDirection(for name: String) -> String? {
        let alert = NSAlert()
        alert.messageText = "Direction for “\(name)”"
        alert.informativeText = "Choose how this new relationship reads between these Entity types."
        alert.addButton(withTitle: "\(source.kind) → \(target.kind)")
        alert.addButton(withTitle: "\(target.kind) → \(source.kind)")
        alert.addButton(withTitle: "Cancel")
        switch alert.runModal() {
        case .alertFirstButtonReturn: return "forward"
        case .alertSecondButtonReturn: return "reverse"
        default: return nil
        }
    }

    private func showStatus(_ text: String, error: Bool) {
        statusLabel.stringValue = text
        statusLabel.textColor = error ? .systemRed : .secondaryLabelColor
        statusLabel.isHidden = false
    }

    private func dismiss() {
        if let keyMonitor { NSEvent.removeMonitor(keyMonitor); self.keyMonitor = nil }
        panel?.orderOut(nil)
        let handler = closeHandler
        closeHandler = nil
        handler?()
    }

    private func position(_ panel: NSPanel) {
        let visible = (NSScreen.main ?? NSScreen.screens.first)?.visibleFrame
            ?? NSRect(x: 0, y: 0, width: 1440, height: 900)
        panel.setFrameOrigin(NSPoint(
            x: round(visible.midX - panel.frame.width / 2),
            y: round(visible.midY - panel.frame.height / 2 + 30)
        ))
    }

    deinit {
        if let keyMonitor { NSEvent.removeMonitor(keyMonitor) }
    }
}
