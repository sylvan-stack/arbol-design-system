import AppKit

/// A transparent panel needs an explicitly flipped document view so Auto Layout's
/// top anchor is also the visual top of the feed.
private final class ComunicadoFeedDocumentView: NSView {
    override var isFlipped: Bool { true }
}

/// Dragging is intentionally limited to the prominent header. Controls keep
/// their normal hit testing while labels and empty header space move the panel.
private final class ComunicadoFeedHeaderView: NSVisualEffectView {
    override func hitTest(_ point: NSPoint) -> NSView? {
        let hit = super.hitTest(point)
        if hit is NSControl { return hit }
        return hit == nil ? nil : self
    }

    override func mouseDown(with event: NSEvent) {
        window?.performDrag(with: event)
    }
}

/// An opaque Comunicado card is one activation target. It is a real AppKit
/// control rather than a view with a hand-written `mouseUp`: non-activating
/// panels do not reliably deliver the matching mouse-up to a view after the
/// first click activates another application. `NSButton` owns the complete
/// tracking sequence and dispatches its action before the Feed is hidden.
private final class ComunicadoFeedRowView: NSButton {
    var onActivate: (() -> Void)?

    override init(frame frameRect: NSRect) {
        super.init(frame: frameRect)
        title = ""
        isBordered = false
        bezelStyle = .regularSquare
        setButtonType(.momentaryChange)
        target = self
        action = #selector(activate)
    }

    required init?(coder: NSCoder) {
        super.init(coder: coder)
        target = self
        action = #selector(activate)
    }

    override func hitTest(_ point: NSPoint) -> NSView? {
        guard !isHidden, alphaValue > 0, bounds.contains(point) else { return nil }
        return self
    }

    override func acceptsFirstMouse(for event: NSEvent?) -> Bool {
        true
    }

    override func resetCursorRects() {
        addCursorRect(bounds, cursor: .pointingHand)
    }

    @objc private func activate() {
        onActivate?()
    }
}

/// The lifecycle projection used by the Comunicado Feed. These are concrete
/// states supported by the current Notification and Debug Comunicado Species; future
/// Species can map their own state onto whether an instance is active here.
enum ComunicadoFeedItemState: String, Equatable {
    case active
    case dismissed
}

/// Controls which edge receives newly emitted Comunicados. The raw values are
/// persisted so the compact header toggle keeps its direction across launches.
enum ComunicadoFeedOrderDirection: String, Equatable {
    case latestAtTop = "top"
    case latestAtBottom = "bottom"
}

/// One compact row in Willo's optional always-on-top Comunicado Feed.
struct ComunicadoFeedItem {
    let id: String
    let species: String
    let title: String
    let content: String
    let emittedAt: Date
    /// The destination associated with activating this Comunicado. Notification
    /// Comunicados use this to open the relevant Elma Chat after dismissal.
    let descriptor: ComunicadoDescriptor?
    var state: ComunicadoFeedItemState

    init(
        id: String,
        species: String,
        title: String,
        content: String,
        emittedAt: Date,
        descriptor: ComunicadoDescriptor? = nil,
        state: ComunicadoFeedItemState = .active
    ) {
        self.id = id
        self.species = species
        self.title = title
        self.content = content
        self.emittedAt = emittedAt
        self.descriptor = descriptor
        self.state = state
    }
}

/// Willo-owned, native Presentation that collects every active Comunicado the
/// native host emits. It is deliberately separate from the main Willo window:
/// users can leave the Station in full view while this compact feed floats over
/// their current application. The panel itself is absent when no Comunicado is
/// active, even if the user's "on top" preference remains enabled.
@MainActor
final class ComunicadoFeedController: NSObject, NSWindowDelegate {
    static let stateDidChangeNotification = Notification.Name("com.arbol.comunicado-feed-state-changed")
    static let enabledDefaultsKey = "arbol.comunicado-feed-on-top"
    static let frameOriginDefaultsKey = "arbol.comunicado-feed-frame-origin"
    static let orderDirectionDefaultsKey = "arbol.comunicado-feed-order-direction"
    static let maximumItemCount = 100
    static let panelCollectionBehavior: NSWindow.CollectionBehavior = [
        .canJoinAllSpaces, .fullScreenAuxiliary,
    ]

    private var panel: NSPanel?
    private var itemStack: NSStackView?
    private var itemScrollView: NSScrollView?
    private var countLabel: NSTextField?
    private var orderControl: NSSegmentedControl?
    private var stackTopConstraint: NSLayoutConstraint?
    private var stackBottomConstraint: NSLayoutConstraint?
    private var topLayoutConstraints: [NSLayoutConstraint] = []
    private var bottomLayoutConstraints: [NSLayoutConstraint] = []
    private var hasPositionedPanel = false
    /// Species-owned active lifetimes are projected into Feed state here. Tasks
    /// are keyed by stable instance id so re-emission replaces the old timeout.
    private var automaticDismissalTasks: [String: Task<Void, Never>] = [:]
    private(set) var items: [ComunicadoFeedItem] = []

    var isEnabled: Bool {
        UserDefaults.standard.bool(forKey: Self.enabledDefaultsKey)
    }

    var orderDirection: ComunicadoFeedOrderDirection {
        guard let stored = UserDefaults.standard.string(forKey: Self.orderDirectionDefaultsKey) else {
            return .latestAtTop
        }
        return ComunicadoFeedOrderDirection(rawValue: stored) ?? .latestAtTop
    }

    var activeItems: [ComunicadoFeedItem] {
        // Emission time, rather than arrival time, is authoritative. The index
        // keeps equal-timestamp items in newest-arrival-first order.
        let newestFirst = items.enumerated()
            .filter { $0.element.state == .active }
            .sorted { lhs, rhs in
                if lhs.element.emittedAt != rhs.element.emittedAt {
                    return lhs.element.emittedAt > rhs.element.emittedAt
                }
                return lhs.offset < rhs.offset
            }
            .map(\.element)
        return orderDirection == .latestAtTop ? newestFirst : Array(newestFirst.reversed())
    }

    var activeCount: Int {
        items.lazy.filter { $0.state == .active }.count
    }

    func startIfEnabled() {
        guard ARBOL_UI_KEY == "willo", isEnabled else { return }
        reconcilePanelVisibility()
        publishState()
    }

    func setEnabled(_ enabled: Bool) {
        UserDefaults.standard.set(enabled, forKey: Self.enabledDefaultsKey)
        reconcilePanelVisibility()
        publishState()
    }

    func setOrderDirection(_ direction: ComunicadoFeedOrderDirection) {
        UserDefaults.standard.set(direction.rawValue, forKey: Self.orderDirectionDefaultsKey)
        orderControl?.selectedSegment = direction == .latestAtTop ? 0 : 1
        renderItems()
        publishState()
    }

    func append(_ item: ComunicadoFeedItem, activeFor activeDuration: TimeInterval? = nil) {
        // A stable Comunicado id represents one instance. Re-delivery updates
        // its position and returns it to its supplied state instead of producing
        // a duplicate feed row. It also restarts that Species' active lifetime.
        cancelAutomaticDismissal(forID: item.id)
        items.removeAll { $0.id == item.id }
        items.insert(item, at: 0)
        trimItemsIfNeeded()
        if item.state == .active, let activeDuration {
            scheduleAutomaticDismissal(forID: item.id, after: activeDuration)
        }
        reconcilePanelVisibility()
        publishState()
    }

    func setState(_ state: ComunicadoFeedItemState, forID id: String) {
        guard let index = items.firstIndex(where: { $0.id == id }),
              items[index].state != state else { return }
        items[index].state = state
        if state == .dismissed {
            cancelAutomaticDismissal(forID: id)
        }
        reconcilePanelVisibility()
        publishState()
    }

    func dismissItem(withID id: String) {
        setState(.dismissed, forID: id)
    }

    /// Dismiss every active Comunicado without changing the user's persistent
    /// Feed On Top preference. The next delivery can therefore show the Feed
    /// again without requiring Willo's Presentation toggle to be re-enabled.
    func dismissAllItems() {
        let activeIDs = items.lazy
            .filter { $0.state == .active }
            .map(\.id)
        guard !activeIDs.isEmpty else { return }
        for id in activeIDs {
            cancelAutomaticDismissal(forID: id)
        }
        for index in items.indices where items[index].state == .active {
            items[index].state = .dismissed
        }
        reconcilePanelVisibility()
        publishState()
    }

    /// Activating a card is one atomic user action: remove it from the active
    /// Feed first, then follow its typed destination. Turn-completion Notification
    /// Comunicados carry an Elma descriptor for their originating Chat Session.
    func activateItem(withID id: String) {
        guard let item = items.first(where: { $0.id == id && $0.state == .active }) else { return }
        dismissItem(withID: id)
        guard let descriptor = item.descriptor else { return }
        Task { @MainActor in
            // A non-activating panel can finish its click/window ordering after
            // this handler returns. Redirecting in the same event turn lets that
            // pending ordering reclaim focus from Elma, making the card appear to
            // only close. Let AppKit settle, then perform the cross-app handoff.
            try? await Task.sleep(nanoseconds: 150_000_000)
            _ = await descriptor.redirect()
        }
    }

    var state: [String: Any] {
        // `count` remains the bridge compatibility key, but now deliberately
        // means active count rather than historical/recent count.
        [
            "ok": true,
            "enabled": isEnabled,
            "count": activeCount,
            "activeCount": activeCount,
            "orderDirection": orderDirection.rawValue,
            "visible": panel?.isVisible == true,
        ]
    }

    private func trimItemsIfNeeded() {
        guard items.count > Self.maximumItemCount else { return }
        // Retain active instances in preference to dismissed history. This keeps
        // a long-lived Comunicado visible even if many newer instances finish.
        var overflow = items.count - Self.maximumItemCount
        var index = items.count - 1
        while overflow > 0, index >= 0 {
            if items[index].state == .dismissed {
                items.remove(at: index)
                overflow -= 1
            }
            index -= 1
        }
        if overflow > 0 {
            items.removeLast(overflow)
        }

        let retainedIDs = Set(items.map(\.id))
        for id in Array(automaticDismissalTasks.keys) where !retainedIDs.contains(id) {
            cancelAutomaticDismissal(forID: id)
        }
    }

    private func scheduleAutomaticDismissal(forID id: String, after duration: TimeInterval) {
        guard duration > 0 else {
            setState(.dismissed, forID: id)
            return
        }
        let nanoseconds = UInt64(duration * 1_000_000_000)
        automaticDismissalTasks[id] = Task { @MainActor [weak self] in
            do {
                try await Task.sleep(nanoseconds: nanoseconds)
            } catch {
                return
            }
            guard !Task.isCancelled else { return }
            self?.setState(.dismissed, forID: id)
        }
    }

    private func cancelAutomaticDismissal(forID id: String) {
        automaticDismissalTasks.removeValue(forKey: id)?.cancel()
    }

    private func reconcilePanelVisibility() {
        guard isEnabled, activeCount > 0 else {
            hidePanel()
            return
        }
        showPanel()
    }

    private func showPanel() {
        guard activeCount > 0 else {
            hidePanel()
            return
        }
        let panel = ensurePanel()
        renderItems()
        position(panel)
        panel.orderFrontRegardless()
    }

    private func hidePanel() {
        panel?.orderOut(nil)
    }

    private func ensurePanel() -> NSPanel {
        if let panel { return panel }

        let panel = NSPanel(
            contentRect: NSRect(x: 0, y: 0, width: 450, height: 500),
            styleMask: [.titled, .nonactivatingPanel, .fullSizeContentView],
            backing: .buffered,
            defer: false
        )
        panel.title = "Comunicado Feed"
        panel.titleVisibility = .hidden
        panel.titlebarAppearsTransparent = true
        panel.isOpaque = false
        panel.backgroundColor = .clear
        panel.hasShadow = false
        // The transparent body must not unexpectedly move the panel. The
        // prominent header initiates a native window drag explicitly.
        panel.isMovable = true
        panel.isMovableByWindowBackground = false
        panel.isFloatingPanel = true
        panel.level = .floating
        panel.hidesOnDeactivate = false
        panel.becomesKeyOnlyIfNeeded = true
        panel.collectionBehavior = Self.panelCollectionBehavior
        panel.animationBehavior = .none
        panel.isReleasedWhenClosed = false
        panel.delegate = self
        panel.contentView = makeContentView()
        self.panel = panel
        return panel
    }

    private func makeContentView() -> NSView {
        let canvas = NSView()
        canvas.wantsLayer = true
        canvas.layer?.backgroundColor = NSColor.clear.cgColor

        let header = ComunicadoFeedHeaderView()
        header.material = .hudWindow
        header.blendingMode = .behindWindow
        header.state = .active
        header.wantsLayer = true
        header.layer?.cornerRadius = 13
        header.layer?.masksToBounds = true
        header.layer?.borderWidth = 1
        header.layer?.borderColor = NSColor.controlAccentColor.withAlphaComponent(0.58).cgColor
        header.translatesAutoresizingMaskIntoConstraints = false
        header.setAccessibilityRole(.group)
        header.setAccessibilityLabel("Draggable Comunicado Feed header")

        let glyph = NSImageView()
        glyph.image = NSImage(
            systemSymbolName: "antenna.radiowaves.left.and.right",
            accessibilityDescription: "Comunicado Feed"
        )
        glyph.contentTintColor = .controlAccentColor
        glyph.symbolConfiguration = NSImage.SymbolConfiguration(pointSize: 14, weight: .semibold)
        glyph.setContentHuggingPriority(.required, for: .horizontal)

        let title = NSTextField(labelWithString: "Comunicado Feed")
        title.font = .systemFont(ofSize: 14, weight: .semibold)
        title.setContentHuggingPriority(.defaultLow, for: .horizontal)

        let count = NSTextField(labelWithString: "0 active")
        count.font = .monospacedSystemFont(ofSize: 9.5, weight: .semibold)
        count.textColor = .secondaryLabelColor
        count.setContentHuggingPriority(.required, for: .horizontal)
        countLabel = count

        let direction = NSSegmentedControl(
            labels: ["Top", "Bottom"],
            trackingMode: .selectOne,
            target: self,
            action: #selector(orderDirectionPressed(_:))
        )
        direction.controlSize = .small
        direction.segmentStyle = .rounded
        direction.selectedSegment = orderDirection == .latestAtTop ? 0 : 1
        direction.setWidth(34, forSegment: 0)
        direction.setWidth(48, forSegment: 1)
        direction.toolTip = "Place the Feed header at the top or bottom"
        direction.setAccessibilityLabel("Comunicado order direction")
        direction.setContentHuggingPriority(.required, for: .horizontal)
        orderControl = direction

        let clear = NSButton(title: "Clear", target: self, action: #selector(clearPressed))
        clear.bezelStyle = .rounded
        clear.controlSize = .small
        clear.toolTip = "Dismiss all active Comunicados"
        clear.setAccessibilityLabel("Clear Comunicado Feed")
        clear.setContentHuggingPriority(.required, for: .horizontal)

        let close = NSButton(title: "Close", target: self, action: #selector(closePressed))
        close.bezelStyle = .rounded
        close.controlSize = .small
        close.toolTip = "Turn off Comunicado Feed On Top"
        close.setContentHuggingPriority(.required, for: .horizontal)

        let headerContent = NSStackView(views: [glyph, title, count, direction, clear, close])
        headerContent.orientation = .horizontal
        headerContent.alignment = .centerY
        headerContent.spacing = 7
        headerContent.edgeInsets = NSEdgeInsets(top: 8, left: 12, bottom: 8, right: 9)
        headerContent.translatesAutoresizingMaskIntoConstraints = false
        header.addSubview(headerContent)

        let stack = NSStackView()
        stack.orientation = .vertical
        stack.alignment = .leading
        // The stack is anchored beside the header: at the document's top in
        // Top mode and at its bottom in Bottom mode. `.fill` keeps strict order.
        stack.distribution = .fill
        stack.spacing = 7
        stack.edgeInsets = NSEdgeInsets(top: 7, left: 8, bottom: 8, right: 8)
        stack.translatesAutoresizingMaskIntoConstraints = false
        itemStack = stack

        let document = ComunicadoFeedDocumentView()
        document.wantsLayer = true
        document.layer?.backgroundColor = NSColor.clear.cgColor
        document.translatesAutoresizingMaskIntoConstraints = false
        document.addSubview(stack)

        let scroll = NSScrollView()
        scroll.translatesAutoresizingMaskIntoConstraints = false
        scroll.documentView = document
        // Keep the floating panel visually transparent between cards. A native
        // overlay scroller renders as an isolated dark rectangle over whatever
        // app is behind the panel (especially in Bottom mode after we scroll to
        // the newest item). Wheel and trackpad scrolling still work without the
        // scroller chrome.
        scroll.hasVerticalScroller = false
        scroll.hasHorizontalScroller = false
        scroll.drawsBackground = false
        scroll.backgroundColor = .clear
        scroll.borderType = .noBorder
        scroll.autohidesScrollers = true
        itemScrollView = scroll

        canvas.addSubview(header)
        canvas.addSubview(scroll)
        let stackTop = stack.topAnchor.constraint(equalTo: document.topAnchor)
        let stackBottom = stack.bottomAnchor.constraint(equalTo: document.bottomAnchor)
        stackTopConstraint = stackTop
        stackBottomConstraint = stackBottom
        topLayoutConstraints = [
            header.topAnchor.constraint(equalTo: canvas.topAnchor, constant: 8),
            scroll.topAnchor.constraint(equalTo: header.bottomAnchor, constant: 2),
            scroll.bottomAnchor.constraint(equalTo: canvas.bottomAnchor),
        ]
        bottomLayoutConstraints = [
            scroll.topAnchor.constraint(equalTo: canvas.topAnchor),
            scroll.bottomAnchor.constraint(equalTo: header.topAnchor, constant: -2),
            header.bottomAnchor.constraint(equalTo: canvas.bottomAnchor, constant: -8),
        ]
        NSLayoutConstraint.activate([
            header.leadingAnchor.constraint(equalTo: canvas.leadingAnchor, constant: 8),
            header.trailingAnchor.constraint(equalTo: canvas.trailingAnchor, constant: -8),
            header.heightAnchor.constraint(equalToConstant: 44),
            headerContent.leadingAnchor.constraint(equalTo: header.leadingAnchor),
            headerContent.trailingAnchor.constraint(equalTo: header.trailingAnchor),
            headerContent.topAnchor.constraint(equalTo: header.topAnchor),
            headerContent.bottomAnchor.constraint(equalTo: header.bottomAnchor),

            scroll.leadingAnchor.constraint(equalTo: canvas.leadingAnchor),
            scroll.trailingAnchor.constraint(equalTo: canvas.trailingAnchor),
            document.leadingAnchor.constraint(equalTo: scroll.contentView.leadingAnchor),
            document.trailingAnchor.constraint(equalTo: scroll.contentView.trailingAnchor),
            document.topAnchor.constraint(equalTo: scroll.contentView.topAnchor),
            document.widthAnchor.constraint(equalTo: scroll.contentView.widthAnchor),
            document.heightAnchor.constraint(greaterThanOrEqualTo: scroll.contentView.heightAnchor),
            stack.leadingAnchor.constraint(equalTo: document.leadingAnchor),
            stack.trailingAnchor.constraint(equalTo: document.trailingAnchor),
            stack.topAnchor.constraint(greaterThanOrEqualTo: document.topAnchor),
            stack.bottomAnchor.constraint(lessThanOrEqualTo: document.bottomAnchor),
        ])
        applyDirectionLayout()
        return canvas
    }

    private func applyDirectionLayout() {
        NSLayoutConstraint.deactivate(topLayoutConstraints + bottomLayoutConstraints)
        NSLayoutConstraint.activate(
            orderDirection == .latestAtTop ? topLayoutConstraints : bottomLayoutConstraints
        )
        if let stackTopConstraint, let stackBottomConstraint {
            NSLayoutConstraint.deactivate([stackTopConstraint, stackBottomConstraint])
            NSLayoutConstraint.activate([
                orderDirection == .latestAtTop ? stackTopConstraint : stackBottomConstraint,
            ])
        }
    }

    private func renderItems() {
        guard let stack = itemStack else { return }
        applyDirectionLayout()
        for view in stack.arrangedSubviews {
            stack.removeArrangedSubview(view)
            view.removeFromSuperview()
        }

        let active = activeItems
        countLabel?.stringValue = "\(active.count) active"
        for item in active {
            let row = makeRow(item)
            stack.addArrangedSubview(row)
            row.widthAnchor.constraint(equalTo: stack.widthAnchor, constant: -18).isActive = true
        }
        // Bottom mode puts the header below the cards and keeps the newest card
        // immediately above it. Top mode preserves the original inverse layout.
        panel?.contentView?.layoutSubtreeIfNeeded()
        if let scroll = itemScrollView {
            let clip = scroll.contentView
            let y: CGFloat
            if orderDirection == .latestAtTop {
                y = 0
            } else {
                y = max(0, (scroll.documentView?.bounds.height ?? 0) - clip.bounds.height)
            }
            clip.scroll(to: NSPoint(x: 0, y: y))
            scroll.reflectScrolledClipView(clip)
        }
    }

    private func makeRow(_ item: ComunicadoFeedItem) -> NSView {
        let row = ComunicadoFeedRowView()
        row.translatesAutoresizingMaskIntoConstraints = false
        row.wantsLayer = true
        row.layer?.cornerRadius = 8
        row.layer?.borderWidth = 1
        row.layer?.borderColor = NSColor.separatorColor.withAlphaComponent(0.65).cgColor
        // Only the feed's window canvas is transparent. Each Comunicado is an
        // opaque card so content remains readable over arbitrary applications.
        row.layer?.backgroundColor = NSColor.controlBackgroundColor.cgColor
        // NSTextField labels can draw beyond their layout frame while Auto Layout
        // is converging on a multiline intrinsic size. The card is the hard visual
        // boundary for every Comunicado, including long unbroken payloads.
        row.wantsLayer = true
        row.layer?.masksToBounds = true
        switch item.descriptor {
        case .link:
            row.toolTip = "Click to open link and dismiss"
        case .app:
            row.toolTip = "Click to open in Arbol and dismiss"
        case nil:
            row.toolTip = "Click to dismiss"
        }
        row.setAccessibilityRole(.button)
        row.setAccessibilityLabel("Open and dismiss \(item.species): \(item.title)")
        row.onActivate = { [weak self] in
            self?.activateItem(withID: item.id)
        }

        let species = NSTextField(labelWithString: item.species.uppercased())
        species.font = .monospacedSystemFont(ofSize: 9, weight: .semibold)
        species.textColor = .controlAccentColor
        species.lineBreakMode = .byTruncatingTail
        species.cell?.usesSingleLineMode = true
        species.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)

        let time = NSTextField(labelWithString: Self.timeFormatter.string(from: item.emittedAt))
        time.font = .monospacedSystemFont(ofSize: 9, weight: .regular)
        time.textColor = .tertiaryLabelColor
        time.alignment = .right
        time.setContentHuggingPriority(.required, for: .horizontal)

        let meta = NSStackView(views: [species, NSView(), time])
        meta.orientation = .horizontal
        meta.alignment = .centerY
        meta.spacing = 6
        meta.translatesAutoresizingMaskIntoConstraints = false

        let title = NSTextField(labelWithString: item.title)
        title.font = .systemFont(ofSize: 12.5, weight: .semibold)
        title.lineBreakMode = .byTruncatingTail
        title.cell?.usesSingleLineMode = true
        title.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        title.translatesAutoresizingMaskIntoConstraints = false

        let content = NSTextField(wrappingLabelWithString: Self.preview(item.content))
        content.font = .systemFont(ofSize: 11, weight: .regular)
        content.textColor = .secondaryLabelColor
        // Keep enough context to make the feed useful while still bounding each
        // card so one long Comunicado cannot consume the entire panel.
        content.maximumNumberOfLines = 10
        content.lineBreakMode = .byTruncatingTail
        content.cell?.wraps = true
        content.cell?.usesSingleLineMode = false
        content.cell?.isScrollable = false
        // AppKit otherwise derives the label's first intrinsic height from its
        // unconstrained, single-line width. Giving it the card's expected text
        // width makes the row grow to its wrapped height (up to ten lines)
        // before it is displayed.
        // Horizontal constraints remain authoritative if the panel width changes.
        content.preferredMaxLayoutWidth = 340
        content.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        content.translatesAutoresizingMaskIntoConstraints = false

        row.addSubview(meta)
        row.addSubview(title)
        row.addSubview(content)
        NSLayoutConstraint.activate([
            meta.leadingAnchor.constraint(equalTo: row.leadingAnchor, constant: 10),
            meta.trailingAnchor.constraint(equalTo: row.trailingAnchor, constant: -10),
            meta.topAnchor.constraint(equalTo: row.topAnchor, constant: 9),
            title.leadingAnchor.constraint(equalTo: row.leadingAnchor, constant: 10),
            title.trailingAnchor.constraint(equalTo: row.trailingAnchor, constant: -10),
            title.topAnchor.constraint(equalTo: meta.bottomAnchor, constant: 5),
            content.leadingAnchor.constraint(equalTo: row.leadingAnchor, constant: 10),
            content.trailingAnchor.constraint(equalTo: row.trailingAnchor, constant: -10),
            content.topAnchor.constraint(equalTo: title.bottomAnchor, constant: 4),
            content.bottomAnchor.constraint(equalTo: row.bottomAnchor, constant: -10),
        ])
        return row
    }

    private func position(_ panel: NSPanel) {
        // Preserve a user-moved panel across empty-feed hiding and app restarts.
        // Only choose the default top-right position when there is no saved
        // position or the screen containing that position was disconnected.
        if hasPositionedPanel,
           NSScreen.screens.contains(where: { $0.visibleFrame.intersects(panel.frame) }) {
            return
        }

        if !hasPositionedPanel,
           let saved = UserDefaults.standard.dictionary(forKey: Self.frameOriginDefaultsKey),
           let x = (saved["x"] as? NSNumber)?.doubleValue,
           let y = (saved["y"] as? NSNumber)?.doubleValue {
            var frame = panel.frame
            frame.origin = NSPoint(x: x, y: y)
            if NSScreen.screens.contains(where: { $0.visibleFrame.intersects(frame) }) {
                panel.setFrameOrigin(frame.origin)
                hasPositionedPanel = true
                return
            }
        }

        let visible = NSScreen.main?.visibleFrame ?? NSScreen.screens.first?.visibleFrame
        guard let visible else {
            panel.center()
            hasPositionedPanel = true
            return
        }
        var frame = panel.frame
        frame.origin.x = visible.maxX - frame.width - 18
        frame.origin.y = visible.maxY - frame.height - 18
        panel.setFrame(frame, display: false)
        hasPositionedPanel = true
    }

    func windowDidMove(_ notification: Notification) {
        guard let movedPanel = notification.object as? NSPanel, movedPanel === panel else { return }
        let origin = movedPanel.frame.origin
        UserDefaults.standard.set(
            ["x": origin.x, "y": origin.y],
            forKey: Self.frameOriginDefaultsKey
        )
        hasPositionedPanel = true
    }

    @objc private func orderDirectionPressed(_ sender: NSSegmentedControl) {
        setOrderDirection(sender.selectedSegment == 1 ? .latestAtBottom : .latestAtTop)
    }

    @objc private func clearPressed() {
        dismissAllItems()
    }

    @objc private func closePressed() {
        setEnabled(false)
    }

    func windowWillClose(_ notification: Notification) {
        guard notification.object as AnyObject? === panel else { return }
        setEnabled(false)
    }

    private func publishState() {
        NotificationCenter.default.post(
            name: Self.stateDidChangeNotification,
            object: self,
            userInfo: [
                "enabled": isEnabled,
                "count": activeCount,
                "activeCount": activeCount,
                "orderDirection": orderDirection.rawValue,
                "visible": panel?.isVisible == true,
            ]
        )
    }

    private static func preview(_ value: String) -> String {
        let normalized = value.replacingOccurrences(of: "\\s+", with: " ", options: .regularExpression)
            .trimmingCharacters(in: .whitespacesAndNewlines)
        if normalized.count <= 260 { return normalized }
        return String(normalized.prefix(259)).trimmingCharacters(in: .whitespacesAndNewlines) + "…"
    }

    private static let timeFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.dateStyle = .none
        formatter.timeStyle = .short
        return formatter
    }()
}
