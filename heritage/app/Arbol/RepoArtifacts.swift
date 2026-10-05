import AppKit
import Carbon

// MARK: - Repo Artifacts

/// “Repo Artifacts” are every regular file below ~/Artifacts/<repo-name> plus
/// Markdown documents below the active repository. Context is shared by all
/// stamped Arbol UI processes so Cmd+R in any active Arbol UI can search the repo
/// selected in another Arbol window.
struct RepoArtifactContext: Equatable, Hashable {
    let repoName: String
    let repoPath: String
    let theme: String

    var artifactRoot: URL {
        FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent("Artifacts", isDirectory: true)
            .appendingPathComponent(repoName, isDirectory: true)
    }
}

struct RepoArtifact: Equatable {
    let path: String
    let displayPath: String
    let name: String
    let accessedAt: TimeInterval
}

enum RepoArtifactStore {
    private static let contextKey = "repo-artifacts-context"
    private static let recentContextsKey = "repo-artifacts-recent-contexts-v1"
    private static let accessKey = "repo-artifacts-access-v1"
    private static var defaults: UserDefaults { UserDefaults(suiteName: "group.arbol") ?? .standard }

    static func setContext(repoPath rawPath: String, repoName rawName: String?, theme: String?) {
        let expanded = (rawPath as NSString).expandingTildeInPath
        guard !expanded.isEmpty else { return }
        let url = URL(fileURLWithPath: expanded).standardizedFileURL
        let name = rawName?.trimmingCharacters(in: .whitespacesAndNewlines)
        let repoName = (name?.isEmpty == false ? name! : url.lastPathComponent)
        guard !repoName.isEmpty else { return }
        let contextValues: [String: Any] = [
            "repo_path": url.path,
            "repo_name": repoName,
            "theme": (theme?.isEmpty == false ? theme! : "redwood"),
            "updated_at": Date().timeIntervalSince1970,
        ]
        defaults.set(contextValues, forKey: contextKey)

        // Keep enough repository history to warm the artifact palette before it
        // is first opened. A chat-session open promotes its repository and also
        // requests a fresh scan, even when it is already the current repo.
        var recent = defaults.array(forKey: recentContextsKey) as? [[String: Any]] ?? []
        recent.removeAll { ($0["repo_path"] as? String) == url.path }
        recent.insert(contextValues, at: 0)
        defaults.set(Array(recent.prefix(4)), forKey: recentContextsKey)
        defaults.synchronize()

        DistributedNotificationCenter.default().postNotificationName(
            .repoArtifactContextDidOpen,
            object: nil,
            userInfo: ["repo_path": url.path, "repo_name": repoName, "theme": contextValues["theme"]!],
            deliverImmediately: true
        )
    }

    static func context() -> RepoArtifactContext? {
        guard let raw = defaults.dictionary(forKey: contextKey),
              let path = raw["repo_path"] as? String, !path.isEmpty else { return nil }
        let url = URL(fileURLWithPath: path).standardizedFileURL
        let name = (raw["repo_name"] as? String).flatMap { $0.isEmpty ? nil : $0 } ?? url.lastPathComponent
        return RepoArtifactContext(repoName: name, repoPath: url.path, theme: (raw["theme"] as? String) ?? "redwood")
    }

    static func recentContexts(limit: Int = 4) -> [RepoArtifactContext] {
        defaults.synchronize()
        let rawContexts = defaults.array(forKey: recentContextsKey) as? [[String: Any]] ?? []
        var seen = Set<String>()
        return rawContexts.compactMap { raw -> RepoArtifactContext? in
            guard let path = raw["repo_path"] as? String, !path.isEmpty else { return nil }
            let url = URL(fileURLWithPath: path).standardizedFileURL
            guard seen.insert(url.path).inserted else { return nil }
            let name = (raw["repo_name"] as? String).flatMap { $0.isEmpty ? nil : $0 } ?? url.lastPathComponent
            return RepoArtifactContext(repoName: name, repoPath: url.path, theme: (raw["theme"] as? String) ?? "redwood")
        }.prefix(max(0, limit)).map { $0 }
    }

    static func context(from userInfo: [AnyHashable: Any]?) -> RepoArtifactContext? {
        guard let raw = userInfo,
              let path = raw["repo_path"] as? String, !path.isEmpty else { return nil }
        let url = URL(fileURLWithPath: path).standardizedFileURL
        let name = (raw["repo_name"] as? String).flatMap { $0.isEmpty ? nil : $0 } ?? url.lastPathComponent
        return RepoArtifactContext(repoName: name, repoPath: url.path, theme: (raw["theme"] as? String) ?? "redwood")
    }

    static func trackAccess(path rawPath: String) {
        let path = URL(fileURLWithPath: (rawPath as NSString).expandingTildeInPath).standardizedFileURL.path
        guard !path.isEmpty, path.lowercased().hasSuffix(".md") || isBelowCurrentArtifactRoot(path) else { return }
        var values = defaults.dictionary(forKey: accessKey) as? [String: Double] ?? [:]
        values[path] = Date().timeIntervalSince1970
        // Keep the preference bounded even after repos/files are removed.
        if values.count > 5_000 {
            values = Dictionary(uniqueKeysWithValues: values.sorted { $0.value > $1.value }.prefix(4_000).map { ($0.key, $0.value) })
        }
        defaults.set(values, forKey: accessKey)
        defaults.synchronize()
    }

    static func accessTimes() -> [String: TimeInterval] {
        // Accesses can be recorded by another stamped Arbol process. Refresh
        // the shared suite before every ranking pass so a cached file index
        // never means cached recency.
        defaults.synchronize()
        return defaults.dictionary(forKey: accessKey) as? [String: Double] ?? [:]
    }

    private static func isBelowCurrentArtifactRoot(_ path: String) -> Bool {
        guard let context = context() else { return false }
        let root = context.artifactRoot.standardizedFileURL.path
        return path == root || path.hasPrefix(root + "/")
    }

    /// Build the filesystem index once, then filter that in-memory snapshot as
    /// the user types. Walking both roots for every keystroke made large repos
    /// queue several expensive scans and left the palette apparently frozen.
    static func scan(context: RepoArtifactContext) -> [RepoArtifact] {
        let fm = FileManager.default
        let repoRoot = URL(fileURLWithPath: context.repoPath).standardizedFileURL
        let artifactRoot = context.artifactRoot.standardizedFileURL
        let access = accessTimes()
        var seen = Set<String>()
        var candidates: [RepoArtifact] = []

        func collect(root: URL, markdownOnly: Bool, label: String) {
            let keys: [URLResourceKey] = [.isRegularFileKey, .isDirectoryKey, .isSymbolicLinkKey, .creationDateKey]
            guard let enumerator = fm.enumerator(
                at: root,
                includingPropertiesForKeys: keys,
                options: [.skipsHiddenFiles, .skipsPackageDescendants],
                errorHandler: { _, _ in true }
            ) else { return }
            for case let url as URL in enumerator {
                if url.path.contains("/.git/") || url.path.contains("/node_modules/") { enumerator.skipDescendants(); continue }
                guard let values = try? url.resourceValues(forKeys: Set(keys)) else { continue }
                if values.isDirectory == true { continue }
                // Resolve only actual symlinks. The previous fallback resolved
                // every non-file entry, including every directory in the repo.
                let isFile = values.isRegularFile == true
                    || (values.isSymbolicLink == true
                        && (try? url.resolvingSymlinksInPath().resourceValues(forKeys: [.isRegularFileKey]).isRegularFile) == true)
                guard isFile else { continue }
                if markdownOnly {
                    let ext = url.pathExtension.lowercased()
                    guard ["md", "markdown", "mdown", "mkd", "mdx"].contains(ext) else { continue }
                }
                let path = url.standardizedFileURL.path
                guard seen.insert(path).inserted else { continue }
                let relative = path.hasPrefix(root.path + "/") ? String(path.dropFirst(root.path.count + 1)) : url.lastPathComponent
                // Artifact files that have never been opened in Arbol start with
                // their filesystem creation time as their latest access time.
                // Repository Markdown keeps the previous zero/unaccessed behavior.
                let initialAccess = markdownOnly ? 0 : (values.creationDate?.timeIntervalSince1970 ?? 0)
                let last = access[path] ?? initialAccess
                candidates.append(RepoArtifact(path: path, displayPath: "\(label)/\(relative)", name: url.lastPathComponent, accessedAt: last))
            }
        }

        collect(root: artifactRoot, markdownOnly: false, label: "~/Artifacts/\(context.repoName)")
        collect(root: repoRoot, markdownOnly: true, label: context.repoName)

        return candidates.sorted {
            if $0.accessedAt != $1.accessedAt { return $0.accessedAt > $1.accessedAt }
            return $0.displayPath.localizedStandardCompare($1.displayPath) == .orderedAscending
        }
    }

    static func filter(_ candidates: [RepoArtifact], query: String, limit: Int = 20) -> [RepoArtifact] {
        let needle = query.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let access = accessTimes()
        let matching = candidates.compactMap { artifact -> (matchRank: Int, artifact: RepoArtifact)? in
            guard let matchRank = artifactMatchRank(needle, artifact: artifact) else { return nil }
            guard let latest = access[artifact.path], latest != artifact.accessedAt else {
                return (matchRank, artifact)
            }
            return (matchRank, RepoArtifact(
                path: artifact.path,
                displayPath: artifact.displayPath,
                name: artifact.name,
                accessedAt: latest
            ))
        }
        // A typed query is relevance-first: an exact filename must not be
        // displaced by recently opened files that only happen to contain a
        // scattered subsequence of the query. With no query, preserve the MRU
        // palette ordering.
        return Array(matching.sorted {
            if !needle.isEmpty, $0.matchRank != $1.matchRank { return $0.matchRank < $1.matchRank }
            if $0.artifact.accessedAt != $1.artifact.accessedAt {
                return $0.artifact.accessedAt > $1.artifact.accessedAt
            }
            return $0.artifact.displayPath.localizedStandardCompare($1.artifact.displayPath) == .orderedAscending
        }.prefix(max(0, limit)).map(\.artifact))
    }

    /// Lower ranks are more relevant. Filename matches are deliberately scored
    /// ahead of path matches: paths tend to be long and make permissive fuzzy
    /// matching look relevant even when the filename is unrelated.
    static func artifactMatchRank(_ needle: String, artifact: RepoArtifact) -> Int? {
        if needle.isEmpty { return 0 }
        let name = artifact.name.lowercased()
        let path = artifact.displayPath.lowercased()

        if name == needle { return 0 }
        if path == needle { return 1 }
        if name.hasPrefix(needle) { return 2 }
        if name.contains(needle) { return 3 }
        if path.contains(needle) { return 4 }
        if fuzzyMatch(needle, in: name) { return 5 }
        if fuzzyMatch(needle, in: path) { return 6 }
        return nil
    }

    static func search(context: RepoArtifactContext, query: String, limit: Int = 20) -> [RepoArtifact] {
        filter(scan(context: context), query: query, limit: limit)
    }

    /// Subsequence matching tolerates separators and missing characters while
    /// still requiring the user's characters in order ("adr" → "architecture/docs/readme").
    static func fuzzyMatch(_ needle: String, in haystack: String) -> Bool {
        if needle.isEmpty { return true }
        if haystack.contains(needle) { return true }
        var index = needle.startIndex
        for character in haystack where index < needle.endIndex {
            if character == needle[index] { index = needle.index(after: index) }
        }
        return index == needle.endIndex
    }
}

extension Notification.Name {
    static let repoArtifactContextDidOpen = Notification.Name("group.arbol.repo-artifact-context-did-open")
    static let repoArtifactIndexDidUpdate = Notification.Name("group.arbol.repo-artifact-index-did-update")
}

/// Process-local, asynchronously refreshed indexes owned by the process that
/// registered Cmd+R. The filesystem walk is expensive; keeping the four most
/// recent repos warm makes opening the palette an in-memory operation.
final class RepoArtifactIndexCache: NSObject {
    static let shared = RepoArtifactIndexCache()

    private let queue = DispatchQueue(label: "group.arbol.repo-artifact-index", qos: .utility)
    private let lock = NSLock()
    private var indexes: [String: [RepoArtifact]] = [:]
    private var generations: [String: Int] = [:]
    private var contextObserver: NSObjectProtocol?
    private var started = false

    func start() {
        lock.lock()
        guard !started else { lock.unlock(); return }
        started = true
        lock.unlock()

        contextObserver = DistributedNotificationCenter.default().addObserver(
            forName: .repoArtifactContextDidOpen,
            object: nil,
            queue: nil
        ) { [weak self] notification in
            guard let context = RepoArtifactStore.context(from: notification.userInfo) else { return }
            self?.refresh(context)
        }

        // MRU order matters: the current/most recent repository should finish
        // warming first. The serial queue avoids four simultaneous tree walks.
        let recent = RepoArtifactStore.recentContexts(limit: 4)
        for context in recent { refresh(context) }
        if recent.isEmpty, let context = RepoArtifactStore.context() { refresh(context) }
    }

    func candidates(for context: RepoArtifactContext) -> [RepoArtifact]? {
        lock.lock()
        defer { lock.unlock() }
        return indexes[context.repoPath]
    }

    func refresh(_ context: RepoArtifactContext) {
        let path = context.repoPath
        lock.lock()
        let generation = (generations[path] ?? 0) + 1
        generations[path] = generation
        lock.unlock()

        queue.async { [weak self] in
            guard let self else { return }
            // Collapse refreshes queued while users move quickly between chat
            // sessions. A refresh already in progress completes, then the newest
            // request performs the final authoritative scan.
            self.lock.lock()
            let isLatest = self.generations[path] == generation
            self.lock.unlock()
            guard isLatest else { return }

            let found = RepoArtifactStore.scan(context: context)
            // Publish a scan that was already running even if another refresh
            // arrived meanwhile. The newer scan is queued immediately after it;
            // exposing this snapshot avoids making the palette wait behind the
            // remaining startup warm-up work.
            self.lock.lock()
            self.indexes[path] = found
            self.lock.unlock()

            DispatchQueue.main.async {
                NotificationCenter.default.post(
                    name: .repoArtifactIndexDidUpdate,
                    object: self,
                    userInfo: ["repo_path": path]
                )
            }
        }
    }

    deinit {
        if let contextObserver {
            DistributedNotificationCenter.default().removeObserver(contextObserver)
        }
    }
}

// MARK: - Detached artifact view

/// Launches each artifact as its own macOS application process. A regular
/// NSWindow is not enough here: Cmd+Tab switches applications, not windows.
/// The build stamps a lightweight "Detached View.app" from the shared shell;
/// every launch starts a new instance of that bundle with its own numbered icon.
final class DetachedArtifactViewLauncher {
    private struct LiveView: Codable {
        let pid: Int32
        let number: Int
        let color: String?
    }

    private static let supportDirectory = FileManager.default.homeDirectoryForCurrentUser
        .appendingPathComponent("Library/Application Support/Arbol", isDirectory: true)
    private static var registryURL: URL { supportDirectory.appendingPathComponent("detached-views.json") }
    private static var lockURL: URL { supportDirectory.appendingPathComponent("detached-views.lock") }
    private static let colors = [
        "E05A47", "D17B22", "B59016", "4F9D69", "258F8B", "3E7CB1",
        "6C63C7", "9B5BC4", "C04F83", "A85D3D", "557A46", "3D8799",
    ]

    /// Open a file selected by an in-app artifact preview. The renderer may
    /// provide its current repository/corpus context; otherwise use the latest
    /// context shared by the Arbol UI processes.
    func open(path rawPath: String, repoName: String?, repoPath: String?, theme: String?) {
        let path = URL(fileURLWithPath: (rawPath as NSString).expandingTildeInPath).standardizedFileURL.path
        guard !path.isEmpty else { return }
        let fallback = RepoArtifactStore.context()
        func nonEmpty(_ value: String?) -> String? {
            let trimmed = value?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            return trimmed.isEmpty ? nil : trimmed
        }
        let normalizedRepoPath = repoPath.flatMap { value -> String? in
            let expanded = (value as NSString).expandingTildeInPath
            return expanded.isEmpty ? nil : URL(fileURLWithPath: expanded).standardizedFileURL.path
        }
        let context = RepoArtifactContext(
            repoName: nonEmpty(repoName) ?? fallback?.repoName
                ?? "Artifacts",
            repoPath: normalizedRepoPath ?? fallback?.repoPath ?? FileManager.default.homeDirectoryForCurrentUser.path,
            theme: nonEmpty(theme) ?? fallback?.theme
                ?? "redwood"
        )
        open(
            RepoArtifact(path: path, displayPath: path, name: URL(fileURLWithPath: path).lastPathComponent, accessedAt: 0),
            context: context
        )
    }

    func open(_ artifact: RepoArtifact, context: RepoArtifactContext) {
        RepoArtifactStore.trackAccess(path: artifact.path)
        let payload: [String: Any] = [
            "path": artifact.path,
            "repo_name": context.repoName,
            "repo_path": context.repoPath,
            "theme": context.theme,
        ]
        guard JSONSerialization.isValidJSONObject(payload),
              let data = try? JSONSerialization.data(withJSONObject: payload),
              let executable = Self.detachedViewExecutable() else {
            Self.showLaunchError("Detached View.app is not installed. Rebuild and reinstall Arbol, then try again.")
            return
        }

        do {
            try FileManager.default.createDirectory(at: Self.supportDirectory, withIntermediateDirectories: true)
            let fd = Darwin.open(Self.lockURL.path, O_CREAT | O_RDWR, 0o644)
            guard fd >= 0 else { throw CocoaError(.fileWriteUnknown) }
            defer { flock(fd, LOCK_UN); Darwin.close(fd) }
            guard flock(fd, LOCK_EX) == 0 else { throw CocoaError(.fileWriteUnknown) }

            let live = Self.readLiveViews().filter { kill($0.pid, 0) == 0 || errno == EPERM }
            let occupied = Set(live.map(\.number))
            let number = (1...).first { !occupied.contains($0) }!
            var availableColors = Self.colors.filter { color in
                !live.contains { $0.color == color }
            }
            if availableColors.isEmpty { availableColors = Self.colors }
            let color = availableColors.randomElement() ?? Self.colors[number % Self.colors.count]

            let process = Process()
            process.executableURL = executable
            process.arguments = [
                "--detached-artifact", data.base64EncodedString(),
                "--detached-number", String(number),
                "--detached-color", color,
            ]
            try process.run()
            Self.writeLiveViews(live + [LiveView(pid: process.processIdentifier, number: number, color: color)])
        } catch {
            Self.showLaunchError("Could not open a detached artifact view: \(error.localizedDescription)")
        }
    }

    private static func detachedViewExecutable() -> URL? {
        let appName = "Detached View.app"
        let sibling = Bundle.main.bundleURL.deletingLastPathComponent().appendingPathComponent(appName)
        let candidates = [
            sibling,
            FileManager.default.homeDirectoryForCurrentUser
                .appendingPathComponent("Applications/Arbol/apps", isDirectory: true)
                .appendingPathComponent(appName),
        ]
        for app in candidates {
            if let bundle = Bundle(url: app), let executable = bundle.executableURL,
               FileManager.default.isExecutableFile(atPath: executable.path) { return executable }
        }
        return nil
    }

    private static func readLiveViews() -> [LiveView] {
        guard let data = try? Data(contentsOf: registryURL) else { return [] }
        return (try? JSONDecoder().decode([LiveView].self, from: data)) ?? []
    }

    private static func writeLiveViews(_ views: [LiveView]) {
        guard let data = try? JSONEncoder().encode(views) else { return }
        try? data.write(to: registryURL, options: .atomic)
    }

    private static func showLaunchError(_ message: String) {
        let alert = NSAlert()
        alert.messageText = "Could not open Detached View"
        alert.informativeText = message
        alert.runModal()
    }
}

// MARK: - Cmd+R search popup

final class RepoArtifactsHotkeyController: NSObject {
    private var keyMonitor: Any?
    private lazy var popup = RepoArtifactSearchController()

    func installIfAvailable() {
        guard keyMonitor == nil else { return }
        RepoArtifactIndexCache.shared.start()
        // Cmd+R is an Arbol app shortcut, not a system-wide hotkey. A local
        // monitor receives events only while this stamped Arbol UI is active,
        // so other applications retain their normal Reload shortcut.
        keyMonitor = NSEvent.addLocalMonitorForEvents(matching: .keyDown) { [weak self] event in
            guard Self.shouldHandle(event: event, hasVisibleWindow: NSApp.windows.contains(where: \.isVisible)) else {
                return event
            }
            self?.popup.toggle()
            return nil
        }
    }

    static func shouldHandle(event: NSEvent, hasVisibleWindow: Bool) -> Bool {
        guard hasVisibleWindow, event.keyCode == UInt16(kVK_ANSI_R) else { return false }
        return event.modifierFlags.intersection(.deviceIndependentFlagsMask) == [.command]
    }

    deinit {
        if let keyMonitor { NSEvent.removeMonitor(keyMonitor) }
    }
}

final class RepoArtifactSearchPanel: NSPanel {
    var handleKeyDown: ((NSEvent) -> Bool)?

    override var canBecomeKey: Bool { true }
    override var canBecomeMain: Bool { false }

    override func sendEvent(_ event: NSEvent) {
        if event.type == .keyDown, handleKeyDown?(event) == true { return }
        super.sendEvent(event)
    }
}

final class RepoArtifactSearchController: NSObject, NSSearchFieldDelegate, NSTableViewDataSource, NSTableViewDelegate {
    private var panel: RepoArtifactSearchPanel?
    private let searchField = NSSearchField()
    private let table = NSTableView()
    private let subtitle = NSTextField(labelWithString: "")
    private let emptyLabel = NSTextField(labelWithString: "")
    private let pageController = DetachedArtifactViewLauncher()
    private var context: RepoArtifactContext?
    private var rows: [RepoArtifact] = []
    private var candidates: [RepoArtifact] = []
    private var indexedContext: RepoArtifactContext?
    private var searchGeneration = 0
    private var keyMonitor: Any?
    private var localOutsideClickMonitor: Any?
    private var globalOutsideClickMonitor: Any?
    private var appDeactivateObserver: NSObjectProtocol?
    private var indexObserver: NSObjectProtocol?

    override init() {
        super.init()
        indexObserver = NotificationCenter.default.addObserver(
            forName: .repoArtifactIndexDidUpdate,
            object: RepoArtifactIndexCache.shared,
            queue: .main
        ) { [weak self] notification in
            self?.indexDidUpdate(notification)
        }
    }

    deinit {
        if let indexObserver { NotificationCenter.default.removeObserver(indexObserver) }
        removeKeyMonitor()
        removeOutsideClickDismissal()
    }

    func toggle() {
        if panel?.isVisible == true { dismiss() } else { show() }
    }

    func show() {
        guard let context = RepoArtifactStore.context() else {
            let alert = NSAlert()
            alert.messageText = "No current repository"
            alert.informativeText = "Select a repository in Arbol first, then press Cmd+R again."
            alert.runModal()
            return
        }
        self.context = context
        let panel = ensurePanel()
        subtitle.stringValue = "Repo Artifacts · \(context.repoName)"
        searchField.stringValue = ""
        rows = []
        table.reloadData()
        if let cached = RepoArtifactIndexCache.shared.candidates(for: context) {
            indexedContext = context
            candidates = cached
            emptyLabel.stringValue = ""
            emptyLabel.isHidden = true
        } else {
            indexedContext = nil
            candidates = []
            emptyLabel.stringValue = "Loading repo artifacts…"
            emptyLabel.isHidden = false
            // Normally startup/session-open preloading has already populated the
            // cache. This fallback covers a first launch with no repository MRU.
            RepoArtifactIndexCache.shared.refresh(context)
        }
        position(panel)
        NSApp.activate(ignoringOtherApps: true)
        panel.makeKeyAndOrderFront(nil)
        panel.makeFirstResponder(searchField)
        installKeyMonitor()
        installOutsideClickDismissal()
        if indexedContext == context { runSearch("") }
    }

    @objc private func dismiss() {
        guard panel?.isVisible == true else { return }
        searchGeneration += 1
        removeKeyMonitor()
        removeOutsideClickDismissal()
        panel?.orderOut(nil)
    }

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

    private func installOutsideClickDismissal() {
        removeOutsideClickDismissal()
        let mouseDownMask: NSEvent.EventTypeMask = [.leftMouseDown, .rightMouseDown, .otherMouseDown]

        // Every stamped Arbol UI is a separate process. The local monitor covers
        // other windows in this process; the global monitor covers clicks in the
        // other Arbol UI processes (and other apps) without consuming the click.
        localOutsideClickMonitor = NSEvent.addLocalMonitorForEvents(matching: mouseDownMask) { [weak self] event in
            guard let self else { return event }
            if event.window !== self.panel {
                DispatchQueue.main.async { [weak self] in self?.dismiss() }
            }
            return event
        }
        globalOutsideClickMonitor = NSEvent.addGlobalMonitorForEvents(matching: mouseDownMask) { [weak self] _ in
            DispatchQueue.main.async { [weak self] in self?.dismiss() }
        }

        // Clicking another Arbol UI also deactivates the popup-owning process.
        // Keep this as a reliable fallback when global event monitoring is not
        // available under the current macOS privacy settings.
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

    private func handleKeyDown(_ event: NSEvent) -> Bool {
        guard panel?.isVisible == true else { return false }
        switch event.keyCode {
        case UInt16(kVK_Escape): dismiss(); return true
        case UInt16(kVK_UpArrow): moveSelection(by: -1); return true
        case UInt16(kVK_DownArrow): moveSelection(by: 1); return true
        case UInt16(kVK_Return), UInt16(kVK_ANSI_KeypadEnter): openSelected(); return true
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

    private func ensurePanel() -> RepoArtifactSearchPanel {
        if let panel { return panel }
        let panel = RepoArtifactSearchPanel(
            contentRect: NSRect(x: 0, y: 0, width: 680, height: 590),
            styleMask: [.titled, .closable, .fullSizeContentView],
            backing: .buffered,
            defer: false
        )
        panel.titleVisibility = .hidden
        panel.titlebarAppearsTransparent = true
        panel.level = .floating
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .transient]
        panel.isReleasedWhenClosed = false
        panel.standardWindowButton(.closeButton)?.target = self
        panel.standardWindowButton(.closeButton)?.action = #selector(dismiss)
        // Keep native close and table interaction available. Keyboard handling
        // below still provides the fast palette workflow.
        panel.ignoresMouseEvents = false
        panel.handleKeyDown = { [weak self] event in self?.handleKeyDown(event) ?? false }

        let root = NSView()
        root.wantsLayer = true
        root.layer?.backgroundColor = NSColor.windowBackgroundColor.cgColor
        panel.contentView = root

        let title = NSTextField(labelWithString: "Search Repo Artifacts")
        title.font = .systemFont(ofSize: 20, weight: .semibold)
        subtitle.font = .monospacedSystemFont(ofSize: 11, weight: .medium)
        subtitle.textColor = .secondaryLabelColor
        searchField.placeholderString = "Fuzzy-search paths and filenames"
        searchField.font = .systemFont(ofSize: 15)
        searchField.delegate = self
        // Do not attach `openSelected` as the field action. NSTextField may send
        // its action when editing ends (for example, during focus/window
        // changes), which can open the selected artifact without an explicit
        // Return key press. Return is handled exclusively in doCommandBy below.
        searchField.target = nil
        searchField.action = nil

        let column = NSTableColumn(identifier: NSUserInterfaceItemIdentifier("artifact"))
        column.resizingMask = .autoresizingMask
        table.addTableColumn(column)
        table.headerView = nil
        table.rowHeight = 48
        table.intercellSpacing = NSSize(width: 0, height: 2)
        table.backgroundColor = .clear
        table.selectionHighlightStyle = .regular
        table.delegate = self
        table.dataSource = self
        let scroll = NSScrollView()
        scroll.documentView = table
        scroll.hasVerticalScroller = true
        scroll.drawsBackground = false

        emptyLabel.font = .systemFont(ofSize: 13, weight: .medium)
        emptyLabel.textColor = .secondaryLabelColor
        emptyLabel.alignment = .center
        emptyLabel.lineBreakMode = .byTruncatingTail
        emptyLabel.isHidden = true

        let footer = NSTextField(labelWithString: "↑/↓ select · Enter open · Esc close · top 20 by recent access")
        footer.font = .monospacedSystemFont(ofSize: 10.5, weight: .medium)
        footer.textColor = .tertiaryLabelColor

        [title, subtitle, searchField, scroll, emptyLabel, footer].forEach { $0.translatesAutoresizingMaskIntoConstraints = false; root.addSubview($0) }
        NSLayoutConstraint.activate([
            title.topAnchor.constraint(equalTo: root.topAnchor, constant: 34), title.leadingAnchor.constraint(equalTo: root.leadingAnchor, constant: 22),
            subtitle.centerYAnchor.constraint(equalTo: title.centerYAnchor), subtitle.trailingAnchor.constraint(equalTo: root.trailingAnchor, constant: -22),
            searchField.topAnchor.constraint(equalTo: title.bottomAnchor, constant: 14), searchField.leadingAnchor.constraint(equalTo: root.leadingAnchor, constant: 20), searchField.trailingAnchor.constraint(equalTo: root.trailingAnchor, constant: -20),
            scroll.topAnchor.constraint(equalTo: searchField.bottomAnchor, constant: 14), scroll.leadingAnchor.constraint(equalTo: root.leadingAnchor, constant: 14), scroll.trailingAnchor.constraint(equalTo: root.trailingAnchor, constant: -14), scroll.bottomAnchor.constraint(equalTo: footer.topAnchor, constant: -8),
            emptyLabel.centerXAnchor.constraint(equalTo: scroll.centerXAnchor), emptyLabel.centerYAnchor.constraint(equalTo: scroll.centerYAnchor), emptyLabel.leadingAnchor.constraint(greaterThanOrEqualTo: scroll.leadingAnchor, constant: 20), emptyLabel.trailingAnchor.constraint(lessThanOrEqualTo: scroll.trailingAnchor, constant: -20),
            footer.leadingAnchor.constraint(equalTo: root.leadingAnchor, constant: 22), footer.trailingAnchor.constraint(equalTo: root.trailingAnchor, constant: -22), footer.bottomAnchor.constraint(equalTo: root.bottomAnchor, constant: -14), footer.heightAnchor.constraint(equalToConstant: 16),
        ])
        self.panel = panel
        return panel
    }

    func controlTextDidChange(_ obj: Notification) { runSearch(searchField.stringValue) }

    private func indexDidUpdate(_ notification: Notification) {
        guard let context,
              (notification.userInfo?["repo_path"] as? String) == context.repoPath,
              let cached = RepoArtifactIndexCache.shared.candidates(for: context) else { return }
        indexedContext = context
        candidates = cached
        guard panel?.isVisible == true else { return }
        runSearch(searchField.stringValue)
    }

    private func runSearch(_ query: String) {
        guard indexedContext == context else { return }
        searchGeneration += 1
        let generation = searchGeneration
        let snapshot = candidates
        DispatchQueue.global(qos: .userInitiated).async {
            let found = RepoArtifactStore.filter(snapshot, query: query, limit: 20)
            DispatchQueue.main.async { [weak self] in
                guard let self, generation == self.searchGeneration, self.panel?.isVisible == true else { return }
                self.rows = found
                self.table.reloadData()
                let trimmedQuery = query.trimmingCharacters(in: .whitespacesAndNewlines)
                self.emptyLabel.stringValue = trimmedQuery.isEmpty ? "No repo artifacts found" : "No search results for ‘\(trimmedQuery)’"
                self.emptyLabel.isHidden = !found.isEmpty
                if !found.isEmpty {
                    self.table.selectRowIndexes(IndexSet(integer: 0), byExtendingSelection: false)
                } else {
                    self.table.deselectAll(nil)
                }
            }
        }
    }

    func numberOfRows(in tableView: NSTableView) -> Int { rows.count }

    func tableView(_ tableView: NSTableView, viewFor tableColumn: NSTableColumn?, row: Int) -> NSView? {
        guard rows.indices.contains(row) else { return nil }
        let artifact = rows[row]
        let id = NSUserInterfaceItemIdentifier("ArtifactCell")
        let cell = (tableView.makeView(withIdentifier: id, owner: self) as? NSTableCellView) ?? {
            let view = NSTableCellView()
            view.identifier = id
            let name = NSTextField(labelWithString: "")
            name.tag = 1; name.font = .systemFont(ofSize: 13.5, weight: .semibold); name.lineBreakMode = .byTruncatingTail
            let path = NSTextField(labelWithString: "")
            path.tag = 2; path.font = .monospacedSystemFont(ofSize: 10.5, weight: .regular); path.textColor = .secondaryLabelColor; path.lineBreakMode = .byTruncatingMiddle
            [name, path].forEach { $0.translatesAutoresizingMaskIntoConstraints = false; view.addSubview($0) }
            NSLayoutConstraint.activate([
                name.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 10), name.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -10), name.topAnchor.constraint(equalTo: view.topAnchor, constant: 6),
                path.leadingAnchor.constraint(equalTo: name.leadingAnchor), path.trailingAnchor.constraint(equalTo: name.trailingAnchor), path.topAnchor.constraint(equalTo: name.bottomAnchor, constant: 3),
            ])
            return view
        }()
        (cell.viewWithTag(1) as? NSTextField)?.stringValue = artifact.name
        (cell.viewWithTag(2) as? NSTextField)?.stringValue = artifact.displayPath
        return cell
    }

    private func openSelected() {
        // Requiring a visible panel also prevents a held/repeated Return event
        // from opening additional windows after the first one closes the popup.
        guard panel?.isVisible == true else { return }
        let index = table.selectedRow >= 0 ? table.selectedRow : 0
        guard rows.indices.contains(index), let context else { return }
        dismiss()
        pageController.open(rows[index], context: context)
    }

    private func position(_ panel: NSPanel) {
        let visible = (NSScreen.main ?? NSScreen.screens.first)?.visibleFrame ?? NSRect(x: 0, y: 0, width: 1440, height: 900)
        panel.setFrameOrigin(NSPoint(x: round(visible.midX - panel.frame.width / 2), y: round(visible.midY - panel.frame.height / 2 + 30)))
    }

    func control(_ control: NSControl, textView: NSTextView, doCommandBy commandSelector: Selector) -> Bool {
        switch commandSelector {
        case #selector(NSResponder.moveDown(_:)):
            table.selectRowIndexes(IndexSet(integer: min(max(0, table.selectedRow + 1), max(0, rows.count - 1))), byExtendingSelection: false); return true
        case #selector(NSResponder.moveUp(_:)):
            table.selectRowIndexes(IndexSet(integer: max(0, table.selectedRow - 1)), byExtendingSelection: false); return true
        case #selector(NSResponder.insertNewline(_:)),
             #selector(NSResponder.insertNewlineIgnoringFieldEditor(_:)):
            openSelected(); return true
        case #selector(NSResponder.cancelOperation(_:)):
            dismiss(); return true
        default: return false
        }
    }
}
