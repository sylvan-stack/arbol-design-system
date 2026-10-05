import AppKit
import SwiftUI
import Darwin
import Carbon
import UserNotifications
import WebKit

/// Each Arbol UI ships as its OWN macOS app (own bundle id + name → its own
/// Cmd-Tab / Dock entry). One shared shell binary; the per-app `ArbolUI`
/// Info.plist key selects which renderer bundle to load + the window title.
/// The shell itself registers global Hyper shortcuts (⌘⌥⇧⌃S/O/W/E, see
/// `UISwitcherHotkeysController`) that open/activate these apps. A resident
/// LaunchAgent (`com.arbol.ui-switcher`, `--ui-switcher-agent`) runs the same
/// binary so the shortcuts also cold-start UIs when no Arbol UI is running;
/// UI processes defer to it via the shared singleton lock and take the
/// hotkeys back if the agent dies. App-wide utility shortcuts live in this shell.
struct UISpec {
    let bundle: String
    let title: String
}

let UI_SPECS: [String: UISpec] = [
    "oaken":  UISpec(bundle: "oaken",  title: "Oaken"),
    "elma":   UISpec(bundle: "elma",   title: "Elma Chat"),
    "willo":  UISpec(bundle: "willo",  title: "Willo Station"),
    "seqoya": UISpec(bundle: "seqoya", title: "Seqoya Lab"),
]

let ARBOL_UI_KEY = (Bundle.main.object(forInfoDictionaryKey: "ArbolUI") as? String) ?? "seqoya"

/// Resident UI-switcher mode (`scripts/install-ui-switcher.sh`): a windowless
/// LaunchAgent process that only hosts the global UI hotkeys so they work
/// before/without any Arbol UI. Same shell binary, no separate bundle.
let ARBOL_IS_UI_SWITCHER_AGENT = ProcessInfo.processInfo.arguments.contains("--ui-switcher-agent")

/// Process-lifetime, per-UI lock. LaunchServices normally keeps an application
/// bundle single-instance, but `open -n`, development builds, and duplicate app
/// installations can bypass that guarantee. Since those copies may have distinct
/// bundle identifiers, key the lock by Arbol's UI species instead.
final class ArbolUIInstanceLock {
    enum Acquisition: Equatable {
        case acquired
        case alreadyRunning
        case unavailable
    }

    private let ui: String
    private let directory: URL
    private var lockFD: Int32 = -1

    init(ui: String, directory: URL? = nil) {
        self.ui = ui
        self.directory = directory ?? FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent("Library/Application Support/Arbol")
    }

    deinit {
        if lockFD >= 0 { close(lockFD) }
    }

    func acquire() -> Acquisition {
        if lockFD >= 0 { return .acquired }
        do {
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        } catch {
            return .unavailable
        }
        let path = directory.appendingPathComponent("ui-\(ui).lock").path
        let fd = open(path, O_CREAT | O_RDWR, 0o644)
        guard fd >= 0 else { return .unavailable }
        guard flock(fd, LOCK_EX | LOCK_NB) == 0 else {
            let contention = errno == EWOULDBLOCK || errno == EAGAIN
            close(fd)
            return contention ? .alreadyRunning : .unavailable
        }
        lockFD = fd
        return .acquired
    }
}

private func lastActiveArbolUIURL() -> URL {
    FileManager.default.homeDirectoryForCurrentUser
        .appendingPathComponent("Library/Application Support/Arbol/last-active-ui")
}

private func readLastActiveArbolUI() -> String? {
    guard let value = try? String(contentsOf: lastActiveArbolUIURL(), encoding: .utf8)
        .trimmingCharacters(in: .whitespacesAndNewlines),
          UI_SPECS[value] != nil else { return nil }
    return value
}

private func recordLastActiveArbolUI() {
    let url = lastActiveArbolUIURL()
    try? FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
    try? (ARBOL_UI_KEY + "\n").write(to: url, atomically: true, encoding: .utf8)
}

/// Single status-bar controller for Arbol-wide lifecycle actions. The shell app
/// is stamped into four separate UI bundles; to avoid four duplicate menu-bar
/// icons when multiple UIs are open, every UI is allowed to try to host the tray
/// item, but a cross-process singleton lock ensures only one live process wins.
///
/// This keeps the tray visible whenever *any* Arbol UI is running. Previously
/// only Seqoya installed it, so launching Elma/Willo/Oaken without Seqoya left
/// Arbol running with no menu-bar icon.
final class ArbolTrayController: NSObject {
    private enum CoreHealthStatus {
        case starting(String)
        case online(version: String?, pid: Int?, uptimeSeconds: Int?)
        case offline(String)
    }

    private var statusItem: NSStatusItem?
    private var coreStatusMenuItem: NSMenuItem?
    private var buildInfoMenuItem: NSMenuItem?
    private var rebuildAndRestartMenuItem: NSMenuItem?
    private var rebuildWorktreeMenuItem: NSMenuItem?
    private var olderBuildsMenuItem: NSMenuItem?
    private var healthTimer: Timer?
    private var trayAcquireRetryTimer: Timer?
    private var coreHealthProbeInFlight = false
    private var actionItems: [NSMenuItem] = []
    /// Held for the process lifetime by whichever Arbol UI instance owns the tray
    /// (see `acquireSingletonTrayLock`). Never closed — the OS releases the
    /// advisory lock when the process exits, freeing the slot for another running or later-launched UI.
    private var trayLockFD: Int32 = -1

    func installIfAvailable() {
        guard statusItem == nil else {
            trayAcquireRetryTimer?.invalidate()
            trayAcquireRetryTimer = nil
            return
        }
        // Every stamped Arbol UI may host the tray. A cross-process advisory lock
        // makes the tray a true singleton: only the first live UI to grab it
        // installs the icon; any concurrent instance skips it. Allowing all UIs
        // to try fixes the "Arbol is running but no tray icon" case where only
        // Elma/Willo/Oaken is open and Seqoya is not.
        //
        // Losers keep retrying: if the current tray-host UI quits while another
        // Arbol UI stays open, the released lock is picked up and the icon comes
        // back without requiring the user to launch Seqoya/restart everything.
        guard acquireSingletonTrayLock() else {
            scheduleTrayAcquireRetry()
            return
        }
        trayAcquireRetryTimer?.invalidate()
        trayAcquireRetryTimer = nil

        let item = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
        item.button?.image = Self.oakTreeImage()
        item.button?.imagePosition = .imageOnly
        item.button?.toolTip = "Arbol — Core status unknown"
        if #available(macOS 10.14, *) { item.button?.contentTintColor = .systemOrange }

        let menu = NSMenu()
        let coreStatus = NSMenuItem(title: "Arbol Core: Checking…", action: nil, keyEquivalent: "")
        let buildInfo = NSMenuItem(title: "", action: nil, keyEquivalent: "")
        buildInfo.attributedTitle = Self.buildInfoAttributedTitle()
        buildInfo.isEnabled = false
        buildInfoMenuItem = buildInfo
        coreStatus.isEnabled = false
        coreStatusMenuItem = coreStatus
        menu.addItem(coreStatus)
        menu.addItem(buildInfo)
        menu.addItem(.separator())

        let openDashboard = NSMenuItem(title: "Open Arbol Dashboard", action: #selector(openArbolDashboard(_:)), keyEquivalent: "")
        openDashboard.target = self
        let restartCore = NSMenuItem(title: "Restart Arbol Core", action: #selector(restartArbolCore(_:)), keyEquivalent: "")
        restartCore.target = self
        let restartEffector = NSMenuItem(title: "Restart Arbol Effector", action: #selector(restartArbolEffector(_:)), keyEquivalent: "")
        restartEffector.target = self
        let restartUIs = NSMenuItem(title: "Restart all UIs", action: #selector(restartAllUIs(_:)), keyEquivalent: "")
        restartUIs.target = self
        // AppKit does not dispatch an item's action when that item owns a
        // submenu. Keep the primary rebuild as a direct, one-click action and
        // expose explicit source overrides in a separate adjacent submenu.
        let rebuildAndRestart = NSMenuItem(title: "Rebuild and Restart", action: #selector(rebuildActiveWorktree(_:)), keyEquivalent: "")
        rebuildAndRestart.target = self
        rebuildAndRestartMenuItem = rebuildAndRestart
        let fixBuild = NSMenuItem(title: "Fix Build…", action: #selector(fixBuild(_:)), keyEquivalent: "")
        fixBuild.target = self
        fixBuild.toolTip = "Run a one-shot repair agent from the last successful Arbol build"
        let olderBuilds = NSMenuItem(title: "Run older build", action: nil, keyEquivalent: "")
        olderBuildsMenuItem = olderBuilds
        let nameBuild = NSMenuItem(title: "Name this build…", action: #selector(nameCurrentBuild(_:)), keyEquivalent: "")
        nameBuild.target = self
        let removeOldBuilds = NSMenuItem(title: "Remove old builds", action: #selector(removeOldBuilds(_:)), keyEquivalent: "")
        removeOldBuilds.target = self
        // Worktrees can be added or removed while Arbol is running. Build this
        // submenu now and refresh it whenever the tray opens.
        refreshOlderBuildsMenu()
        let quit = NSMenuItem(title: "Quit Arbol", action: #selector(quitArbol(_:)), keyEquivalent: "")
        quit.target = self

        // The three quick restarts act on the *installed* artifacts; the rebuild
        // action runs from source, so it is set apart by a divider. Rebuild and
        // Restart intentionally takes the strong path for everything whose state
        // lives in the DB (UIs/core/effector), while preserving the one hard
        // safety boundary: Provider Instances with running agents are never
        // killed; they keep serving their pinned sockets until they drain.
        //
        // Quit sits below its own divider as the terminal action: unlike the
        // restarts it tears the whole system DOWN — every daemon is booted out
        // and every UI (including this tray host) is closed.
        //
        // Rebuild and Restart is deliberately NOT in actionItems: it is the
        // recovery hammer, and the states that bulk-disable actionItems (an
        // in-flight menu action, a wedged restart, a failed older-build swap)
        // are exactly the states it recovers from. Duplicate rebuild clicks use
        // rebuild.lock, while the shared deployment-controller lock serializes
        // rebuilds with quick restarts and archived-build swaps.
        actionItems = [openDashboard, restartCore, restartEffector, restartUIs, fixBuild, olderBuilds, nameBuild, removeOldBuilds, quit]
        menu.addItem(openDashboard)
        menu.addItem(.separator())
        [restartCore, restartEffector, restartUIs].forEach { menu.addItem($0) }
        menu.addItem(.separator())
        menu.addItem(rebuildAndRestart)
        menu.addItem(fixBuild)
        menu.addItem(olderBuilds)
        menu.addItem(nameBuild)
        menu.addItem(removeOldBuilds)
        menu.addItem(.separator())
        menu.addItem(quit)
        menu.delegate = self
        item.menu = menu
        statusItem = item
        startCoreHealthPolling()
    }

    private func scheduleTrayAcquireRetry() {
        guard trayAcquireRetryTimer == nil else { return }
        let timer = Timer.scheduledTimer(withTimeInterval: 5.0, repeats: true) { [weak self] _ in
            self?.installIfAvailable()
        }
        timer.tolerance = 1.0
        trayAcquireRetryTimer = timer
    }

    /// Take a non-blocking, exclusive advisory lock on a well-known file so that
    /// exactly one Arbol process hosts the menu-bar icon at a time. Returns true
    /// for the single owner; false if another live instance already holds it.
    ///
    /// `flock` is released automatically when this process exits (the fd is never
    /// closed), so quitting the owner frees the slot for another UI launch. We
    /// fail OPEN — if the lock file can't be opened we still install the icon,
    /// because losing the tray is worse than a rare duplicate.
    private func acquireSingletonTrayLock() -> Bool {
        let dir = FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent("Library/Application Support/Arbol")
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        let lockPath = dir.appendingPathComponent("tray.lock").path
        let fd = open(lockPath, O_CREAT | O_RDWR, 0o644)
        guard fd >= 0 else { return true } // fail open: never lose the tray
        if flock(fd, LOCK_EX | LOCK_NB) != 0 {
            close(fd)
            return false // another live Seqoya instance owns the tray
        }
        trayLockFD = fd
        return true
    }

    @objc private func openArbolDashboard(_ sender: NSMenuItem) {
        Task { @MainActor in
            let result = await DashboardTimelineBridge.shared.openDashboard(activate: true)
            if (result["ok"] as? Bool) != true {
                Self.showError(
                    title: "Open Arbol Dashboard",
                    message: result["error"] as? String ?? "Arbol Dashboard could not be opened."
                )
            }
        }
    }

    @objc private func restartArbolCore(_ sender: NSMenuItem) {
        updateCoreHealth(.starting("Restarting…"))
        performMenuAction(sender) { try Self.restartInstalledRuntime(component: "core") }
    }

    @objc private func restartArbolEffector(_ sender: NSMenuItem) {
        performMenuAction(sender) { try Self.restartInstalledRuntime(component: "effector") }
    }

    @objc private func restartAllUIs(_ sender: NSMenuItem) {
        performMenuAction(sender) { try Self.restartAllUIApps() }
    }

    @objc private func rebuildFromWorktree(_ sender: NSMenuItem) {
        guard let path = sender.representedObject as? String else { return }
        performMenuAction(sender) { try Self.launchRebuildAndRestart(from: path) }
    }

    @objc private func fixBuild(_ sender: NSMenuItem) {
        let alert = NSAlert()
        alert.messageText = "Fix Build"
        alert.informativeText = "Describe the failed build. A separate one-shot repair agent from the last successful Arbol build will inspect this checkout, fix it, and rebuild Arbol."
        let prompt = NSTextView(frame: NSRect(x: 0, y: 0, width: 480, height: 150))
        prompt.isRichText = false
        prompt.font = NSFont.systemFont(ofSize: NSFont.systemFontSize)
        prompt.string = "The Arbol build is failing. Reproduce the failure, fix its root cause, run relevant tests, then rebuild and restart Arbol."
        let scroll = NSScrollView(frame: prompt.frame)
        scroll.hasVerticalScroller = true
        scroll.borderType = .bezelBorder
        scroll.documentView = prompt
        alert.accessoryView = scroll
        alert.addButton(withTitle: "Start Fix Build")
        alert.addButton(withTitle: "Cancel")
        guard alert.runModal() == .alertFirstButtonReturn else { return }
        let text = prompt.string.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else {
            Self.showError(title: "Fix Build", message: "Describe the build failure before starting the repair agent.")
            return
        }
        performMenuAction(sender) { try Self.launchFixBuild(prompt: text) }
    }

    @objc private func rebuildActiveWorktree(_ sender: NSMenuItem) {
        performMenuAction(sender) { try Self.launchRebuildAndRestart(from: Self.resolveRepoRoot()) }
    }

    private func refreshRebuildWorktreeMenu() {
        guard let parent = rebuildWorktreeMenuItem else { return }
        let submenu = NSMenu()
        let worktrees = Self.listArbolWorktrees()
        let activePath = Self.activeRebuildWorktree(from: worktrees)?.path
        rebuildAndRestartMenuItem?.toolTip = activePath.map { "Rebuild from currently active worktree: \($0)" }
            ?? "Rebuild from the configured repo checkout"
        // Always enabled: this is the recovery action, so a transient worktree
        // detection failure must not take it away. With no detectable active
        // worktree the action falls back to the configured repo root and
        // surfaces a clear error there if that is missing too.
        rebuildAndRestartMenuItem?.isEnabled = true
        parent.isEnabled = !worktrees.isEmpty
        if worktrees.isEmpty {
            let unavailable = NSMenuItem(title: "No buildable worktrees found", action: nil, keyEquivalent: "")
            unavailable.isEnabled = false
            submenu.addItem(unavailable)
        } else {
            for worktree in worktrees {
                let item = NSMenuItem(title: worktree.name, action: #selector(rebuildFromWorktree(_:)), keyEquivalent: "")
                item.target = self
                item.representedObject = worktree.path
                item.state = worktree.path == activePath ? .on : .off
                item.toolTip = worktree.branch == worktree.name
                    ? worktree.path
                    : "\(worktree.branch) — \(worktree.path)"
                submenu.addItem(item)
            }
        }
        parent.submenu = submenu
    }

    struct ArchivedBuild: Equatable {
        let buildID: String
        let name: String
        let effectiveStart: String
        let effectiveEnd: String?
        let builtAt: String?
        let archivedAt: String?
        let isCurrent: Bool
    }

    static func parseArchivedBuilds(_ data: Data, installedBuildID: String? = nil) -> [ArchivedBuild] {
        guard let rows = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]] else { return [] }
        func string(_ row: [String: Any], _ key: String) -> String? {
            (row[key] as? String).flatMap { $0.isEmpty ? nil : $0 }
        }
        return rows.compactMap { row in
            guard let buildID = row["build_id"] as? String, !buildID.isEmpty,
                  let name = row["name"] as? String, !name.isEmpty,
                  let start = row["effective_start"] as? String, !start.isEmpty else { return nil }
            return ArchivedBuild(buildID: buildID, name: name, effectiveStart: start,
                                 effectiveEnd: string(row, "effective_end"),
                                 builtAt: string(row, "built_at"),
                                 archivedAt: string(row, "archived_at"),
                                 isCurrent: buildID == installedBuildID)
        }
    }

    /// When this build entered history: its build time, with the archive time
    /// as fallback for metadata written before ``built_at`` was recorded.
    static func archivedBuildIntroduced(_ build: ArchivedBuild, calendar: Calendar = .current) -> Date? {
        if let builtAt = build.builtAt {
            // build.sh writes a local wall-clock timestamp in this fixed format.
            let parser = DateFormatter()
            parser.locale = Locale(identifier: "en_US_POSIX")
            parser.calendar = calendar
            parser.timeZone = calendar.timeZone
            parser.dateFormat = "yyyy-MM-dd HH:mm"
            if let date = parser.date(from: builtAt) { return date }
        }
        return build.archivedAt.flatMap { ISO8601DateFormatter().date(from: $0) }
    }

    /// Menu rows for the build history. Each build's span is the interval it
    /// was the *newest* build — from its build time until the next build was
    /// introduced — not its most recent activation: re-running an archived
    /// build must not make it look newer than the builds that replaced it.
    static func archivedBuildMenuRows(
        _ builds: [ArchivedBuild],
        now: Date = Date(),
        calendar: Calendar = .current
    ) -> [(build: ArchivedBuild, title: String)] {
        let ordered = builds
            .map { (build: $0, introduced: archivedBuildIntroduced($0, calendar: calendar)) }
            .sorted {
                switch ($0.introduced, $1.introduced) {
                case let (first?, second?): return first > second
                case (_?, nil): return true
                case (nil, _?): return false
                // No dates at all: keep a stable order by id (ids sort by build time).
                case (nil, nil): return $0.build.buildID > $1.build.buildID
                }
            }
        return ordered.enumerated().map { index, entry in
            let start = entry.introduced.map { formatMenuDate($0, relativeTo: now, calendar: calendar) }
                ?? entry.build.builtAt ?? entry.build.archivedAt ?? "unknown"
            let end = index == 0 ? "now" : (
                ordered[index - 1].introduced.map { formatMenuDate($0, relativeTo: now, calendar: calendar) }
                    ?? "unknown"
            )
            return (entry.build, "\(entry.build.name) · \(start) – \(end)")
        }
    }

    private static func formatEffectiveDate(
        _ value: String,
        relativeTo now: Date? = nil,
        calendar: Calendar = .current
    ) -> String {
        guard let date = ISO8601DateFormatter().date(from: value) else { return value }
        return formatMenuDate(date, relativeTo: now, calendar: calendar)
    }

    /// Short menu-friendly timestamp; a date matching today adds no
    /// information and makes dense tray rows harder to scan, so it is dropped.
    static func formatMenuDate(
        _ date: Date,
        relativeTo now: Date? = nil,
        calendar: Calendar = .current
    ) -> String {
        let output = DateFormatter()
        output.calendar = calendar
        output.timeZone = calendar.timeZone
        output.dateStyle = now.map { calendar.isDate(date, inSameDayAs: $0) } == true ? .none : .medium
        output.timeStyle = .short
        return output.string(from: date)
    }

    private static func buildHistoryTool() -> String { resolveRepoRoot() + "/scripts/build_history.py" }

    private static func installedBuildIdentifier() -> String? {
        let url = FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent("Applications/Arbol/BUILD_INFO.json")
        guard let data = try? Data(contentsOf: url),
              let value = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return nil }
        return (value["build_id"] as? String).flatMap { $0.isEmpty ? nil : $0 }
    }

    static func archivedBuilds(at prefix: URL, installedBuildID: String? = nil) -> [ArchivedBuild] {
        // Menu preparation runs on the main thread. Read the same metadata as
        // build_history.list_builds directly: waiting for a subprocess before
        // draining its history output can deadlock the tray on a full pipe.
        let fm = FileManager.default
        let root = prefix.appendingPathComponent("builds", isDirectory: true)
        guard let directories = try? fm.contentsOfDirectory(at: root, includingPropertiesForKeys: nil) else { return [] }
        var rows: [[String: Any]] = []
        for directory in directories {
            let artifacts = directory.appendingPathComponent("Arbol", isDirectory: true)
            var isDirectory: ObjCBool = false
            guard fm.fileExists(atPath: artifacts.path, isDirectory: &isDirectory), isDirectory.boolValue,
                  let info = try? artifacts.appendingPathComponent("BUILD_INFO.json").resourceValues(forKeys: [.isRegularFileKey]),
                  info.isRegularFile == true,
                  let data = try? Data(contentsOf: directory.appendingPathComponent("metadata.json")),
                  var row = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { continue }
            if row["build_id"] == nil || row["build_id"] is NSNull || (row["build_id"] as? String) == "" {
                row["build_id"] = directory.lastPathComponent
            }
            rows.append(row)
        }
        guard let data = try? JSONSerialization.data(withJSONObject: rows) else { return [] }
        // The existing parser omits pending and malformed rows. Every retained
        // row has a nonempty effective_start, the history tool's sort key.
        return parseArchivedBuilds(data, installedBuildID: installedBuildID)
            .sorted { $0.effectiveStart > $1.effectiveStart }
    }

    private static func archivedBuilds() -> [ArchivedBuild] {
        let prefix = FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent("Applications/Arbol", isDirectory: true)
        return archivedBuilds(at: prefix, installedBuildID: installedBuildIdentifier())
    }

    private func refreshOlderBuildsMenu() {
        guard let parent = olderBuildsMenuItem else { return }
        let submenu = NSMenu()
        // With the default autoenablesItems, AppKit re-enables any item that
        // has a valid target/action, silently overriding `isEnabled = false`
        // on the currently installed build's row.
        submenu.autoenablesItems = false
        let builds = Self.archivedBuilds()
        parent.isEnabled = !builds.isEmpty
        if builds.isEmpty {
            let empty = NSMenuItem(title: "No archived builds available", action: nil, keyEquivalent: "")
            empty.isEnabled = false
            submenu.addItem(empty)
        } else {
            for (build, title) in Self.archivedBuildMenuRows(builds) {
                let item = NSMenuItem(title: title, action: #selector(runOlderBuild(_:)), keyEquivalent: "")
                item.target = self
                item.representedObject = build.buildID
                item.state = build.isCurrent ? .on : .off
                item.isEnabled = !build.isCurrent
                submenu.addItem(item)
            }
        }
        parent.submenu = submenu
    }

    @objc private func runOlderBuild(_ sender: NSMenuItem) {
        guard let buildID = sender.representedObject as? String else { return }
        let helperPath = Self.resolveRepoRoot() + "/scripts/run-archived-build.sh"
        guard FileManager.default.isExecutableFile(atPath: helperPath) else {
            Self.showError(title: "Run older build", message: "Archived-build helper is unavailable at:\n  \(helperPath)")
            return
        }
        // The tray closes every Arbol UI as soon as the detached helper starts.
        // The helper validates and replaces the archived artifact set, writes a
        // durable log, and reopens the selected (or rolled-back) apps afterward.
        actionItems.forEach { $0.isEnabled = false }
        sender.title += "…"
        var cleanEnvironment = ProcessInfo.processInfo.environment.filter { !$0.key.hasPrefix("ARBOL_") }
        cleanEnvironment["ARBOL_RESTORE_LAST_ACTIVE_UI"] = readLastActiveArbolUI() ?? ""
        let helper = Process()
        helper.executableURL = URL(fileURLWithPath: "/bin/zsh")
        helper.arguments = [helperPath, buildID]
        helper.environment = cleanEnvironment
        do {
            // run-archived-build immediately spawns a detached supervisor. Once
            // that process exists, close all visible Arbol components now; do
            // not wait for validation/build installation. Provider Instances
            // are launchd jobs and are deliberately not part of this UI stop.
            try helper.run()
            helper.waitUntilExit()
            guard helper.terminationStatus == 0 else {
                actionItems.forEach { $0.isEnabled = true }
                Self.showError(title: "Run older build", message: "The selected archive could not be validated.")
                return
            }
            Self.killOtherRunningUIApps()
            NSApp.terminate(nil)
        } catch {
            actionItems.forEach { $0.isEnabled = true }
            Self.showError(title: "Run older build", message: "\(error)")
        }
    }

    @objc private func removeOldBuilds(_ sender: NSMenuItem) {
        performMenuAction(sender) {
            try Self.runAndWait("/usr/bin/python3", [
                Self.buildHistoryTool(), "prune", "--keep", "4",
            ])
        }
    }

    @objc private func nameCurrentBuild(_ sender: NSMenuItem) {
        guard let current = Self.archivedBuilds().first(where: { $0.isCurrent }) else {
            Self.showError(title: "Name this build", message: "The current build is not archived yet.")
            return
        }
        let alert = NSAlert()
        alert.messageText = "Name this build"
        alert.informativeText = "Choose a memorable name for the current Arbol build."
        let field = NSTextField(string: current.name)
        field.frame = NSRect(x: 0, y: 0, width: 320, height: 24)
        alert.accessoryView = field
        alert.addButton(withTitle: "Save")
        alert.addButton(withTitle: "Cancel")
        guard alert.runModal() == .alertFirstButtonReturn else { return }
        let name = field.stringValue.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !name.isEmpty else { return }
        performMenuAction(sender) {
            try Self.runAndWait("/usr/bin/python3", [Self.buildHistoryTool(), "rename",
                "--build-id", current.buildID, "--name", name])
        }
    }

    /// Stop ALL Arbol components and quit. Unlike the restarts, this is the
    /// teardown path: every launchd daemon (drivers/IPs → integrations →
    /// effector → core) is booted out and every UI — including this tray host —
    /// is closed. The daemon plists are left in place, so a normal login (or a
    /// `Rebuild and Restart`) brings everything back. Confirmed first because it
    /// also terminates Provider Instances that may have running agents.
    ///
    /// Not routed through `performMenuAction`: that helper restores the menu and
    /// re-probes health on completion, which is meaningless once we are calling
    /// `NSApp.terminate`. We drive the disable / background-work / terminate
    /// sequence directly instead.
    @objc private func quitArbol(_ sender: NSMenuItem) {
        // No confirmation: Quit is an unambiguous, deliberate teardown. (A
        // confirm panel here also surfaced un-keyed behind other windows, so it
        // read as a no-op.) Boot out every daemon off the main thread, then kill
        // the other UIs and terminate this tray host last.
        healthTimer?.invalidate()
        healthTimer = nil
        actionItems.forEach { $0.isEnabled = false }
        sender.title = "Quitting Arbol…"
        updateCoreHealth(.offline("Quitting…"))

        DispatchQueue.global(qos: .userInitiated).async {
            try? Self.stopAllDaemons()
            DispatchQueue.main.async {
                Self.killOtherRunningUIApps()
                NSApp.terminate(nil)
            }
        }
    }

    /// Boot out every Arbol launchd job for this user. Mirrors the enumeration in
    /// scripts/uninstall.sh — Provider Instance drivers are discovered DYNAMICALLY
    /// from both launchd's loaded jobs and the installed plists (versioned + fixed,
    /// current `com.arbol.driver.*` and legacy `com.arbol.ip.*` spellings), since a
    /// safe cutover mints versioned labels a fixed list would orphan. Unlike
    /// uninstall.sh it only boots the jobs out; the plists stay so login reloads
    /// them. Removal order is the reverse of install: IPs → integrations → effector
    /// → core. Embedded inline (not read from the repo) so Quit works from an
    /// installed app with no checkout present.
    private static func stopAllDaemons() throws {
        let script = """
        UID_NUM="$(id -u)"
        LA="$HOME/Library/LaunchAgents"
        setopt NULL_GLOB

        ip_labels() {
          launchctl print "gui/$UID_NUM" 2>/dev/null \
            | grep -oE 'com\\.arbol\\.(driver|ip)\\.[A-Za-z0-9_.-]+' || true
          for p in "$LA"/com.arbol.driver.*.plist "$LA"/com.arbol.ip.*.plist; do
            [[ -e "$p" ]] || continue
            b="$(basename "$p")"; echo "${b%.plist}"
          done
        }

        ip_labels | sort -u | while IFS= read -r label; do
          [[ -z "$label" ]] && continue
          launchctl bootout "gui/$UID_NUM/$label" 2>/dev/null || true
        done

        for d in integrations effector core; do
          launchctl bootout "gui/$UID_NUM/com.arbol.${d}" 2>/dev/null || true
        done
        """
        try runAndWait("/bin/zsh", ["-c", script])
    }

    private func performMenuAction(_ item: NSMenuItem, _ action: @escaping () throws -> Void) {
        let originalTitle = item.title
        actionItems.forEach { $0.isEnabled = false }
        item.title = originalTitle + "…"

        DispatchQueue.global(qos: .userInitiated).async {
            let result = Result { try action() }
            DispatchQueue.main.async { [weak self] in
                item.title = originalTitle
                self?.actionItems.forEach { $0.isEnabled = true }
                if case .failure(let error) = result {
                    Self.showError(title: originalTitle, message: "\(error)")
                }
                self?.probeCoreHealth()
            }
        }
    }

    // MARK: Core health → tray status

    private func startCoreHealthPolling() {
        updateCoreHealth(.starting("Checking…"))
        healthTimer?.invalidate()
        let timer = Timer.scheduledTimer(withTimeInterval: 3.0, repeats: true) { [weak self] _ in
            self?.probeCoreHealth()
        }
        timer.tolerance = 0.5
        healthTimer = timer
        probeCoreHealth()
    }

    private func probeCoreHealth() {
        guard !coreHealthProbeInFlight else { return }
        coreHealthProbeInFlight = true

        Task { [weak self] in
            let health: CoreHealthStatus
            do {
                let response = try await Self.withTimeout(seconds: 1.5) {
                    try await CoreClient.shared.call(method: "healthz")
                }
                health = .online(
                    version: response["version"] as? String,
                    pid: Self.intValue(response["pid"]),
                    uptimeSeconds: Self.intValue(response["uptime_seconds"])
                )
            } catch {
                let reason = FileManager.default.fileExists(atPath: Self.coreSocketPath())
                    ? "\(error)"
                    : "core.sock missing"
                health = .offline(reason)
            }

            await MainActor.run { [weak self] in
                guard let self else { return }
                self.coreHealthProbeInFlight = false
                self.updateCoreHealth(health)
            }
        }
    }

    private func updateCoreHealth(_ status: CoreHealthStatus) {
        let title: String
        let tooltip: String
        let tint: NSColor

        switch status {
        case .starting(let detail):
            title = "Arbol Core: Starting…"
            tooltip = detail.isEmpty ? "Arbol — Core starting…" : "Arbol — Core starting… \(detail)"
            tint = .systemOrange
        case .online(let version, let pid, let uptimeSeconds):
            let versionSuffix = version.map { " v\($0)" } ?? ""
            let pidSuffix = pid.map { " pid=\($0)" } ?? ""
            let uptimeSuffix = uptimeSeconds.map { " uptime=\(Self.formatUptime($0))" } ?? ""
            title = "Arbol Core: Online\(versionSuffix)"
            tooltip = "Arbol — Core online\(versionSuffix)\(pidSuffix)\(uptimeSuffix)"
            tint = .systemGreen
        case .offline(let reason):
            title = "Arbol Core: Offline"
            tooltip = reason.isEmpty ? "Arbol — Core offline" : "Arbol — Core offline: \(reason)"
            tint = .systemRed
        }

        coreStatusMenuItem?.title = title
        buildInfoMenuItem?.attributedTitle = Self.buildInfoAttributedTitle()
        statusItem?.button?.toolTip = tooltip
        if #available(macOS 10.14, *) { statusItem?.button?.contentTintColor = tint }
    }

    private static func coreSocketPath() -> String {
        FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent("Library/Application Support/Arbol/run/core.sock").path
    }

    private static func intValue(_ value: Any?) -> Int? {
        if let i = value as? Int { return i }
        if let n = value as? NSNumber { return n.intValue }
        if let s = value as? String { return Int(s) }
        return nil
    }

    private static func formatUptime(_ seconds: Int) -> String {
        if seconds < 60 { return "\(seconds)s" }
        let minutes = seconds / 60
        if minutes < 60 { return "\(minutes)m" }
        let hours = minutes / 60
        if hours < 48 { return "\(hours)h" }
        return "\(hours / 24)d"
    }

    private static func withTimeout<T>(seconds: TimeInterval, operation: @escaping @Sendable () async throws -> T) async throws -> T {
        try await withThrowingTaskGroup(of: T.self) { group in
            group.addTask { try await operation() }
            group.addTask {
                try await Task.sleep(nanoseconds: UInt64(seconds * 1_000_000_000))
                throw NSError(domain: "ArbolCoreHealth", code: 1, userInfo: [NSLocalizedDescriptionKey: "healthz timed out"])
            }
            guard let result = try await group.next() else {
                throw NSError(domain: "ArbolCoreHealth", code: 2, userInfo: [NSLocalizedDescriptionKey: "healthz produced no result"])
            }
            group.cancelAll()
            return result
        }
    }

    private static func restartInstalledRuntime(component: String) throws {
        let controller = resolveRepoRoot() + "/scripts/deploy-runtime.py"
        guard FileManager.default.fileExists(atPath: controller) else {
            throw NSError(domain: "ArbolTray", code: 4, userInfo: [NSLocalizedDescriptionKey:
                "Arbol deployment controller is unavailable at:\n  \(controller)"])
        }
        // Apps reopened by a deployment can inherit that deployment's
        // ARBOL_BUILD_ID and controller variables.  A quick restart is a new
        // operation, so never pass stale deployment identity to the controller.
        let cleanEnvironment = ProcessInfo.processInfo.environment.filter {
            !$0.key.hasPrefix("ARBOL_")
        }
        try runAndWait("/usr/bin/python3", [
            controller, "--no-build", "--restart-only", "--components", component,
        ], environment: cleanEnvironment)
    }

    /// Shared zsh helpers embedded into the generated kill/relaunch scripts.
    ///
    /// `arbol_ui_pids` lists every running Arbol UI pid by exact executable name
    /// (`pgrep -x Arbol` — matches all four UIs regardless of install location)
    /// plus bundle-path patterns covering installed, dist/, and Xcode dev builds,
    /// minus the calling shell's own pid.
    ///
    /// `kill_arbol_uis` hard-kills them and blocks until none remain. It tests
    /// emptiness against a plain *string*, NOT a zsh array: `("${(@f)$(...)}")`
    /// yields a single empty-string element for empty input, so an array-length
    /// check never reaches zero — the previous code spun the full timeout and
    /// printed a bogus "still alive" warning on every run even when all UIs were
    /// already dead. Returns 1 (and warns) only if processes genuinely survive.
    private static let killUIsShellFunctions = """
    arbol_ui_pids() {
      local raw pid
      raw="$({
        # Always include the UI that launched this driver. Process discovery can
        # briefly miss the calling app while AppKit is handling the tray action;
        # embedding its pid guarantees it cannot keep an old renderer alive.
        echo \(getpid())
        /usr/bin/pgrep -x Arbol
        /usr/bin/pgrep -f "Arbol/apps/.*/Contents/MacOS/Arbol"
        /usr/bin/pgrep -f "build/app/Build/Products/.*/Arbol.app/Contents/MacOS/Arbol"
        # Independent fallback: inspect full command lines rather than relying
        # exclusively on pgrep's process-name/path matching.
        /bin/ps -axo pid=,command= | /usr/bin/awk 'index($0, "/Applications/Arbol/apps/") && index($0, ".app/Contents/MacOS/Arbol") {print $1}'
      } 2>/dev/null)"
      for pid in ${(f)raw}; do
        [[ "$pid" == "$$" || "$pid" != <-> ]] && continue
        /bin/kill -0 "$pid" 2>/dev/null && echo "$pid"
      done | /usr/bin/sort -u
    }

    kill_arbol_uis() {
      local pidlist
      for _ in {1..50}; do
        pidlist=$(arbol_ui_pids)
        [[ -z "$pidlist" ]] && return 0
        echo "  kill -KILL ${(f)pidlist}"
        /bin/kill -KILL ${(f)pidlist} 2>/dev/null || true
        sleep 0.1
      done
      pidlist=$(arbol_ui_pids)
      [[ -z "$pidlist" ]] && return 0
      echo "WARNING: Arbol UI processes still alive after kill: ${(f)pidlist}" >&2
      return 1
    }
    """

    /// Force-kill every running Arbol UI process EXCEPT this one, in-process.
    /// This process is the Seqoya tray host that must stay alive to drive the
    /// rebuild (the background script kills + reopens it). Killing the other UIs
    /// here means the bulk of the teardown happens immediately and reliably,
    /// without depending on the background script's own kill section
    /// running. UIs are matched by their `ArbolUI` Info.plist key, so this
    /// covers every install location. Returns the number of UIs signalled.
    @discardableResult
    private static func killOtherRunningUIApps() -> Int {
        let me = getpid()
        var killed = 0
        for app in NSWorkspace.shared.runningApplications {
            guard app.processIdentifier != me,
                  let bundleURL = app.bundleURL,
                  let bundle = Bundle(url: bundleURL),
                  let ui = bundle.object(forInfoDictionaryKey: "ArbolUI") as? String,
                  UI_SPECS[ui] != nil else { continue }
            if kill(app.processIdentifier, SIGKILL) == 0 { killed += 1 }
        }
        return killed
    }

    private static func runningUIKeys() -> Set<String> {
        // UI processes stay alive after their last window closes. Include
        // windows on other Spaces and minimized windows, but not closed UIs.
        let windows = CGWindowListCopyWindowInfo([.optionAll, .excludeDesktopElements], kCGNullWindowID)
            as? [[String: Any]] ?? []
        let windowOwners = Set(windows.compactMap { window -> pid_t? in
            guard (window[kCGWindowLayer as String] as? Int) == 0 else { return nil }
            return (window[kCGWindowOwnerPID as String] as? NSNumber)?.int32Value
        })
        return Set(NSWorkspace.shared.runningApplications.compactMap { app in
            guard windowOwners.contains(app.processIdentifier),
                  let url = app.bundleURL,
                  let bundle = Bundle(url: url),
                  let ui = bundle.object(forInfoDictionaryKey: "ArbolUI") as? String,
                  UI_SPECS[ui] != nil else { return nil }
            return ui
        })
    }

    /// Restarts the open stamped Arbol UIs. The helper shell is launched
    /// first, then it hard-kills every currently-running Arbol UI process and
    /// reopens the installed UI app bundles from ~/Applications/Arbol/apps.
    private static func restartAllUIApps() throws {
        let fm = FileManager.default
        let home = fm.homeDirectoryForCurrentUser
        let installedAppsRoot = home.appendingPathComponent("Applications/Arbol/apps")
        let runningKeys = runningUIKeys()
        let uiOrder = ["oaken", "elma", "willo", "seqoya"].filter { runningKeys.contains($0) }

        var appPaths: [String] = []
        for key in uiOrder {
            guard let spec = UI_SPECS[key] else { continue }
            let url = installedAppsRoot.appendingPathComponent("\(spec.title).app")
            if fm.fileExists(atPath: url.path) { appPaths.append(url.path) }
        }

        let runningUIs = NSWorkspace.shared.runningApplications.compactMap { app -> (pid: pid_t, path: String?)? in
            guard let bundleURL = app.bundleURL,
                  let bundle = Bundle(url: bundleURL),
                  let ui = bundle.object(forInfoDictionaryKey: "ArbolUI") as? String,
                  runningKeys.contains(ui) else { return nil }
            return (app.processIdentifier, bundleURL.path)
        }

        // Development fallback: if the app has not been installed/stamped yet,
        // at least restart the UI bundle(s) that are currently running.
        if appPaths.isEmpty {
            var seen = Set<String>()
            for running in runningUIs {
                guard let path = running.path, fm.fileExists(atPath: path), seen.insert(path).inserted else { continue }
                appPaths.append(path)
            }
        }

        guard !appPaths.isEmpty else {
            throw NSError(domain: "ArbolTray", code: 1, userInfo: [NSLocalizedDescriptionKey: "No installed Arbol UI apps were found to reopen."])
        }

        // Kill the *other* UIs in-process first, so the teardown does not hinge
        // on the orphaned helper shell below surviving the death of its parent.
        killOtherRunningUIApps()

        // Relaunch every UI in the background, then activate whichever Arbol UI
        // the user most recently worked in. `open -g` alone leaves the desktop on
        // an arbitrary app after the old processes are killed.
        let lastActiveKey = readLastActiveArbolUI()
        let lastActivePath = lastActiveKey.flatMap { key -> String? in
            guard let spec = UI_SPECS[key] else { return nil }
            let path = installedAppsRoot.appendingPathComponent("\(spec.title).app").path
            return appPaths.contains(path) ? path : nil
        }
        let openLines = appPaths.map { "/usr/bin/open -g \(shellEscape($0))" }.joined(separator: "\n")
        let activateLine = lastActivePath.map { "sleep 0.2\n/usr/bin/open \(shellEscape($0))" } ?? ""
        let script = """
        setopt NULL_GLOB

        \(killUIsShellFunctions)

        kill_arbol_uis || true
        sleep 0.1
        \(openLines)
        \(activateLine)
        """

        let proc = Process()
        proc.executableURL = URL(fileURLWithPath: "/bin/zsh")
        proc.arguments = ["-lc", script]
        try proc.run()
    }

    // MARK: Rebuild and Restart

    /// The Arbol source repo to rebuild from. The installed app bundle has no
    /// link back to the checkout, so this is configurable via a UserDefaults
    /// key (`defaults write <bundle-id> ArbolRepoPath /path/to/Arbol`), with the
    /// conventional dev location as the default.
    private static func resolveRepoRoot() -> String {
        let base: String
        if let p = UserDefaults.standard.string(forKey: "ArbolRepoPath"), !p.isEmpty {
            base = (p as NSString).expandingTildeInPath
        } else {
            base = FileManager.default.homeDirectoryForCurrentUser
                .appendingPathComponent("repos/sylvan-stack/arbol").path
        }
        // Repair the retired nested checkout preference after migration.
        if base.hasSuffix("/Arbol/main"), !FileManager.default.fileExists(atPath: base) {
            let parent = (base as NSString).deletingLastPathComponent
            if FileManager.default.fileExists(atPath: parent + "/.git") { return parent }
        }

        return base
    }

    private static var activeRebuildWorktreeURL: URL {
        FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent("Library/Application Support/Arbol/active-rebuild-worktree")
    }

    /// Persist the worktree selected in Elma's status bar for the singleton tray
    /// host. The file is shared by all four stamped UI bundles (unlike each
    /// bundle's UserDefaults domain). A path outside this Arbol container clears
    /// the selection, making `main` the default again.
    static func setActiveRebuildWorktree(_ path: String?) {
        let url = activeRebuildWorktreeURL
        let canonical = path.map { URL(fileURLWithPath: $0).standardizedFileURL.path }
        let valid = canonical.flatMap { selected in
            listArbolWorktrees().first { URL(fileURLWithPath: $0.path).standardizedFileURL.path == selected }?.path
        }
        try? FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        if let valid {
            try? (valid + "\n").write(to: url, atomically: true, encoding: .utf8)
        } else {
            try? FileManager.default.removeItem(at: url)
        }
    }

    static func activeRebuildWorktree(
        from worktrees: [(name: String, branch: String, path: String)],
        persistedPath: String? = nil
    ) -> (name: String, branch: String, path: String)? {
        let stored = persistedPath ?? (try? String(contentsOf: activeRebuildWorktreeURL, encoding: .utf8))?
            .trimmingCharacters(in: .whitespacesAndNewlines)
        if let stored, !stored.isEmpty {
            let canonical = URL(fileURLWithPath: stored).standardizedFileURL.path
            if let selected = worktrees.first(where: {
                URL(fileURLWithPath: $0.path).standardizedFileURL.path == canonical
            }) { return selected }
        }
        return worktrees.first(where: { $0.branch == "main" })
            ?? worktrees.first(where: { $0.branch == "master" })
            ?? worktrees.first
    }

    /// Buildable branch worktrees of the Arbol container. The visible name is
    /// the worktree directory name (rather than the branch, which may contain
    /// slashes); the branch remains available in the tooltip. Finished
    /// checkouts parked under `<container>/archive/` (`mycel wt archive`)
    /// remain valid git worktrees but are hidden from the rebuild menu.
    static func listArbolWorktrees() -> [(name: String, branch: String, path: String)] {
        let fm = FileManager.default
        let configured = UserDefaults.standard.string(forKey: "ArbolRepoPath")
            .flatMap { $0.isEmpty ? nil : ($0 as NSString).expandingTildeInPath }
        let base = configured ?? fm.homeDirectoryForCurrentUser
            .appendingPathComponent("repos/sylvan-stack/arbol").path

        // Accept either the container itself or any worktree inside it.
        var container = base
        if !fm.fileExists(atPath: container + "/.bare") {
            var candidate = (base as NSString).deletingLastPathComponent
            while candidate.count > 1, !fm.fileExists(atPath: candidate + "/.bare") {
                candidate = (candidate as NSString).deletingLastPathComponent
            }
            if fm.fileExists(atPath: candidate + "/.bare") { container = candidate }
        }
        guard fm.fileExists(atPath: container + "/.bare") else {
            // A classic checkout is still one valid rebuild source.
            guard fm.fileExists(atPath: base + "/scripts/rebuild-and-restart.sh") else { return [] }
            let branch = gitBranch(at: base) ?? (base as NSString).lastPathComponent
            return [((base as NSString).lastPathComponent, branch, base)]
        }

        let proc = Process()
        proc.executableURL = URL(fileURLWithPath: "/usr/bin/git")
        proc.arguments = ["--git-dir", container + "/.bare", "worktree", "list", "--porcelain", "-z"]
        let pipe = Pipe()
        proc.standardOutput = pipe
        proc.standardError = Pipe()
        guard (try? proc.run()) != nil else { return [] }
        proc.waitUntilExit()
        guard proc.terminationStatus == 0 else { return [] }
        return parseArbolWorktrees(
            pipe.fileHandleForReading.readDataToEndOfFile(),
            archivePrefix: container + "/archive/",
            isBuildable: { fm.fileExists(atPath: $0 + "/scripts/rebuild-and-restart.sh") }
        )
    }

    static func parseArbolWorktrees(
        _ data: Data,
        archivePrefix: String? = nil,
        isBuildable: (String) -> Bool
    ) -> [(name: String, branch: String, path: String)] {
        var result: [(String, String, String)] = []
        var path: String?
        for fieldData in data.split(separator: 0) {
            guard let field = String(data: fieldData, encoding: .utf8) else { continue }
            if field.hasPrefix("worktree ") {
                path = String(field.dropFirst("worktree ".count))
            } else if field.hasPrefix("branch refs/heads/"), let worktreePath = path {
                let branch = String(field.dropFirst("branch refs/heads/".count))
                let archived = archivePrefix.map { worktreePath.hasPrefix($0) } ?? false
                if !archived, isBuildable(worktreePath) {
                    result.append(((worktreePath as NSString).lastPathComponent, branch, worktreePath))
                }
                path = nil
            }
        }
        return result.sorted { lhs, rhs in
            if lhs.1 == "main" { return true }
            if rhs.1 == "main" { return false }
            return lhs.0.localizedStandardCompare(rhs.0) == .orderedAscending
        }
    }

    private static func gitBranch(at path: String) -> String? {
        let proc = Process()
        proc.executableURL = URL(fileURLWithPath: "/usr/bin/git")
        proc.arguments = ["-C", path, "branch", "--show-current"]
        let pipe = Pipe()
        proc.standardOutput = pipe
        proc.standardError = Pipe()
        guard (try? proc.run()) != nil else { return nil }
        proc.waitUntilExit()
        guard proc.terminationStatus == 0 else { return nil }
        let branch = String(data: pipe.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8)?
            .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return branch.isEmpty ? nil : branch
    }

    /// Resolve the gitignored build/signing environment for a worktree.
    /// Prefer the selected worktree's file, then main, then another worktree.
    static func buildEnvironmentFile(
        for worktree: String,
        worktrees: [(name: String, branch: String, path: String)]? = nil,
        fileExists: (String) -> Bool = { FileManager.default.fileExists(atPath: $0) }
    ) -> String? {
        let own = worktree + "/.env"
        if fileExists(own) { return own }
        for candidate in worktrees ?? listArbolWorktrees() {
            let path = candidate.path + "/.env"
            if fileExists(path) { return path }
        }
        return nil
    }

    /// The installed build's provenance, written by the install step.
    static func installedBuildInfo() -> String {
        let url = FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent("Applications/Arbol/BUILD_INFO.json")
        guard let data = try? Data(contentsOf: url),
              let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            return "Build: unknown"
        }
        return formatBuildInfo(obj)
    }

    static func formatBuildInfo(
        _ obj: [String: Any],
        now: Date = Date(),
        calendar: Calendar = .current
    ) -> String {
        formatBuildInfoLines(obj, now: now, calendar: calendar).joined(separator: "\n")
    }

    /// One tray entry, several short lines: identity / provenance / activity.
    /// A single "·"-joined line grew unscannable once builds carried a name, a
    /// source worktree, and an activation time all at once.
    static func formatBuildInfoLines(
        _ obj: [String: Any],
        now: Date = Date(),
        calendar: Calendar = .current
    ) -> [String] {
        guard let branch = obj["branch"] as? String else { return ["Build: unknown"] }
        let commit = obj["commit"] as? String ?? ""
        let at = (obj["built_at"] as? String).flatMap { $0.isEmpty ? nil : $0 }
        let source = obj["source"] as? String ?? ""
        let worktree = (source as NSString).lastPathComponent
        let name = (obj["build_name"] as? String).flatMap { $0.isEmpty ? nil : $0 }
        let namePrefix = name.map { "\($0) · " } ?? ""
        var lines = ["Build: \(namePrefix)\(branch) @ \(commit)"]
        var provenance: [String] = []
        if let at { provenance.append("built \(formatBuildDate(at, relativeTo: now, calendar: calendar))") }
        // A main build normally comes from a worktree also named "main". Do not
        // repeat that value; retain a distinct worktree because it is useful
        // provenance when the branch and checkout directory have different names.
        if !worktree.isEmpty, worktree != branch { provenance.append("source \(worktree)") }
        if !provenance.isEmpty { lines.append(provenance.joined(separator: " · ")) }
        if let start = (obj["effective_start"] as? String).flatMap({ $0.isEmpty ? nil : $0 }) {
            lines.append("active since \(formatEffectiveDate(start, relativeTo: now, calendar: calendar))")
        }
        return lines
    }

    /// The build entry is informational, not actionable: render its lines in
    /// the secondary style AppKit would use for a disabled item, which a plain
    /// multiline `attributedTitle` does not inherit automatically.
    private static func buildInfoAttributedTitle() -> NSAttributedString {
        let paragraph = NSMutableParagraphStyle()
        paragraph.lineSpacing = 2
        return NSAttributedString(
            string: installedBuildInfo(),
            attributes: [
                .font: NSFont.menuFont(ofSize: NSFont.smallSystemFontSize),
                .foregroundColor: NSColor.secondaryLabelColor,
                .paragraphStyle: paragraph,
            ]
        )
    }

    private static func formatBuildDate(
        _ value: String,
        relativeTo now: Date,
        calendar: Calendar
    ) -> String {
        // build.sh writes a local wall-clock timestamp in this fixed format.
        // Preserve it verbatim for older builds, but a date matching today adds
        // no information and makes the already-dense tray line harder to scan.
        let parser = DateFormatter()
        parser.locale = Locale(identifier: "en_US_POSIX")
        parser.calendar = calendar
        parser.timeZone = calendar.timeZone
        parser.dateFormat = "yyyy-MM-dd HH:mm"
        guard let date = parser.date(from: value), calendar.isDate(date, inSameDayAs: now) else {
            return value
        }
        return String(value.suffix(from: value.index(value.startIndex, offsetBy: 11)))
    }

    private static func stableFixBuildHelper() -> String? {
        let prefix = FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent("Applications/Arbol")
        if let data = try? Data(contentsOf: prefix.appendingPathComponent("BUILD_INFO.json")),
           let info = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
           let buildID = info["build_id"] as? String,
           buildID.range(of: "^[A-Za-z0-9_.-]+$", options: .regularExpression) != nil {
            let archived = prefix.appendingPathComponent("builds/\(buildID)/Arbol/recovery/fix-build.sh").path
            if FileManager.default.isExecutableFile(atPath: archived) { return archived }
        }
        let installed = prefix.appendingPathComponent("recovery/fix-build.sh").path
        return FileManager.default.isExecutableFile(atPath: installed) ? installed : nil
    }

    private static func launchFixBuild(prompt: String) throws {
        let repo = resolveRepoRoot()
        guard FileManager.default.fileExists(atPath: repo + "/scripts/build.sh") else {
            throw NSError(domain: "ArbolTray", code: 20, userInfo: [NSLocalizedDescriptionKey:
                "Arbol source checkout is unavailable at:\n  \(repo)"])
        }
        guard let helper = stableFixBuildHelper() else {
            throw NSError(domain: "ArbolTray", code: 21, userInfo: [NSLocalizedDescriptionKey:
                "The stable Fix Build helper is unavailable. Complete one successful rebuild with this version of Arbol first."])
        }
        let support = FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent("Library/Application Support/Arbol")
        let requests = support.appendingPathComponent("fix-build", isDirectory: true)
        try FileManager.default.createDirectory(at: requests, withIntermediateDirectories: true)
        let promptURL = requests.appendingPathComponent("prompt-\(UUID().uuidString).txt")
        try prompt.write(to: promptURL, atomically: true, encoding: .utf8)
        try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: promptURL.path)

        // A Terminal window is intentional: this is not a Chat Session, and the
        // user needs a durable, independent view while Arbol rebuilds/restarts.
        let command = """
        \(shellEscape(helper)) \(shellEscape(repo)) \(shellEscape(promptURL.path)); status=$?
        /bin/rm -f \(shellEscape(promptURL.path))
        echo
        if [[ $status -eq 0 ]]; then
          echo 'Fix Build complete.'
        else
          echo "Fix Build failed (exit $status)."
        fi
        echo 'Press Return to close.'
        read
        exit $status
        """
        let appleScript = "tell application \"Terminal\" to do script \(appleScriptLiteral(command))"
        try runAndWait("/usr/bin/osascript", ["-e", appleScript])
    }

    static func appleScriptLiteral(_ value: String) -> String {
        // AppleScript only understands \\ \" \n \r \t escapes; JSON encoding is
        // unsuitable because it emits \/ for slashes, which AppleScript rejects.
        var escaped = ""
        for scalar in value.unicodeScalars {
            switch scalar {
            case "\\": escaped += "\\\\"
            case "\"": escaped += "\\\""
            case "\n": escaped += "\\n"
            case "\r": escaped += "\\r"
            case "\t": escaped += "\\t"
            default: escaped.unicodeScalars.append(scalar)
            }
        }
        return "\"\(escaped)\""
    }

    /// Write a self-contained rebuild+safe-cutover+relaunch script and run it
    /// as a background process. Progress is shown in the app headers and complete
    /// output is retained in the rebuild logs, so no Terminal window is needed.
    /// The process is independent of this app, which the script itself restarts.
    private static func launchRebuildAndRestart(from worktree: String?) throws {
        let fm = FileManager.default
        let repo = worktree ?? resolveRepoRoot()
        guard fm.fileExists(atPath: repo + "/scripts/rebuild-and-restart.sh") else {
            let bundleID = Bundle.main.bundleIdentifier ?? "com.arbol.ui.seqoya"
            throw NSError(domain: "ArbolTray", code: 2, userInfo: [NSLocalizedDescriptionKey:
                "Arbol source repo not found or rebuild/restart script is unavailable at:\n  \(repo)\n\n"
                + "Point the tray at your checkout with:\n"
                + "  defaults write \(bundleID) ArbolRepoPath /path/to/Arbol"])
        }

        // `.env` is intentionally gitignored, so a newly-created worktree does
        // not normally have one. Reuse the first available worktree config
        // (main is sorted first) rather than duplicating signing secrets.
        let buildEnvironment = buildEnvironmentFile(for: repo)

        let appSupport = fm.homeDirectoryForCurrentUser
            .appendingPathComponent("Library/Application Support/Arbol")
        try? fm.createDirectory(at: appSupport, withIntermediateDirectories: true)
        let scriptURL = appSupport.appendingPathComponent("rebuild-and-restart.zsh")
        let restoreUIs = runningUIKeys().sorted().joined(separator: ",")

        // Ordering is the safety story: BUILD FIRST while every UI (including
        // this tray host) stays alive — a build failure then costs nothing and
        // its log is on screen. Only after a successful build are the UIs
        // killed, the fresh artifacts installed (ARBOL_SKIP_BUILD=1 re-invoke),
        // and the UIs reopened. The whole run is tee'd to
        // logs/rebuild-and-restart.log so a closed window never eats the
        // evidence. The kill runs from the independent background zsh process,
        // so killing every `Arbol` UI process cannot kill the rebuild driver.
        // IP cutover still goes through versioned Provider Instances and GC
        // only touches drained instances.
        let logPath = appSupport.appendingPathComponent("logs/rebuild-and-restart.log").path
        let script = """
        #!/bin/zsh
        setopt NULL_GLOB

        # The deployment lock wrapper passes one live descriptor through the
        # generated shell to the eventual controller. Preserve only that value
        # while clearing stale deployment identity inherited by a reopened UI.
        # In particular, a stale ARBOL_BUILD_ID makes build.sh stamp yesterday's
        # identity and the controller then refuses the deploy ("deployment
        # identity already exists").
        __arbol_deployment_lock_fd="${ARBOL_DEPLOYMENT_LOCK_FD:-}"
        __arbol_deployment_chain_fd="${ARBOL_DEPLOYMENT_CHAIN_FD:-}"
        __arbol_rebuild_lock_held="${ARBOL_REBUILD_LOCK_HELD:-0}"
        __arbol_reporting="${ARBOL_REBUILD_REPORTING:-0}"
        __arbol_run_id="${ARBOL_REBUILD_RUN_ID:-}"
        __arbol_run_log="${ARBOL_REBUILD_LOG_PATH:-}"
        __arbol_resume_id="${ARBOL_REBUILD_RESUME_ID:-}"
        __arbol_source_retirement_origin="${ARBOL_SOURCE_RETIREMENT_ORIGIN:-}"
        unset -m 'ARBOL_*'
        export ARBOL_RESTORE_UIS=\(shellEscape(restoreUIs))
        if [[ -n "$__arbol_deployment_lock_fd" ]]; then
          export ARBOL_DEPLOYMENT_LOCK_FD="$__arbol_deployment_lock_fd"
        fi
        if [[ -n "$__arbol_deployment_chain_fd" ]]; then
          export ARBOL_DEPLOYMENT_CHAIN_FD="$__arbol_deployment_chain_fd"
        fi
        if [[ -n "$__arbol_source_retirement_origin" ]]; then
          export ARBOL_SOURCE_RETIREMENT_ORIGIN="$__arbol_source_retirement_origin"
        fi
        export ARBOL_REBUILD_LOCK_HELD="$__arbol_rebuild_lock_held"
        export ARBOL_REBUILD_RUN_ID="$__arbol_run_id"

        # launchd apps inherit a minimal PATH where `python3` is the Apple
        # system Python (3.9) — too old for arbol_shared — and Homebrew tools
        # (podman, node) are missing. Give the whole rebuild a developer PATH.
        export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

        mkdir -p \(shellEscape(appSupport.appendingPathComponent("logs").path))

        # All four UIs expose this action. The outer deployment lock serializes
        # this entire pre-build/cutover with quick restarts and build swaps;
        # rebuild.lock additionally turns a duplicate rebuild click into a no-op
        # before planning or telemetry can overwrite shared rebuild state.
        __arbol_lock_dir=\(shellEscape(appSupport.appendingPathComponent("rebuild.lock").path))
        __arbol_temporary_env=0
        __arbol_owns_rebuild_lock=0
        if [[ "${ARBOL_REBUILD_LOCK_HELD:-0}" != "1" ]]; then
          if ! /bin/mkdir "$__arbol_lock_dir" 2>/dev/null; then
            __arbol_owner="$(/bin/cat "$__arbol_lock_dir/pid" 2>/dev/null || true)"
            if [[ "$__arbol_owner" == <-> ]] && /bin/kill -0 "$__arbol_owner" 2>/dev/null; then
              echo "Rebuild already in progress (pid $__arbol_owner); ignoring duplicate request."
              exit 75
            fi
            /bin/rm -rf "$__arbol_lock_dir"
            /bin/mkdir "$__arbol_lock_dir" || exit 75
          fi
          echo $$ > "$__arbol_lock_dir/pid"
          __arbol_owns_rebuild_lock=1
        fi
        __arbol_release_lock() {
          if [[ "$__arbol_temporary_env" == "1" ]]; then
            /bin/rm -f \(shellEscape(repo + "/.env"))
          fi
          if [[ "$__arbol_owns_rebuild_lock" == "1" ]]; then
            /bin/rm -rf "$__arbol_lock_dir"
          fi
        }
        trap __arbol_release_lock EXIT

        if [[ "$__arbol_reporting" != "1" ]]; then
          __arbol_run_id="$(date '+%Y%m%d-%H%M%S')-$$"
          __arbol_run_log=\(shellEscape(appSupport.appendingPathComponent("logs/rebuilds").path))/"$__arbol_run_id.log"
          mkdir -p "${__arbol_run_log:h}"
          exec > >(tee \(shellEscape(logPath)) "$__arbol_run_log") 2>&1
        fi

        export ARBOL_REBUILD_RUN_ID="$__arbol_run_id"
        export ARBOL_REBUILD_PROGRESS_HELPER=\(shellEscape(repo + "/scripts/rebuild-progress.py"))
        # Compute the selective workload before starting telemetry. ETA history
        # is matched by component set, so cache-only, UI-only, and full rebuilds
        # no longer contaminate one another. build.sh reuses this exact plan.
        cd \(shellEscape(repo)) || exit $?
        # Rebuild and Restart installs a complete native generation. Rebuild
        # every component so the frozen daemons and package metadata carry
        # the same fresh provenance even when source inputs are unchanged.
        if [[ -z "$__arbol_resume_id" ]]; then
          eval "$(python3 scripts/selective-build.py plan --force)" || exit $?
          export ARBOL_BUILD_PLAN_PRECOMPUTED=1
          "$ARBOL_REBUILD_PROGRESS_HELPER" start --run-id "$ARBOL_REBUILD_RUN_ID" --log "$__arbol_run_log" \
            --components "$ARBOL_CHANGED_COMPONENTS" --deploy "$ARBOL_DEPLOY_COMPONENTS" \
            --worktree \(shellEscape((repo as NSString).lastPathComponent)) || true
        fi
        __arbol_status=0

        progress_event() {
          "$ARBOL_REBUILD_PROGRESS_HELPER" event --run-id "$ARBOL_REBUILD_RUN_ID" --label "$1" >/dev/null 2>&1 || true
        }

        finish() {
          __arbol_status="$1"
          if [[ "$__arbol_reporting" != "1" ]]; then
            "$ARBOL_REBUILD_PROGRESS_HELPER" finish --run-id "$ARBOL_REBUILD_RUN_ID" --status "$__arbol_status" >/dev/null 2>&1 || true
          fi
          echo
          if [[ "$__arbol_status" == "0" ]]; then
            echo "✅ Rebuild and Restart succeeded."
            echo "   Runtime startup and application publication are verified."
          elif [[ "$__arbol_status" == "75" ]]; then
            echo "Rebuild paused. Arbol's rebuild status shows the required next step."
            echo "   Full log: \(logPath)"
          else
            echo "❌ Rebuild and Restart failed with exit code $__arbol_status."
            echo "   Full log: \(logPath)"
          fi
          exit "$__arbol_status"
        }

        \(killUIsShellFunctions)

        cd \(shellEscape(repo)) || finish $?
        if [[ -n "$__arbol_resume_id" ]]; then
          echo "==> Resuming the exact prepared deployment $__arbol_resume_id…"
          # The wrapper validated this exact retained plan before spawning us.
          # Resume never plans, rebuilds, or sources signing configuration.
          # Keep its inherited ownership capsule for the one actual controller.
          progress_event "Resuming the prepared deployment"
          kill_arbol_uis || true
          /usr/bin/touch \(shellEscape(appSupport.appendingPathComponent("background-ui-launch.pending").path))
          .venv/bin/python scripts/deploy-runtime.py --resume "$__arbol_resume_id" --no-build || finish $?
          finish 0
        fi
        if [[ ! -f .env ]]; then
          if [[ -z \(shellEscape(buildEnvironment ?? "")) ]]; then
            echo "No Arbol build environment was found. Add .env to the repository folder."
            finish 1
          fi
          /bin/ln -s \(shellEscape(buildEnvironment ?? "")) .env || finish $?
          __arbol_temporary_env=1
          echo "==> Using build environment from \(shellEscape(buildEnvironment ?? ""))"
        fi
        echo "==> Building Arbol (UIs stay up — nothing is touched if the build fails)…"
        progress_event "Building Arbol (UIs stay up)"
        ./scripts/build.sh || finish $?
        echo
        echo "==> Checking successor package compatibility (UIs stay up)…"
        eval "$(python3 scripts/selective-build.py load)" || finish $?
        # The cold controller excludes predecessors before starting successors.
        # Rolling coexistence is neither required nor authorized by this check.
        .venv/bin/python scripts/deployment_compatibility.py --components "$ARBOL_DEPLOY_COMPONENTS" --successor-only || finish $?
        echo
        echo "==> Build OK. Killing currently-running Arbol UIs…"
        progress_event "Build OK"
        kill_arbol_uis || true
        echo
        echo "==> Installing the prepared runtime and reopening Arbol…"
        # The controller reopens verified predecessor apps at a planned restart
        # wait, or the freshly published apps after successful runtime startup.
        /bin/mkdir -p \(shellEscape(appSupport.path))
        /usr/bin/touch \(shellEscape(appSupport.appendingPathComponent("background-ui-launch.pending").path))
        ARBOL_SKIP_BUILD=1 ARBOL_OPEN_UIS_AFTER_INSTALL=1 ./scripts/rebuild-and-restart.sh || finish $?
        echo
        finish 0
        """
        try script.write(to: scriptURL, atomically: true, encoding: .utf8)
        try fm.setAttributes([.posixPermissions: 0o755], ofItemAtPath: scriptURL.path)

        // The controller opens the latest and per-run log before selecting a
        // fresh build or retained-plan resume. Header polling displays both paths.
        // The child continues independently when the rebuild replaces this app.
        // Reserve the same lock used by quick restarts before planning/building,
        // and keep its descriptor inherited through the generated shell into the
        // deployment controller. A rebuild now waits here instead of building,
        // killing UIs, and only then discovering an overlapping deployment.
        // UIs reopened by the previous deployment inherit that deployment's
        // ARBOL_* environment, including ARBOL_DEPLOYMENT_LOCK_FD. That numeric
        // descriptor no longer refers to the deployment lock (it may be closed
        // or reused), so forwarding it makes the wrapper try to adopt an invalid
        // lock and exit before the generated script can open
        // its log. Start every new rebuild request with a clean deployment
        // environment; the wrapper supplies fresh lock variables to its child.
        let cleanEnvironment = ProcessInfo.processInfo.environment.filter {
            !$0.key.hasPrefix("ARBOL_")
        }
        try launchProcess("/usr/bin/python3", [
            repo + "/scripts/deploy-runtime.py",
            "--rebuild-request",
            "--request-lock", appSupport.appendingPathComponent("rebuild.lock").path,
            "--lock-command", "/bin/zsh", scriptURL.path,
        ], environment: cleanEnvironment)

        // No in-process UI kill here: the script owns the kill, and it runs
        // strictly AFTER a successful build. Killing UIs at click time meant a
        // failed handoff (e.g. the TCC case above) left every UI dead with
        // nothing rebuilt and no log.
    }

    private static func launchProcess(
        _ executable: String,
        _ arguments: [String],
        environment: [String: String]? = nil
    ) throws {
        let proc = Process()
        proc.executableURL = URL(fileURLWithPath: executable)
        proc.arguments = arguments
        if let environment { proc.environment = environment }
        try proc.run()
    }

    private static func runAndWait(
        _ executable: String,
        _ arguments: [String],
        environment: [String: String]? = nil
    ) throws {
        let proc = Process()
        proc.executableURL = URL(fileURLWithPath: executable)
        proc.arguments = arguments
        if let environment { proc.environment = environment }
        let out = Pipe()
        let err = Pipe()
        proc.standardOutput = out
        proc.standardError = err
        try proc.run()
        proc.waitUntilExit()
        guard proc.terminationStatus == 0 else {
            let stdout = String(data: out.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8) ?? ""
            let stderr = String(data: err.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8) ?? ""
            let message = (stderr.isEmpty ? stdout : stderr).trimmingCharacters(in: .whitespacesAndNewlines)
            throw NSError(domain: "ArbolTray", code: Int(proc.terminationStatus), userInfo: [NSLocalizedDescriptionKey: message.isEmpty ? "Command failed: \(executable) \(arguments.joined(separator: " "))" : message])
        }
    }

    private static func shellEscape(_ value: String) -> String {
        "'" + value.replacingOccurrences(of: "'", with: "'\\''") + "'"
    }

    private static func showError(title: String, message: String) {
        let alert = NSAlert()
        alert.messageText = title
        alert.informativeText = message
        alert.alertStyle = .warning
        alert.addButton(withTitle: "OK")
        alert.runModal()
    }

    /// Two-button Continue/Cancel modal; returns true to proceed. NSAlert.runModal
    /// must run on the MAIN thread — call this from the @objc menu selectors,
    /// never from inside the background-dispatched performMenuAction closure.
    private static func confirm(title: String, message: String, style: NSAlert.Style = .warning) -> Bool {
        let alert = NSAlert()
        alert.messageText = title
        alert.informativeText = message
        alert.alertStyle = style
        alert.addButton(withTitle: "Continue")
        alert.addButton(withTitle: "Cancel")
        return alert.runModal() == .alertFirstButtonReturn
    }

    private static func oakTreeImage() -> NSImage {
        let image = NSImage(size: NSSize(width: 18, height: 18))
        image.lockFocus()
        defer {
            image.unlockFocus()
            image.isTemplate = true
        }

        NSColor.black.setFill()
        NSColor.black.setStroke()

        // Rounded trunk.
        NSBezierPath(roundedRect: NSRect(x: 7.6, y: 2.0, width: 2.8, height: 7.2), xRadius: 1.2, yRadius: 1.2).fill()

        // Low branches, visible in template form at menu-bar size.
        let branches = NSBezierPath()
        branches.lineWidth = 1.35
        branches.lineCapStyle = .round
        branches.move(to: NSPoint(x: 9.0, y: 7.0))
        branches.line(to: NSPoint(x: 5.0, y: 10.0))
        branches.move(to: NSPoint(x: 9.0, y: 7.4))
        branches.line(to: NSPoint(x: 13.1, y: 10.1))
        branches.stroke()

        // Broad oak canopy: overlapping lobes instead of a cone/pine silhouette.
        let lobes = [
            NSRect(x: 2.0, y: 7.0, width: 5.6, height: 5.8),
            NSRect(x: 4.2, y: 10.0, width: 5.8, height: 5.5),
            NSRect(x: 8.0, y: 10.1, width: 5.8, height: 5.4),
            NSRect(x: 11.0, y: 7.0, width: 5.6, height: 5.8),
            NSRect(x: 4.8, y: 6.0, width: 8.6, height: 6.8),
        ]
        for rect in lobes { NSBezierPath(ovalIn: rect).fill() }

        // Small ground line anchors the tree at tiny sizes.
        let ground = NSBezierPath()
        ground.lineWidth = 1.2
        ground.lineCapStyle = .round
        ground.move(to: NSPoint(x: 5.6, y: 2.0))
        ground.line(to: NSPoint(x: 12.4, y: 2.0))
        ground.stroke()

        return image
    }
}

/// Optional tray status section (safe restart Phase 10): current / draining
/// Provider Instances via the Phase 7 `ip.instances.list` RPC. Refreshed when
/// the menu opens (NSMenuDelegate) — the instance list only changes on a
/// cutover or GC, so polling it on the health timer would be wasteful — and it
/// degrades gracefully: an RPC failure (core down, or an older core without the
/// RPC) or an empty result simply hides the section.
extension ArbolTrayController: NSMenuDelegate {
    private static let instanceStatusTag = 743001

    func menuWillOpen(_ menu: NSMenu) {
        refreshOlderBuildsMenu()
        Task { [weak self, weak menu] in
            let lines: [String]
            do {
                let response = try await CoreClient.shared.call(method: "ip.instances.list")
                lines = Self.instanceStatusLines(response["instances"] as? [[String: Any]] ?? [])
            } catch {
                lines = []
            }
            await MainActor.run {
                guard let self, let menu else { return }
                self.renderInstanceStatus(lines, in: menu)
            }
        }
    }

    /// One disabled line per non-deprecated instance, current first per provider.
    /// `running_attempts` is Core's durable ledger count.  The additive
    /// `provider_turn_inventory` is an exact live query to the Provider and is
    /// authoritative for whether a draining process still owns work.  Never
    /// render a zero on a row whose Provider could not be queried: absence is
    /// intentionally distinct from an empty Provider inventory.
    private static func instanceStatusLines(_ instances: [[String: Any]]) -> [String] {
        let live = instances.filter { (statusInt($0["deprecated"]) ?? 0) == 0 }
        guard !live.isEmpty else { return [] }
        var byProvider: [String: [[String: Any]]] = [:]
        for row in live {
            byProvider[(row["provider"] as? String) ?? "?", default: []].append(row)
        }
        var lines: [String] = []
        for provider in byProvider.keys.sorted() {
            let rows = (byProvider[provider] ?? []).sorted {
                (statusInt($0["is_current"]) ?? 0) > (statusInt($1["is_current"]) ?? 0)
            }
            for row in rows {
                let build = (row["build_id"] as? String) ?? "?"
                let state = (statusInt(row["is_current"]) ?? 0) != 0 ? "current" : "draining"
                var line = "\(provider) — \(state): \(build)"
                if let inventory = row["provider_turn_inventory"] as? [String: Any],
                   let running = statusInt(inventory["running"]),
                   let terminal = statusInt(inventory["unacknowledged_terminal"]) {
                    line += " · \(running) provider turn\(running == 1 ? "" : "s")"
                    if terminal > 0 {
                        line += " · \(terminal) terminal replay\(terminal == 1 ? "" : "s")"
                    }
                } else if let tracked = statusInt(row["running_attempts"]) {
                    line += " · \(tracked) Core-tracked active turn\(tracked == 1 ? "" : "s")"
                }
                lines.append(line)
            }
        }
        return lines
    }

    /// Replace the tagged section at the bottom of the menu. Removing first makes
    /// the refresh idempotent (reopening mid-fetch can't duplicate items), and an
    /// empty `lines` removes the section entirely.
    private func renderInstanceStatus(_ lines: [String], in menu: NSMenu) {
        while let idx = menu.items.firstIndex(where: { $0.tag == Self.instanceStatusTag }) {
            menu.removeItem(at: idx)
        }
        guard !lines.isEmpty else { return }
        var items: [NSMenuItem] = [NSMenuItem.separator()]
        let header = NSMenuItem(title: "IP Instances", action: nil, keyEquivalent: "")
        header.isEnabled = false
        items.append(header)
        for line in lines {
            let item = NSMenuItem(title: "   " + line, action: nil, keyEquivalent: "")
            item.isEnabled = false
            items.append(item)
        }
        for item in items {
            item.tag = Self.instanceStatusTag
            menu.addItem(item)
        }
    }

    private static func statusInt(_ value: Any?) -> Int? {
        if let i = value as? Int { return i }
        if let n = value as? NSNumber { return n.intValue }
        if let s = value as? String { return Int(s) }
        return nil
    }
}


// MARK: - Quick Input popup (⌥⇧⌘1)

final class QuickInputPanel: NSPanel {
    override var canBecomeKey: Bool { true }
    override var canBecomeMain: Bool { false }
}

final class QuickInputField: NSTextField, NSTextFieldDelegate {
    var onSubmit: (() -> Void)?
    var onCancel: (() -> Void)?

    override init(frame frameRect: NSRect) {
        super.init(frame: frameRect)
        delegate = self
    }

    required init?(coder: NSCoder) {
        super.init(coder: coder)
        delegate = self
    }

    func control(_ control: NSControl, textView: NSTextView,
                 doCommandBy commandSelector: Selector) -> Bool {
        switch commandSelector {
        case #selector(NSResponder.insertNewline(_:)),
             #selector(NSResponder.insertNewlineIgnoringFieldEditor(_:)):
            onSubmit?()
            return true
        case #selector(NSResponder.cancelOperation(_:)):
            onCancel?()
            return true
        default:
            return false
        }
    }
}
/// Arbol-wide, keyboard-first intake. Classification and provider dispatch live
/// behind Core's `quick_input.submit`; the native panel only captures content
/// and presents the result, so future handlers do not require another popup.
final class QuickInputPopupController: NSObject {
    private var panel: QuickInputPanel?
    private var input: QuickInputField?
    private var statusLabel: NSTextField?
    private var submitButton: NSButton?
    private var submitting = false

    @MainActor
    func show() {
        let panel = ensurePanel()
        input?.stringValue = ""
        clearStatus()
        submitButton?.isEnabled = true
        submitButton?.title = "Import  ⌘↩"
        submitting = false
        position(panel)
        NSApp.activate(ignoringOtherApps: true)
        panel.orderFrontRegardless()
        panel.makeKey()
        panel.makeFirstResponder(input)
    }

    @MainActor
    private func ensurePanel() -> QuickInputPanel {
        if let panel { return panel }
        let panel = QuickInputPanel(
            contentRect: NSRect(x: 0, y: 0, width: 640, height: 176),
            styleMask: [.titled, .closable, .fullSizeContentView],
            backing: .buffered, defer: false
        )
        panel.title = "Quick Input"
        panel.titleVisibility = .hidden
        panel.titlebarAppearsTransparent = true
        panel.level = .floating
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
        panel.isReleasedWhenClosed = false

        let root = NSView(frame: panel.contentView!.bounds)
        root.autoresizingMask = [.width, .height]
        root.wantsLayer = true
        panel.contentView = root

        let title = NSTextField(labelWithString: "Quick Input")
        title.font = .systemFont(ofSize: 20, weight: .semibold)
        title.frame = NSRect(x: 24, y: 122, width: 300, height: 28)
        root.addSubview(title)

        let shortcut = NSTextField(labelWithString: "⌥⇧⌘1")
        shortcut.font = .monospacedSystemFont(ofSize: 12, weight: .medium)
        shortcut.textColor = .tertiaryLabelColor
        shortcut.alignment = .right
        shortcut.frame = NSRect(x: 500, y: 126, width: 112, height: 20)
        root.addSubview(shortcut)

        let text = QuickInputField(frame: NSRect(x: 24, y: 69, width: 468, height: 32))
        text.font = .systemFont(ofSize: 14)
        text.placeholderString = "Paste a Jira, Confluence, GitLab MR, or Slack link"
        text.focusRingType = .default
        text.autoresizingMask = [.width]
        text.onSubmit = { [weak self] in self?.submit() }
        text.onCancel = { [weak self] in self?.panel?.orderOut(nil) }
        root.addSubview(text)

        let status = NSTextField(labelWithString: "")
        status.lineBreakMode = .byTruncatingTail
        status.frame = NSRect(x: 24, y: 35, width: 468, height: 22)
        status.autoresizingMask = [.width]
        root.addSubview(status)

        let button = NSButton(title: "Import  ⌘↩", target: self, action: #selector(submitAction(_:)))
        button.bezelStyle = .rounded
        button.frame = NSRect(x: 510, y: 69, width: 102, height: 32)
        button.autoresizingMask = [.minXMargin]
        root.addSubview(button)

        self.panel = panel
        input = text
        statusLabel = status
        submitButton = button
        return panel
    }

    @MainActor
    @objc private func submitAction(_ sender: NSButton) { submit() }

    @MainActor
    private func submit() {
        guard !submitting else { return }
        let content = input?.stringValue.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        guard !content.isEmpty else {
            setError("Paste a link first.")
            return
        }
        submitting = true
        submitButton?.isEnabled = false
        clearStatus()
        submitButton?.title = "Importing…"
        Task {
            do {
                let response = try await CoreClient.shared.call(
                    method: "quick_input.submit", params: ["content": content]
                )
                await MainActor.run { self.showResult(response) }
            } catch {
                await MainActor.run {
                    self.submitting = false
                    self.submitButton?.isEnabled = true
                    self.submitButton?.title = "Import  ⌘↩"
                    self.setError(Self.errorText(error))
                }
            }
        }
    }

    @MainActor
    private func showResult(_ response: [String: Any]) {
        guard (response["handled"] as? Bool) == true else {
            submitting = false
            submitButton?.isEnabled = true
            submitButton?.title = "Import  ⌘↩"
            setError(response["message"] as? String ?? "No entity was created.")
            return
        }

        let classification = response["classification"] as? [String: Any] ?? [:]
        let inputType = classification["input_type"] as? String ?? ""
        let handler = response["handler_result"] as? [String: Any] ?? [:]
        let alreadyExists = response["already_exists"] as? Bool == true
        let notice = alreadyExists
            ? (response["message"] as? String ?? "This link is already in Arbol; opened the existing item.")
            : nil

        if let destination = handler["destination"] as? [String: Any],
           let ui = destination["ui"] as? String,
           let query = destination["query"] as? [String: Any] {
            openImportedEntity(ui: ui, query: query, notification: notice)
            return
        }
        if inputType == "slack.conversation",
           let conversation = handler["conversation"] as? [String: Any],
           let externalID = conversation["external_id"] as? String {
            var query: [String: Any] = [
                "page": "slack",
                "slack_conversation_external_id": externalID,
            ]
            if let thread = handler["thread_ts"] as? String { query["slack_thread_ts"] = thread }
            if let ts = handler["message_ts"] as? String { query["slack_message_ts"] = ts }
            openImportedEntity(ui: "willo", query: query)
            return
        }

        if inputType == "gitlab.merge_request",
           let externalID = handler["external_id"] as? String, !externalID.isEmpty {
            // A merge request is an Oaken task entity, not a generic Seqoya
            // artifact. Its normalized Markdown remains durable backing data,
            // while Oaken owns the task/review surface.
            openImportedEntity(ui: "oaken", query: [
                "page": "merge-requests", "merge_request_id": externalID,
            ])
            return
        }

        if let artifact = handler["normalized_artifact"] as? String,
           let destination = Self.artifactDestination(artifact) {
            openImportedEntity(ui: "seqoya", query: [
                "page": "artifacts", "repo": destination.corpus,
                "corpus": destination.corpus, "path": destination.path,
            ])
            return
        }

        submitting = false
        submitButton?.isEnabled = true
        submitButton?.title = "Import  ⌘↩"
        setError("No entity was created.")
    }

    @MainActor
    private func openImportedEntity(ui: String, query: [String: Any], notification: String? = nil) {
        Task {
            let result = await ContentView.Coordinator.openApp(ui: ui, query: query)
            await MainActor.run {
                if (result["ok"] as? Bool) == true {
                    self.panel?.orderOut(nil)
                    if let notification {
                        AppDelegate.shared?.presentAppNotification(
                            title: "Quick Input", subtitle: "Existing item opened", body: notification
                        )
                    }
                } else {
                    self.submitting = false
                    self.submitButton?.isEnabled = true
                    self.submitButton?.title = "Import  ⌘↩"
                    self.setError(result["error"] as? String ?? "The imported entity could not be opened.")
                }
            }
        }
    }

    private static func artifactDestination(_ rawPath: String) -> (corpus: String, path: String)? {
        let parts = rawPath.split(separator: "/", maxSplits: 1, omittingEmptySubsequences: true)
        guard parts.count == 2 else { return nil }
        return (String(parts[0]), String(parts[1]))
    }

    @MainActor
    private func clearStatus() {
        statusLabel?.stringValue = ""
        statusLabel?.isHidden = true
    }

    @MainActor
    private func setError(_ text: String) {
        statusLabel?.stringValue = text
        statusLabel?.textColor = .systemRed
        statusLabel?.isHidden = false
    }

    @MainActor
    private func position(_ panel: NSPanel) {
        let visible = NSScreen.main?.visibleFrame ?? NSRect(x: 0, y: 0, width: 1200, height: 800)
        let origin = NSPoint(
            x: visible.midX - panel.frame.width / 2,
            y: visible.maxY - panel.frame.height - min(110, visible.height * 0.12)
        )
        panel.setFrameOrigin(origin)
    }

    private static func errorText(_ error: Error) -> String {
        let text = String(describing: error)
        return text.count > 180 ? String(text.prefix(177)) + "…" : text
    }
}

final class QuickInputHotkeyController: NSObject {
    private var hotKeyRef: EventHotKeyRef?
    private var eventHandlerRef: EventHandlerRef?
    private var retryTimer: Timer?
    private var lockFD: Int32 = -1
    private lazy var popup = QuickInputPopupController()

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
        let fd = open(dir.appendingPathComponent("quick-input-hotkey.lock").path, O_CREAT | O_RDWR, 0o644)
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
        let signature = Self.fourCharCode("QINP")
        let callback: EventHandlerUPP = { _, event, userData in
            guard let event, let userData else { return OSStatus(eventNotHandledErr) }
            var identifier = EventHotKeyID()
            let status = GetEventParameter(
                event, EventParamName(kEventParamDirectObject), EventParamType(typeEventHotKeyID),
                nil, MemoryLayout<EventHotKeyID>.size, nil, &identifier
            )
            guard status == noErr, identifier.signature == QuickInputHotkeyController.fourCharCode("QINP") else {
                return OSStatus(eventNotHandledErr)
            }
            let owner = Unmanaged<QuickInputHotkeyController>.fromOpaque(userData).takeUnretainedValue()
            DispatchQueue.main.async { owner.popup.show() }
            return noErr
        }
        guard InstallEventHandler(GetApplicationEventTarget(), callback, 1, &type, pointer, &eventHandlerRef) == noErr else {
            scheduleRetry(); return
        }
        let id = EventHotKeyID(signature: signature, id: 1)
        let modifiers = UInt32(cmdKey | shiftKey | optionKey)
        if RegisterEventHotKey(UInt32(kVK_ANSI_1), modifiers, id, GetApplicationEventTarget(), 0, &hotKeyRef) == noErr {
            retryTimer?.invalidate(); retryTimer = nil
        } else {
            if let eventHandlerRef { RemoveEventHandler(eventHandlerRef); self.eventHandlerRef = nil }
            if lockFD >= 0 { close(lockFD); lockFD = -1 }
            scheduleRetry()
        }
    }

    fileprivate static func fourCharCode(_ string: String) -> OSType {
        string.unicodeScalars.prefix(4).reduce(0) { ($0 << 8) + OSType($1.value) }
    }

    deinit {
        if let hotKeyRef { UnregisterEventHotKey(hotKeyRef) }
        if let eventHandlerRef { RemoveEventHandler(eventHandlerRef) }
        if lockFD >= 0 { close(lockFD) }
    }
}

// MARK: - Latest chat sessions popup (⌃⇧⌘C)

/// A process-wide singleton global hotkey host for the “Latest chat sessions”
/// popup. Every stamped Arbol UI process tries to install it, but only the one
/// holding this advisory lock registers with Carbon. Losers retry periodically
/// so the shortcut survives if the owning UI quits while another Arbol UI stays
/// open.
final class LatestChatSessionsHotkeyController: NSObject {
    private var hotKeyRef: EventHotKeyRef?
    private var eventHandlerRef: EventHandlerRef?
    private var retryTimer: Timer?
    private var hotkeyLockFD: Int32 = -1
    private let popup = LatestChatSessionsPopupController()

    func installIfAvailable() {
        guard hotKeyRef == nil else {
            retryTimer?.invalidate()
            retryTimer = nil
            return
        }
        guard acquireSingletonHotkeyLock() else {
            scheduleRetry()
            return
        }
        registerHotkey()
    }

    private func scheduleRetry() {
        guard retryTimer == nil else { return }
        let timer = Timer.scheduledTimer(withTimeInterval: 5.0, repeats: true) { [weak self] _ in
            self?.installIfAvailable()
        }
        timer.tolerance = 1.0
        retryTimer = timer
    }

    private func acquireSingletonHotkeyLock() -> Bool {
        if hotkeyLockFD >= 0 { return true }
        let dir = FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent("Library/Application Support/Arbol")
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        let lockPath = dir.appendingPathComponent("latest-chat-sessions-hotkey.lock").path
        let fd = open(lockPath, O_CREAT | O_RDWR, 0o644)
        guard fd >= 0 else { return true } // fail open: a working shortcut is better than none
        if flock(fd, LOCK_EX | LOCK_NB) != 0 {
            close(fd)
            return false
        }
        hotkeyLockFD = fd
        return true
    }

    private func registerHotkey() {
        var eventType = EventTypeSpec(eventClass: OSType(kEventClassKeyboard), eventKind: UInt32(kEventHotKeyPressed))
        let selfPtr = Unmanaged.passUnretained(self).toOpaque()
        let callback: EventHandlerUPP = { _, event, userData in
            guard let event, let userData else { return OSStatus(eventNotHandledErr) }
            var identifier = EventHotKeyID()
            let status = GetEventParameter(
                event, EventParamName(kEventParamDirectObject), EventParamType(typeEventHotKeyID),
                nil, MemoryLayout<EventHotKeyID>.size, nil, &identifier
            )
            guard status == noErr, identifier.signature == LatestChatSessionsHotkeyController.fourCharCode("LCHS") else {
                return OSStatus(eventNotHandledErr)
            }
            let controller = Unmanaged<LatestChatSessionsHotkeyController>.fromOpaque(userData).takeUnretainedValue()
            DispatchQueue.main.async { controller.popup.show() }
            return noErr
        }
        let handlerStatus = InstallEventHandler(GetApplicationEventTarget(), callback, 1, &eventType, selfPtr, &eventHandlerRef)
        guard handlerStatus == noErr else {
            scheduleRetry()
            return
        }

        let hotKeyID = EventHotKeyID(signature: Self.fourCharCode("LCHS"), id: 1)
        // Ctrl + Shift + Cmd + C
        let modifiers = UInt32(cmdKey | controlKey | shiftKey)
        let status = RegisterEventHotKey(UInt32(kVK_ANSI_C), modifiers, hotKeyID, GetApplicationEventTarget(), 0, &hotKeyRef)
        if status == noErr {
            retryTimer?.invalidate()
            retryTimer = nil
            // The hotkey owner is long-lived. Warm the small list snapshot now so
            // opening the popup never waits on Core or a temporarily busy DB.
            Task { @MainActor in popup.prefetch() }
        } else {
            if let eventHandlerRef {
                RemoveEventHandler(eventHandlerRef)
                self.eventHandlerRef = nil
            }
            if hotkeyLockFD >= 0 {
                close(hotkeyLockFD)
                hotkeyLockFD = -1
            }
            scheduleRetry()
        }
    }

    fileprivate static func fourCharCode(_ value: String) -> OSType {
        var result: OSType = 0
        for scalar in value.unicodeScalars.prefix(4) {
            result = (result << 8) + OSType(scalar.value)
        }
        return result
    }

    deinit {
        if let hotKeyRef { UnregisterEventHotKey(hotKeyRef) }
        if let eventHandlerRef { RemoveEventHandler(eventHandlerRef) }
        if hotkeyLockFD >= 0 { close(hotkeyLockFD) }
    }
}

struct LatestChatSessionRow {
    let id: String
    let title: String
    let repo: String
    let ipName: String
    let status: String
    let activityAt: TimeInterval

    init?(_ raw: [String: Any]) {
        guard let id = raw["id"] as? String, !id.isEmpty else { return nil }
        self.id = id
        let rawTitle = (raw["title"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        self.title = rawTitle.isEmpty ? "Untitled chat" : rawTitle
        self.repo = Self.primaryRepo(raw) ?? "Unknown repo"
        self.ipName = (raw["ip_name"] as? String) ?? ""
        self.status = (raw["status"] as? String) ?? "unknown"
        let updated = Self.timeValue(raw["updated_at"])
        let created = Self.timeValue(raw["created_at"])
        self.activityAt = max(updated ?? 0, created ?? 0)
    }

    private static func timeValue(_ value: Any?) -> TimeInterval? {
        if let n = value as? NSNumber { return normalizeTimestamp(n.doubleValue) }
        if let d = value as? Double { return normalizeTimestamp(d) }
        if let i = value as? Int { return normalizeTimestamp(Double(i)) }
        if let s = value as? String, let d = Double(s) { return normalizeTimestamp(d) }
        return nil
    }

    private static func normalizeTimestamp(_ value: TimeInterval) -> TimeInterval {
        // Core/renderer timestamps are usually milliseconds (`Date.now()`), but
        // imported sessions may use seconds. Convert to seconds for Date math.
        value > 10_000_000_000 ? value / 1000.0 : value
    }

    private static func primaryRepo(_ raw: [String: Any]) -> String? {
        let scalarKeys = ["repo", "repo_name", "repository", "repository_name", "repo_path", "repo_root", "workspace_path", "cwd", "project_path"]
        for key in scalarKeys {
            if let label = basenameLike(raw[key]) { return label }
        }
        let arrayKeys = ["workspace_dirs", "repo_paths", "repo_roots", "repositories", "repos"]
        for key in arrayKeys {
            guard let arr = raw[key] as? [Any] else { continue }
            for item in arr {
                if let label = basenameLike(item) { return label }
            }
        }
        return nil
    }

    private static func basenameLike(_ value: Any?) -> String? {
        guard let s = value as? String else { return nil }
        let trimmed = s.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return nil }
        let cleaned = trimmed.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        return cleaned.split(separator: "/").last.map(String.init) ?? cleaned
    }
}


enum LatestChatSessionsHistory {
    private static let currentSessionKey = "latest-chat-sessions.current-elma-session-id"
    private static let recentlyOpenedKey = "latest-chat-sessions.recently-opened-session-ids"
    private static let maximumHistoryCount = 100

    private static var defaults: UserDefaults? {
        UserDefaults(suiteName: "group.arbol")
    }

    /// Records Elma navigation in process-shared defaults so whichever Arbol UI
    /// owns the global hotkey can exclude the current chat and recover true open
    /// order. Re-publishing the same id is intentionally a no-op for the MRU.
    static func recordActiveSession(_ sessionID: String?) {
        recordActiveSession(sessionID, defaults: defaults)
    }

    static func snapshot() -> (currentSessionID: String?, recentlyOpenedSessionIDs: [String]) {
        snapshot(defaults: defaults)
    }

    static func recordActiveSession(_ sessionID: String?, defaults: UserDefaults?) {
        guard let defaults else { return }
        let normalized = sessionID?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let previous = defaults.string(forKey: currentSessionKey) ?? ""
        if normalized.isEmpty {
            defaults.removeObject(forKey: currentSessionKey)
            return
        }
        defaults.set(normalized, forKey: currentSessionKey)
        guard normalized != previous else { return }
        var history = defaults.stringArray(forKey: recentlyOpenedKey) ?? []
        history.removeAll { $0 == normalized }
        history.insert(normalized, at: 0)
        defaults.set(Array(history.prefix(maximumHistoryCount)), forKey: recentlyOpenedKey)
    }

    static func snapshot(defaults: UserDefaults?) -> (currentSessionID: String?, recentlyOpenedSessionIDs: [String]) {
        guard let defaults else { return (nil, []) }
        let current = defaults.string(forKey: currentSessionKey).flatMap { $0.isEmpty ? nil : $0 }
        return (current, defaults.stringArray(forKey: recentlyOpenedKey) ?? [])
    }
}

enum LatestChatSessionsModel {
    static let requestParams: [String: Any] = ["limit": 100]

    static func rows(
        from response: [String: Any],
        excluding currentSessionID: String? = nil,
        recentlyOpenedSessionIDs: [String] = []
    ) -> [LatestChatSessionRow] {
        var openRank: [String: Int] = [:]
        for (index, sessionID) in recentlyOpenedSessionIDs.enumerated() where openRank[sessionID] == nil {
            openRank[sessionID] = index
        }
        return (response["chat_sessions"] as? [[String: Any]] ?? [])
            .compactMap(LatestChatSessionRow.init)
            .filter { $0.id != currentSessionID }
            .sorted {
                let leftRank = openRank[$0.id]
                let rightRank = openRank[$1.id]
                if leftRank != rightRank {
                    if leftRank == nil { return false }
                    if rightRank == nil { return true }
                    return leftRank! < rightRank!
                }
                return $0.activityAt > $1.activityAt
            }
    }
}

final class LatestChatSessionsPanel: NSPanel {
    override var canBecomeKey: Bool { true }
    override var canBecomeMain: Bool { false }
}

final class LatestChatSessionsPopupController: NSObject {
    typealias SessionLoader = ([String: Any]) async throws -> [String: Any]
    typealias SessionOpener = @MainActor (LatestChatSessionRow) async -> Void

    private(set) var panel: LatestChatSessionsPanel?
    private(set) var listView: LatestChatSessionsListView?
    private(set) var localOutsideEventMonitor: Any?
    private(set) var globalOutsideEventMonitor: Any?
    private var appDeactivateObserver: NSObjectProtocol?
    private let sessionLoader: SessionLoader
    private let sessionOpener: SessionOpener
    private var cachedResponse: [String: Any]?
    private var fetchTask: Task<Void, Never>?

    init(
        sessionLoader: @escaping SessionLoader = { params in
            try await CoreClient.shared.call(method: "chat_session.list", params: params)
        },
        sessionOpener: @escaping SessionOpener = { session in
            _ = await ContentView.Coordinator.openApp(ui: "elma", query: ["session_id": session.id])
        }
    ) {
        self.sessionLoader = sessionLoader
        self.sessionOpener = sessionOpener
        super.init()
    }

    @MainActor
    func show() {
        let panel = ensurePanel()
        if let cachedResponse {
            apply(cachedResponse)
        } else {
            listView?.setLoading()
        }
        position(panel)
        // The global shortcut may be owned by a background Arbol UI process.
        // Merely ordering that process's panel above other apps makes it visible,
        // but does not route subsequent key events to it. Activate the owning app
        // before assigning the key window/first responder so arrow keys work no
        // matter which Arbol process won the singleton hotkey lock.
        NSApp.activate(ignoringOtherApps: true)
        panel.orderFrontRegardless()
        panel.makeKey()
        panel.makeFirstResponder(listView)
        installOutsideActionDismissal()
        // Keep the warmed snapshot fresh without hiding it behind a loading
        // state. If the startup prefetch is still running, this joins it.
        fetchSessions()
    }

    /// Warm the popup while the app is idle. `chat_session.list` can occasionally
    /// queue behind other Core work for more than a second; the hotkey should
    /// only need to paint an already-local snapshot.
    @MainActor
    func prefetch() {
        fetchSessions()
    }

    @MainActor
    func dismiss() {
        panel?.orderOut(nil)
        removeOutsideActionDismissal()
    }

    @MainActor
    func dismissForOutsideAction() {
        guard panel?.isVisible == true else { return }
        dismiss()
    }

    @MainActor
    private func ensurePanel() -> LatestChatSessionsPanel {
        if let panel { return panel }
        let view = LatestChatSessionsListView()
        view.onCancel = { [weak self] in self?.dismiss() }
        view.onOpen = { [weak self] session in
            self?.open(session)
        }

        let panel = LatestChatSessionsPanel(
            contentRect: NSRect(x: 0, y: 0, width: 620, height: 560),
            styleMask: [.borderless, .nonactivatingPanel],
            backing: .buffered,
            defer: false
        )
        panel.contentView = view
        panel.isOpaque = false
        panel.backgroundColor = .clear
        panel.hasShadow = true
        panel.level = .floating
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .transient]
        panel.isReleasedWhenClosed = false
        panel.hidesOnDeactivate = false
        panel.ignoresMouseEvents = true
        self.panel = panel
        self.listView = view
        return panel
    }

    @MainActor
    private func installOutsideActionDismissal() {
        removeOutsideActionDismissal()

        let mouseMask: NSEvent.EventTypeMask = [
            .leftMouseDown,
            .rightMouseDown,
            .otherMouseDown,
            .scrollWheel,
        ]

        // Local monitors observe events that still belong to Arbol (for example,
        // clicking another Arbol window). Returning the original event keeps the
        // click/scroll completely pass-through and non-blocking.
        localOutsideEventMonitor = NSEvent.addLocalMonitorForEvents(matching: mouseMask) { [weak self] event in
            Task { @MainActor in self?.dismissForOutsideAction() }
            return event
        }

        // Global monitors observe events delivered to other apps. They cannot
        // consume events, so a click in another app both dismisses this popup and
        // continues to that app normally.
        globalOutsideEventMonitor = NSEvent.addGlobalMonitorForEvents(matching: mouseMask) { [weak self] _ in
            DispatchQueue.main.async { self?.dismissForOutsideAction() }
        }

        appDeactivateObserver = NotificationCenter.default.addObserver(
            forName: NSApplication.didResignActiveNotification,
            object: NSApp,
            queue: .main
        ) { [weak self] _ in
            Task { @MainActor in self?.dismissForOutsideAction() }
        }
    }

    @MainActor
    private func removeOutsideActionDismissal() {
        if let localOutsideEventMonitor {
            NSEvent.removeMonitor(localOutsideEventMonitor)
            self.localOutsideEventMonitor = nil
        }
        if let globalOutsideEventMonitor {
            NSEvent.removeMonitor(globalOutsideEventMonitor)
            self.globalOutsideEventMonitor = nil
        }
        if let appDeactivateObserver {
            NotificationCenter.default.removeObserver(appDeactivateObserver)
            self.appDeactivateObserver = nil
        }
    }

    @MainActor
    private func position(_ panel: NSPanel) {
        let screen = NSScreen.main ?? NSScreen.screens.first
        let visible = screen?.visibleFrame ?? NSRect(x: 0, y: 0, width: 1440, height: 900)
        let size = panel.frame.size
        let x = visible.midX - size.width / 2
        let y = visible.midY - size.height / 2 + 36
        panel.setFrameOrigin(NSPoint(x: round(x), y: round(y)))
    }

    @MainActor
    private func apply(_ response: [String: Any]) {
        // Re-apply current history even for a cached Core response: Elma may
        // have changed the active/MRU session since the snapshot was fetched.
        let history = LatestChatSessionsHistory.snapshot()
        listView?.setSessions(LatestChatSessionsModel.rows(
            from: response,
            excluding: history.currentSessionID,
            recentlyOpenedSessionIDs: history.recentlyOpenedSessionIDs
        ))
    }

    @MainActor
    private func fetchSessions() {
        guard fetchTask == nil else { return }
        fetchTask = Task { [weak self] in
            guard let self else { return }
            do {
                let response = try await self.sessionLoader(LatestChatSessionsModel.requestParams)
                self.cachedResponse = response
                if self.panel?.isVisible == true {
                    self.apply(response)
                }
            } catch {
                // A failed background warmup is invisible. When the popup is
                // open, keep a previous good snapshot rather than replacing it
                // with an error; only an uncached first load needs error UI.
                if self.panel?.isVisible == true, self.cachedResponse == nil {
                    self.listView?.setError("Could not load chat sessions: \(error)")
                }
            }
            self.fetchTask = nil
        }
    }

    @MainActor
    private func open(_ session: LatestChatSessionRow) {
        dismiss()
        Task { @MainActor in
            await sessionOpener(session)
        }
    }

    deinit {
        if let localOutsideEventMonitor {
            NSEvent.removeMonitor(localOutsideEventMonitor)
        }
        if let globalOutsideEventMonitor {
            NSEvent.removeMonitor(globalOutsideEventMonitor)
        }
        if let appDeactivateObserver {
            NotificationCenter.default.removeObserver(appDeactivateObserver)
        }
    }
}

final class LatestChatSessionsListView: NSView {
    var onOpen: ((LatestChatSessionRow) -> Void)?
    var onCancel: (() -> Void)?

    private(set) var sessions: [LatestChatSessionRow] = []
    private(set) var loading = true
    private(set) var error: String?
    private(set) var selectedIndex = 0
    private(set) var scrollOffset = 0

    private let maxVisibleRows = 10
    private let rowHeight: CGFloat = 44
    private let headerHeight: CGFloat = 86
    private let footerHeight: CGFloat = 34
    private let inset: CGFloat = 14

    override var acceptsFirstResponder: Bool { true }

    override init(frame frameRect: NSRect) {
        super.init(frame: frameRect)
        wantsLayer = true
    }

    required init?(coder: NSCoder) { nil }

    func setLoading() {
        loading = true
        error = nil
        sessions = []
        selectedIndex = 0
        scrollOffset = 0
        needsDisplay = true
    }

    func setSessions(_ rows: [LatestChatSessionRow]) {
        loading = false
        error = nil
        sessions = rows
        selectedIndex = rows.isEmpty ? 0 : min(selectedIndex, rows.count - 1)
        ensureSelectionVisible()
        needsDisplay = true
    }

    func setError(_ message: String) {
        loading = false
        error = message
        sessions = []
        selectedIndex = 0
        scrollOffset = 0
        needsDisplay = true
    }

    override func draw(_ dirtyRect: NSRect) {
        super.draw(dirtyRect)
        drawBackground()
        drawHeader()
        if let error {
            drawCentered(message: error)
        } else if loading {
            drawCentered(message: "Loading latest chat sessions…")
        } else if sessions.isEmpty {
            drawCentered(message: "No chat sessions yet.")
        } else {
            drawRows()
        }
        drawFooter()
    }

    private func drawBackground() {
        let rect = bounds.insetBy(dx: 0.5, dy: 0.5)
        let path = NSBezierPath(roundedRect: rect, xRadius: 18, yRadius: 18)
        NSColor.windowBackgroundColor.withAlphaComponent(0.96).setFill()
        path.fill()
        NSColor.separatorColor.withAlphaComponent(0.7).setStroke()
        path.lineWidth = 1
        path.stroke()
    }

    private func drawHeader() {
        let title = "Latest chat sessions"
        title.draw(
            in: NSRect(x: inset + 4, y: bounds.height - 42, width: bounds.width - 2 * inset, height: 24),
            withAttributes: [
                .font: NSFont.systemFont(ofSize: 20, weight: .semibold),
                .foregroundColor: NSColor.labelColor,
            ]
        )
        let subtitle = "↑/↓ select · Enter open · 1–9/0 open top ten · Esc close"
        subtitle.draw(
            in: NSRect(x: inset + 4, y: bounds.height - 64, width: bounds.width - 2 * inset, height: 18),
            withAttributes: [
                .font: NSFont.monospacedSystemFont(ofSize: 11, weight: .medium),
                .foregroundColor: NSColor.secondaryLabelColor,
            ]
        )
        NSColor.separatorColor.withAlphaComponent(0.65).setFill()
        NSBezierPath(rect: NSRect(x: inset, y: bounds.height - headerHeight, width: bounds.width - 2 * inset, height: 1)).fill()
    }

    private func drawRows() {
        let start = scrollOffset
        let end = min(sessions.count, start + maxVisibleRows)
        for visibleIndex in start..<end {
            let session = sessions[visibleIndex]
            let local = visibleIndex - start
            let y = bounds.height - headerHeight - CGFloat(local + 1) * rowHeight
            let rect = NSRect(x: inset, y: y, width: bounds.width - 2 * inset, height: rowHeight - 2)
            if visibleIndex == selectedIndex {
                NSColor.controlAccentColor.withAlphaComponent(0.16).setFill()
                NSBezierPath(roundedRect: rect, xRadius: 10, yRadius: 10).fill()
                NSColor.controlAccentColor.withAlphaComponent(0.85).setStroke()
                let p = NSBezierPath(roundedRect: rect.insetBy(dx: 0.5, dy: 0.5), xRadius: 10, yRadius: 10)
                p.lineWidth = 1
                p.stroke()
            }

            let hotkey = Self.hotkeyLabel(for: visibleIndex)
            let keyRect = NSRect(x: rect.minX + 10, y: rect.midY - 11, width: 24, height: 22)
            let keyPath = NSBezierPath(roundedRect: keyRect, xRadius: 6, yRadius: 6)
            (hotkey == nil ? NSColor.tertiaryLabelColor.withAlphaComponent(0.10) : NSColor.controlAccentColor.withAlphaComponent(0.18)).setFill()
            keyPath.fill()
            (hotkey ?? "").drawCentered(in: keyRect, font: NSFont.monospacedSystemFont(ofSize: 12, weight: .bold), color: hotkey == nil ? .tertiaryLabelColor : .controlAccentColor)

            let titleX = keyRect.maxX + 10
            let titleRect = NSRect(x: titleX, y: rect.maxY - 21, width: rect.width - 46 - 92, height: 18)
            session.title.drawTruncated(in: titleRect, font: .systemFont(ofSize: 13.5, weight: .semibold), color: .labelColor)

            let meta = [session.repo, session.ipName, session.status].filter { !$0.isEmpty }.joined(separator: " · ")
            meta.drawTruncated(in: NSRect(x: titleX, y: rect.minY + 8, width: rect.width - 46 - 92, height: 15), font: .monospacedSystemFont(ofSize: 11, weight: .medium), color: .secondaryLabelColor)

            let relative = Self.relativeTime(session.activityAt)
            relative.draw(
                in: NSRect(x: rect.maxX - 90, y: rect.midY - 8, width: 80, height: 16),
                withAttributes: [
                    .font: NSFont.monospacedSystemFont(ofSize: 11, weight: .medium),
                    .foregroundColor: NSColor.secondaryLabelColor,
                    .paragraphStyle: rightAlignedStyle,
                ]
            )
        }
    }

    private func drawCentered(message: String) {
        message.draw(
            in: NSRect(x: inset + 12, y: bounds.midY - 18, width: bounds.width - 2 * inset - 24, height: 36),
            withAttributes: [
                .font: NSFont.systemFont(ofSize: 14, weight: .medium),
                .foregroundColor: NSColor.secondaryLabelColor,
                .paragraphStyle: centeredStyle,
            ]
        )
    }

    private func drawFooter() {
        let count = sessions.count
        let text = loading || error != nil ? "Mouse input disabled" : "Showing \(min(count, maxVisibleRows)) of \(count) · mouse input disabled"
        NSColor.separatorColor.withAlphaComponent(0.45).setFill()
        NSBezierPath(rect: NSRect(x: inset, y: footerHeight, width: bounds.width - 2 * inset, height: 1)).fill()
        text.draw(
            in: NSRect(x: inset + 4, y: 12, width: bounds.width - 2 * inset, height: 16),
            withAttributes: [
                .font: NSFont.monospacedSystemFont(ofSize: 10.5, weight: .medium),
                .foregroundColor: NSColor.tertiaryLabelColor,
            ]
        )
    }

    override func keyDown(with event: NSEvent) {
        if event.keyCode == UInt16(kVK_Escape) || event.charactersIgnoringModifiers == "\u{1b}" {
            onCancel?()
            return
        }
        switch event.specialKey {
        case .upArrow:
            moveSelection(-1)
        case .downArrow:
            moveSelection(1)
        case .carriageReturn, .enter:
            openSelected()
        default:
            if let chars = event.charactersIgnoringModifiers, chars.count == 1 {
                let ch = chars.lowercased()
                if ch == "0" { openIndex(9); return }
                if let n = Int(ch), (1...9).contains(n) { openIndex(n - 1); return }
            }
            super.keyDown(with: event)
        }
    }

    private func moveSelection(_ delta: Int) {
        guard !sessions.isEmpty else { return }
        selectedIndex = min(max(0, selectedIndex + delta), sessions.count - 1)
        ensureSelectionVisible()
        needsDisplay = true
    }

    private func ensureSelectionVisible() {
        if selectedIndex < scrollOffset { scrollOffset = selectedIndex }
        if selectedIndex >= scrollOffset + maxVisibleRows { scrollOffset = selectedIndex - maxVisibleRows + 1 }
        scrollOffset = min(max(0, scrollOffset), max(0, sessions.count - maxVisibleRows))
    }

    private func openSelected() { openIndex(selectedIndex) }

    private func openIndex(_ index: Int) {
        guard sessions.indices.contains(index) else { return }
        onOpen?(sessions[index])
    }

    static func hotkeyLabel(for index: Int) -> String? {
        if index >= 0 && index <= 8 { return String(index + 1) }
        if index == 9 { return "0" }
        return nil
    }

    static func relativeTime(_ timestamp: TimeInterval) -> String {
        guard timestamp > 0 else { return "—" }
        let diff = max(0, Date().timeIntervalSince1970 - timestamp)
        if diff < 60 { return "now" }
        let minutes = Int(diff / 60)
        if minutes < 60 { return "\(minutes)m" }
        let hours = minutes / 60
        if hours < 24 { return "\(hours)h" }
        return "\(hours / 24)d"
    }

    private var centeredStyle: NSParagraphStyle {
        let p = NSMutableParagraphStyle()
        p.alignment = .center
        p.lineBreakMode = .byTruncatingTail
        return p
    }

    private var rightAlignedStyle: NSParagraphStyle {
        let p = NSMutableParagraphStyle()
        p.alignment = .right
        p.lineBreakMode = .byTruncatingTail
        return p
    }

    override func mouseDown(with event: NSEvent) {}
    override func mouseUp(with event: NSEvent) {}
    override func rightMouseDown(with event: NSEvent) {}
    override func otherMouseDown(with event: NSEvent) {}
    override func scrollWheel(with event: NSEvent) {}
}

private extension String {
    func drawTruncated(in rect: NSRect, font: NSFont, color: NSColor) {
        let p = NSMutableParagraphStyle()
        p.lineBreakMode = .byTruncatingTail
        (self as NSString).draw(in: rect, withAttributes: [NSAttributedString.Key.font: font, NSAttributedString.Key.foregroundColor: color, NSAttributedString.Key.paragraphStyle: p])
    }

    func drawCentered(in rect: NSRect, font: NSFont, color: NSColor) {
        let p = NSMutableParagraphStyle()
        p.alignment = .center
        p.lineBreakMode = .byTruncatingTail
        (self as NSString).draw(in: rect, withAttributes: [NSAttributedString.Key.font: font, NSAttributedString.Key.foregroundColor: color, NSAttributedString.Key.paragraphStyle: p])
    }
}

class AppDelegate: NSObject, NSApplicationDelegate, NSWindowDelegate {
    /// SwiftUI installs an internal NSApplication delegate proxy when the app
    /// uses `@NSApplicationDelegateAdaptor`. Consequently `NSApp.delegate` is
    /// not guaranteed to be this adapted delegate. Native bridge handlers use
    /// this process-local reference instead of casting the SwiftUI proxy.
    private(set) static weak var shared: AppDelegate?

    override init() {
        super.init()
        Self.shared = self
    }

    /// The deployment machinery bootouts every `com.arbol.*` LaunchAgent, which
    /// takes the resident ui-switcher down alongside the daemons on every
    /// deploy. Each UI launch re-bootstraps the agent when its plist is
    /// installed but the service is gone, so the global UI hotkeys self-heal
    /// without the deploy scripts needing to know about the agent.
    private static func ensureUISwitcherAgent() {
        let label = "com.arbol.ui-switcher"
        let plist = FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent("Library/LaunchAgents/\(label).plist")
        guard FileManager.default.fileExists(atPath: plist.path) else { return }
        let domain = "gui/\(getuid())"
        if runTool("/bin/launchctl", ["print", "\(domain)/\(label)"]) { return }
        _ = runTool("/bin/launchctl", ["bootstrap", domain, plist.path])
    }

    private static func runTool(_ path: String, _ arguments: [String]) -> Bool {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: path)
        process.arguments = arguments
        process.standardOutput = FileHandle.nullDevice
        process.standardError = FileHandle.nullDevice
        do { try process.run() } catch { return false }
        process.waitUntilExit()
        return process.terminationStatus == 0
    }

    private var controller: NSWindowController?
    private var oakenSwimlanesPanelController: NSWindowController?
    private var oakenSwimlanesPanelReady = false
    private lazy var uiInstanceLock = ArbolUIInstanceLock(ui: ARBOL_UI_KEY)
    private let trayController = ArbolTrayController()
    private let latestChatSessionsHotkey = LatestChatSessionsHotkeyController()
    private let quickInputHotkey = QuickInputHotkeyController()
    private let repoArtifactsHotkey = RepoArtifactsHotkeyController()
    private let entitySearchHotkey = EntitySearchHotkeyController()
    private let goToPageHotkey = GoToPageHotkeyController()
    private let linkedEntitiesHotkey = LinkedEntitiesHotkeyController()
    private let uiSwitcherHotkeys = UISwitcherHotkeysController()
    private var debugComunicadoController: DebugComunicadoController?
    private var permissionComunicadoController: PermissionComunicadoController?
    private var stewardOutputController: StewardOutputController?
    private var comunicadoFeedController: ComunicadoFeedController?
    // Retain the native players for asynchronous playback.
    private var lastSoundCompletionBySession: [String: String] = [:]
    private var completionSoundPlayers: [String: NSSound] = [:]
    // Turn-completion chime settings. Persisted natively (not in renderer
    // localStorage) so the playback decision here does not depend on the
    // WKWebView having flushed its storage.
    // Shared by the separately bundled UI apps. Preserve Willo's old settings
    // until a preference is first changed through any shell.
    private var completionSoundDefaults: UserDefaults {
        let defaults = UserDefaults(suiteName: "group.arbol")!
        let legacy = UserDefaults.standard.persistentDomain(forName: "com.arbol.ui.willo") ?? [:]
        defaults.register(defaults: [
            "arbol-completion-sound-enabled": legacy["arbol-completion-sound-enabled"] ?? true,
            "arbol-completion-sound-name": legacy["arbol-completion-sound-name"] ?? Self.defaultCompletionSoundName,
            "arbol-completion-sound-volume": 1.0,
        ])
        return defaults
    }
    private var completionSoundVolume: Float {
        Float(min(1, max(0, completionSoundDefaults.double(forKey: "arbol-completion-sound-volume"))))
    }
    // Store and display the slider position; apply the loudness curve only at
    // playback. Cubic gain spreads audible adjustment across the slider while
    // preserving exact silence at 0 and unity gain at 1.
    private var completionSoundPlaybackGain: Float {
        let volume = completionSoundVolume
        return volume * volume * volume
    }
    private var completionSoundEnabled: Bool {
        completionSoundDefaults.object(forKey: "arbol-completion-sound-enabled") as? Bool ?? true
    }
    private static let defaultCompletionSoundName = "classic-chime"
    private var completionSoundName: String {
        let stored = completionSoundDefaults.string(forKey: "arbol-completion-sound-name")
            ?? Self.defaultCompletionSoundName
        // The original bundled chime "5.mp3" was renamed to classic-chime.mp3;
        // honour selections persisted under the old name.
        return stored == "5" ? Self.defaultCompletionSoundName : stored
    }
    private func completionSound(named name: String) -> NSSound? {
        if let cached = completionSoundPlayers[name] { return cached }
        guard let url = Bundle.main.url(
            forResource: name, withExtension: "mp3", subdirectory: "resources/sounds"
        ) else { return nil }
        let sound = NSSound(contentsOf: url, byReference: false)
        if let sound { completionSoundPlayers[name] = sound }
        return sound
    }

    // Every chime bundled under resources/sounds, natural-sorted so "2" precedes "10".
    @MainActor func completionSoundSettings() -> [String: Any] {
        let names = (Bundle.main.urls(forResourcesWithExtension: "mp3", subdirectory: "resources/sounds") ?? [])
            .compactMap { $0.deletingPathExtension().lastPathComponent }
            .sorted { $0.compare($1, options: .numeric) == .orderedAscending }
        return [
            "ok": true,
            "enabled": completionSoundEnabled,
            "sound": completionSoundName,
            "volume": completionSoundVolume,
            "sounds": names,
        ]
    }

    @MainActor func setCompletionSoundSettings(enabled: Bool?, volume: Double?) -> [String: Any] {
        if let enabled { completionSoundDefaults.set(enabled, forKey: "arbol-completion-sound-enabled") }
        if let volume { completionSoundDefaults.set(volume, forKey: "arbol-completion-sound-volume") }
        return completionSoundSettings()
    }

    @MainActor func selectCompletionSound(named name: String) -> [String: Any] {
        guard completionSound(named: name) != nil else {
            return ["ok": false, "error": "Unknown completion sound: \(name)"]
        }
        completionSoundDefaults.set(name, forKey: "arbol-completion-sound-name")
        return ["ok": true, "sound": completionSoundName]
    }

    // Preview plays even while the chime is muted: the dropdown's play button
    // exists so the user can compare sounds before deciding to re-enable.
    @MainActor func previewCompletionSound(named name: String) -> [String: Any] {
        guard let sound = completionSound(named: name) else {
            return ["ok": false, "error": "Unknown completion sound: \(name)"]
        }
        sound.volume = completionSoundPlaybackGain
        sound.stop()
        guard sound.play() else { return ["ok": false, "error": "Could not play \(name)"] }
        return ["ok": true]
    }
    private var rebuildNotificationTimer: Timer?
    private var automaticEmailSyncRequestObserver: NSObjectProtocol?
    private var spec: UISpec {
        if ARBOL_UI_KEY == "detached" { return UISpec(bundle: "artifact", title: "Detached View") }
        return UI_SPECS[ARBOL_UI_KEY] ?? UI_SPECS["seqoya"]!
    }
    private var detachedLaunch: (artifact: String, number: Int, color: NSColor)? {
        guard ARBOL_UI_KEY == "detached" else { return nil }
        let args = ProcessInfo.processInfo.arguments
        func argument(after flag: String) -> String? {
            guard let index = args.firstIndex(of: flag), args.indices.contains(index + 1) else { return nil }
            return args[index + 1]
        }
        guard let encoded = argument(after: "--detached-artifact"),
              let data = Data(base64Encoded: encoded),
              let artifact = String(data: data, encoding: .utf8),
              let number = Int(argument(after: "--detached-number") ?? "") else { return nil }
        let hex = argument(after: "--detached-color") ?? "3E7CB1"
        return (artifact, number, Self.color(hex: hex))
    }

    private static func color(hex: String) -> NSColor {
        let value = UInt64(hex, radix: 16) ?? 0x3E7CB1
        return NSColor(
            calibratedRed: CGFloat((value >> 16) & 0xff) / 255,
            green: CGFloat((value >> 8) & 0xff) / 255,
            blue: CGFloat(value & 0xff) / 255,
            alpha: 1
        )
    }

    private static func detachedIcon(number: Int, color: NSColor) -> NSImage {
        let size = NSSize(width: 512, height: 512)
        let image = NSImage(size: size)
        image.lockFocus()
        NSGraphicsContext.current?.imageInterpolation = .high
        let tile = NSBezierPath(roundedRect: NSRect(x: 28, y: 28, width: 456, height: 456), xRadius: 104, yRadius: 104)
        color.setFill(); tile.fill()
        NSColor.white.withAlphaComponent(0.18).setStroke(); tile.lineWidth = 8; tile.stroke()
        let text = String(number) as NSString
        var fontSize: CGFloat = number < 10 ? 300 : (number < 100 ? 240 : 178)
        var font = NSFont.monospacedDigitSystemFont(ofSize: fontSize, weight: .heavy)
        let shadow = NSShadow(); shadow.shadowColor = NSColor.black.withAlphaComponent(0.22); shadow.shadowBlurRadius = 10; shadow.shadowOffset = NSSize(width: 0, height: -5)
        var attributes: [NSAttributedString.Key: Any] = [.font: font, .foregroundColor: NSColor.white, .shadow: shadow]
        var bounds = text.size(withAttributes: attributes)
        while bounds.width > 385 { fontSize -= 6; font = .monospacedDigitSystemFont(ofSize: fontSize, weight: .heavy); attributes[.font] = font; bounds = text.size(withAttributes: attributes) }
        text.draw(at: NSPoint(x: (512 - bounds.width) / 2, y: (512 - bounds.height) / 2 + 10), withAttributes: attributes)
        image.unlockFocus()
        return image
    }

    // Per-UI window frame persistence. Each UI is its own bundle id, so its
    // UserDefaults are isolated; we still namespace the key by bundle. Stored as
    // a screen-coordinate rect string, so position, size, AND which display the
    // window sits on are restored. (We persist explicitly rather than relying on
    // setFrameAutosaveName, which proved unreliable with the transparent
    // full-size-content titlebar.)
    private var frameModeKey: String { "arbol-window-mode-\(spec.bundle)" }
    private var legacyFrameKey: String { "arbol-frame-\(spec.bundle)" }
    private var frameMode: String { UserDefaults.standard.string(forKey: frameModeKey) ?? "full" }
    private var frameKey: String { "arbol-frame-\(spec.bundle)-\(frameMode)" }

    private func saveFrame() {
        guard let win = controller?.window else { return }
        UserDefaults.standard.set(NSStringFromRect(win.frame), forKey: frameKey)
    }

    private func restoreFrame(_ win: NSWindow) -> Bool {
        let keys = frameMode == "full" ? [frameKey, legacyFrameKey] : [frameKey]
        for key in keys {
            guard let s = UserDefaults.standard.string(forKey: key) else { continue }
            let rect = NSRectFromString(s)
            guard rect.width > 200, rect.height > 150 else { continue }
            // Only restore if the saved frame still intersects a connected screen
            // (otherwise it could land off-screen after a display change).
            let onScreen = NSScreen.screens.contains { $0.frame.intersects(rect) }
            guard onScreen else { continue }
            win.setFrame(rect, display: false)
            return true
        }
        return false
    }

    func windowDidMove(_ notification: Notification) {
        if let window = notification.object as? NSWindow, window === oakenSwimlanesPanelController?.window {
            saveOakenSwimlanesPanelFrame(window)
        } else { saveFrame() }
    }
    func windowDidResize(_ notification: Notification) {
        if let window = notification.object as? NSWindow, window === oakenSwimlanesPanelController?.window {
            saveOakenSwimlanesPanelFrame(window)
        } else { saveFrame() }
    }
    func windowShouldClose(_ sender: NSWindow) -> Bool {
        guard sender === oakenSwimlanesPanelController?.window else { return true }
        _ = closeOakenSwimlanesPanel()
        return false
    }
    func windowWillClose(_ notification: Notification) {
        if let window = notification.object as? NSWindow, window === oakenSwimlanesPanelController?.window {
            saveOakenSwimlanesPanelFrame(window)
        } else { saveFrame() }
    }

    func applicationWillFinishLaunching(_ notification: Notification) {
        // Hide from Dock/Cmd-Tab before AppKit finishes activating: the agent
        // is infrastructure, and `openApp` treats non-regular apps as non-UIs.
        if ARBOL_IS_UI_SWITCHER_AGENT {
            NSApp.setActivationPolicy(.accessory)
        }
    }

    func applicationDidFinishLaunching(_ notification: Notification) {
        if ARBOL_IS_UI_SWITCHER_AGENT {
            // Host ONLY the UI switcher. The popup hotkeys (quick input, chat
            // sessions, …) need windows and must stay with UI processes; if the
            // agent grabbed their singleton locks the popups would render from
            // a windowless process or not at all.
            uiSwitcherHotkeys.installIfAvailable()
            return
        }
        if ARBOL_UI_KEY == "detached" {
            guard let launch = detachedLaunch else { NSApp.terminate(nil); return }
            NSApp.applicationIconImage = Self.detachedIcon(number: launch.number, color: launch.color)
            showWindow()
            return
        }
        switch uiInstanceLock.acquire() {
        case .acquired, .unavailable:
            break
        case .alreadyRunning:
            // Do not create a second window. Activate the existing process even
            // when it came from another installation/build with a different
            // bundle identifier, then terminate this duplicate instance.
            activateExistingUIInstance()
            NSApp.terminate(nil)
            return
        }

        trayController.installIfAvailable()
        latestChatSessionsHotkey.installIfAvailable()
        quickInputHotkey.installIfAvailable()
        repoArtifactsHotkey.installIfAvailable()
        entitySearchHotkey.installIfAvailable()
        goToPageHotkey.installIfAvailable()
        linkedEntitiesHotkey.installIfAvailable()
        uiSwitcherHotkeys.installIfAvailable()
        DispatchQueue.global().async { Self.ensureUISwitcherAgent() }
        if ARBOL_UI_KEY == "willo" {
            let comunicadoFeed = ComunicadoFeedController()
            comunicadoFeedController = comunicadoFeed
            comunicadoFeed.startIfEnabled()
            Task { @MainActor [weak self] in
                let debugComunicados = DebugComunicadoController()
                self?.debugComunicadoController = debugComunicados
                debugComunicados.startIfAvailable()
                let permissionComunicados = PermissionComunicadoController()
                self?.permissionComunicadoController = permissionComunicados
                permissionComunicados.startIfAvailable()
                let stewardOutputs = StewardOutputController()
                self?.stewardOutputController = stewardOutputs
                stewardOutputs.startIfAvailable()
            }
        }
        if ARBOL_UI_KEY == "willo" {
            // Gmail ownership is process-local to Willo. Elma broadcasts a
            // durable cross-process request after Core accepts each user message;
            // consuming it here makes the Station progress bar observe the same
            // WebMailBridge instance that performs the work.
            _ = WebMailBridge.shared
            automaticEmailSyncRequestObserver = DistributedNotificationCenter.default().addObserver(
                forName: WebMailBridge.automaticSyncAfterUserMessageRequestNotification,
                object: nil,
                queue: .main
            ) { _ in
                Task { @MainActor in
                    _ = WebMailBridge.shared.consumePendingAutomaticSyncAfterUserMessage()
                }
            }
            if WebMailBridge.hasPendingAutomaticSyncAfterUserMessage() {
                Task { @MainActor in
                    _ = WebMailBridge.shared.consumePendingAutomaticSyncAfterUserMessage()
                }
            }
        }
        installRebuildCompleteNotificationHandlerIfNeeded()
        let backgroundLaunch = isRebuildBackgroundLaunchPending()
        showWindow(activate: !backgroundLaunch)
        if ARBOL_UI_KEY == "oaken", UserDefaults.standard.bool(forKey: "arbol-oaken-swimlanes-panel-visible") {
            _ = showOakenSwimlanesPanel()
        }
        if backgroundLaunch {
            DispatchQueue.main.asyncAfter(deadline: .now() + 8.0) { [weak self] in
                self?.clearRebuildBackgroundLaunchMarkerIfPresent()
            }
        }
    }

    private func activateExistingUIInstance() {
        let currentPID = ProcessInfo.processInfo.processIdentifier
        for app in NSWorkspace.shared.runningApplications where app.processIdentifier != currentPID {
            guard let bundleURL = app.bundleURL,
                  let bundle = Bundle(url: bundleURL),
                  (bundle.object(forInfoDictionaryKey: "ArbolUI") as? String) == ARBOL_UI_KEY
            else { continue }
            app.activate(options: [.activateAllWindows, .activateIgnoringOtherApps])
            return
        }
    }

    private func rebuildBackgroundLaunchMarkerURL() -> URL {
        FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent("Library/Application Support/Arbol/background-ui-launch.pending")
    }

    private func isRebuildBackgroundLaunchPending() -> Bool {
        FileManager.default.fileExists(atPath: rebuildBackgroundLaunchMarkerURL().path)
    }

    private func clearRebuildBackgroundLaunchMarkerIfPresent() {
        try? FileManager.default.removeItem(at: rebuildBackgroundLaunchMarkerURL())
    }

    private func installRebuildCompleteNotificationHandlerIfNeeded() {
        // UserNotifications remains available for the legacy `notify.show`
        // bridge. Build result Comunicados use the Feed.
        guard ARBOL_UI_KEY == "willo" || ARBOL_UI_KEY == "elma" else { return }
        UNUserNotificationCenter.current().delegate = self
        NSUserNotificationCenter.default.delegate = self
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound]) { granted, error in
            self.appendRebuildNotificationDebugLog("UN authorization requested: granted=\(granted) error=\(String(describing: error))")
        }
        // Only Willo consumes durable build result Comunicados.
        guard ARBOL_UI_KEY == "willo" else { return }
        Task { @MainActor [weak self] in
            self?.checkForRebuildCompleteNotification()
        }
        let timer = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { [weak self] _ in
            Task { @MainActor [weak self] in
                self?.checkForRebuildCompleteNotification()
            }
        }
        timer.tolerance = 0.25
        rebuildNotificationTimer = timer
    }

    @MainActor
    private func checkForRebuildCompleteNotification() {
        guard ARBOL_UI_KEY == "willo", let comunicadoFeedController else { return }
        let directory = FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent("Library/Application Support/Arbol/rebuilds/comunicados")
        guard let files = try? FileManager.default.contentsOfDirectory(
            at: directory, includingPropertiesForKeys: nil
        ) else { return }
        for file in files.sorted(by: { $0.lastPathComponent < $1.lastPathComponent }) where file.pathExtension == "json" {
            guard let data = try? Data(contentsOf: file),
                  let result = try? JSONDecoder().decode(BuildResultComunicado.self, from: data) else { continue }
            // Consume once, including disabled Species; never replay muted results.
            do { try FileManager.default.removeItem(at: file) } catch { continue }
            guard comunicadoSpeciesEnabled(result.species) else { continue }
            comunicadoFeedController.append(ComunicadoFeedItem(
                id: "build-\(result.runId)",
                species: result.succeeded ? "Build Success Comunicado" : "Build Failure Comunicado",
                title: result.title,
                content: result.content,
                emittedAt: Date(timeIntervalSince1970: result.finishedAt),
                descriptor: result.descriptor
            ))
            NSSound(named: NSSound.Name(result.soundName))?.play()
        }
    }

    private func rebuildNotificationDebugLogURL() -> URL {
        FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent("Library/Application Support/Arbol/logs/rebuild-notification.log")
    }

    private func appendRebuildNotificationDebugLog(_ message: String) {
        let url = rebuildNotificationDebugLogURL()
        try? FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
        let line = "\(Date()) [\(ARBOL_UI_KEY)] \(message)\n"
        if let data = line.data(using: .utf8) {
            if FileManager.default.fileExists(atPath: url.path), let handle = try? FileHandle(forWritingTo: url) {
                try? handle.seekToEnd()
                try? handle.write(contentsOf: data)
                try? handle.close()
            } else {
                try? data.write(to: url)
            }
        }
    }

    private func deliverUserNotification(identifierPrefix: String, title: String, subtitle: String, body: String, autoRemoveAfter: TimeInterval? = nil, fallback: (() -> Void)? = nil) {
        let center = UNUserNotificationCenter.current()
        center.getNotificationSettings { [weak self] settings in
            let isActive = NSApp.isActive
            self?.appendRebuildNotificationDebugLog("UN settings authorizationStatus=\(settings.authorizationStatus.rawValue) alertSetting=\(settings.alertSetting.rawValue) alertStyle=\(settings.alertStyle.rawValue) notificationCenterSetting=\(settings.notificationCenterSetting.rawValue) appIsActive=\(isActive)")

            func addNotification() {
                let content = UNMutableNotificationContent()
                content.title = title
                content.subtitle = subtitle
                content.body = body
                content.sound = .default
                content.interruptionLevel = .active
                let request = UNNotificationRequest(
                    identifier: "\(identifierPrefix)-\(UUID().uuidString)",
                    content: content,
                    trigger: nil
                )
                center.add(request) { error in
                    if let error {
                        self?.appendRebuildNotificationDebugLog("UN notification add failed: \(error)")
                        DispatchQueue.main.async { fallback?() }
                    } else {
                        self?.appendRebuildNotificationDebugLog("UN notification added: \(request.identifier)")
                        if let delay = autoRemoveAfter {
                            DispatchQueue.main.asyncAfter(deadline: .now() + delay) {
                                center.removeDeliveredNotifications(withIdentifiers: [request.identifier])
                                self?.appendRebuildNotificationDebugLog("UN notification removed after \(delay)s: \(request.identifier)")
                            }
                        }
                    }
                }
            }

            switch settings.authorizationStatus {
            case .authorized, .provisional, .ephemeral:
                addNotification()
            case .notDetermined:
                center.requestAuthorization(options: [.alert, .sound]) { granted, error in
                    self?.appendRebuildNotificationDebugLog("UN authorization requested during delivery: granted=\(granted) error=\(String(describing: error))")
                    if granted { addNotification() }
                    else { DispatchQueue.main.async { fallback?() } }
                }
            case .denied:
                self?.appendRebuildNotificationDebugLog("UN notification denied; using fallback")
                DispatchQueue.main.async { fallback?() }
            @unknown default:
                self?.appendRebuildNotificationDebugLog("UN notification unknown auth status; using fallback")
                DispatchQueue.main.async { fallback?() }
            }
        }
    }

    @MainActor
    func comunicadoFeedState() -> [String: Any] {
        comunicadoFeedController?.state
            ?? ["ok": false, "enabled": false, "count": 0, "error": "Comunicado Feed is unavailable"]
    }

    @MainActor
    func setComunicadoFeedEnabled(_ enabled: Bool) -> [String: Any] {
        guard ARBOL_UI_KEY == "willo", let comunicadoFeedController else {
            return ["ok": false, "enabled": false, "count": 0, "error": "Comunicado Feed is available in Willo Station"]
        }
        comunicadoFeedController.setEnabled(enabled)
        return comunicadoFeedState()
    }

    private static let comunicadoSpeciesDefaultsPrefix = "arbol.comunicado.species."
    private static let supportedComunicadoSpecies = Set(["notification", "priority-notification", "debug", "build-success", "build-failure"])

    @MainActor
    func comunicadoSpeciesStates() -> [String: Any] {
        guard ARBOL_UI_KEY == "willo" else {
            return ["ok": false, "error": "Comunicado settings are available in Willo Station"]
        }
        return [
            "ok": true,
            "species": Dictionary(uniqueKeysWithValues: Self.supportedComunicadoSpecies.map {
                ($0, comunicadoSpeciesEnabled($0))
            }),
        ]
    }

    @MainActor
    func setComunicadoSpeciesEnabled(_ species: String, enabled: Bool) -> [String: Any] {
        guard ARBOL_UI_KEY == "willo" else {
            return ["ok": false, "error": "Comunicado settings are available in Willo Station"]
        }
        guard Self.supportedComunicadoSpecies.contains(species) else {
            return ["ok": false, "error": "Unknown Comunicado species: \(species)"]
        }
        UserDefaults.standard.set(enabled, forKey: Self.comunicadoSpeciesDefaultsPrefix + species)
        if species == "debug" {
            debugComunicadoController?.setDeliveryEnabled(enabled)
        }
        return ["ok": true, "species": species, "enabled": enabled]
    }

    @MainActor
    func comunicadoSpeciesEnabled(_ species: String) -> Bool {
        // A missing preference means enabled, preserving delivery behavior for
        // existing installs until a user explicitly disables a Species.
        let key = Self.comunicadoSpeciesDefaultsPrefix + species
        return UserDefaults.standard.object(forKey: key) as? Bool ?? true
    }

    @MainActor
    func appendDebugComunicadoToFeed(_ comunicado: DebugComunicado) {
        guard comunicadoSpeciesEnabled("debug") else { return }
        comunicadoFeedController?.append(ComunicadoFeedItem(
            id: "debug-\(comunicado.signalID)",
            species: "Debug Comunicado",
            title: comunicado.signalType,
            content: comunicado.formattedSignal,
            emittedAt: Date()
        ))
    }

    @MainActor
    func dismissDebugComunicadoInFeed(signalID: String) {
        comunicadoFeedController?.setState(.dismissed, forID: "debug-\(signalID)")
    }

    @MainActor
    func playCompletionSound(sessionID: String, completionID: String) -> Bool {
        guard ARBOL_UI_KEY == "willo" else { return false }
        guard completionSoundEnabled else { return true }
        if lastSoundCompletionBySession[sessionID] == completionID { return true }
        guard let sound = completionSound(named: completionSoundName) else { return false }
        sound.volume = completionSoundPlaybackGain
        sound.stop()
        guard sound.play() else { return false }
        lastSoundCompletionBySession[sessionID] = completionID
        return true
    }

    // Emit one Notification Comunicado into Willo's dedicated feed. A stable
    // caller-supplied instance id replaces an earlier instance with the same id.
    // Notification Comunicados intentionally do not use UserNotifications: the
    // Comunicado Feed is their sole Presentation.
    @MainActor
    func emitNotificationComunicado(_ comunicado: NotificationComunicado) -> Bool {
        guard comunicadoSpeciesEnabled("notification"), let comunicadoFeedController else { return false }
        comunicadoFeedController.append(
            ComunicadoFeedItem(
                id: comunicado.id,
                species: "Notification Comunicado",
                title: comunicado.title,
                content: comunicado.content,
                emittedAt: Date(),
                descriptor: comunicado.descriptor
            ),
            activeFor: NotificationComunicadoSpecies.activeTimeout
        )
        return true
    }

    /// Emit a Priority Notification into the same Willo Feed as a regular
    /// Notification. Its independent Species setting deliberately means users
    /// can silence routine notifications without hiding important ones.
    @MainActor
    func emitPriorityNotificationComunicado(_ comunicado: NotificationComunicado) -> Bool {
        guard comunicadoSpeciesEnabled(PriorityNotificationComunicadoSpecies.identifier),
              let comunicadoFeedController else { return false }
        comunicadoFeedController.append(
            ComunicadoFeedItem(
                id: comunicado.id,
                species: "Priority Notification Comunicado",
                title: comunicado.title,
                content: comunicado.content,
                emittedAt: Date(),
                descriptor: comunicado.descriptor
            ),
            activeFor: PriorityNotificationComunicadoSpecies.activeTimeout
        )
        return true
    }

    // Compatibility entry point for the older `notify.show` bridge. New callers
    // should instantiate the Notification Comunicado Species instead.
    func presentAppNotification(title: String, subtitle: String, body: String) {
        deliverUserNotification(identifierPrefix: "arbol-app", title: title, subtitle: subtitle, body: body)
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { ARBOL_UI_KEY == "detached" }

    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows: Bool) -> Bool {
        // A floating auxiliary panel does not count as the main Oaken board for
        // Dock reopen purposes. Reopen the board whenever its own window is hidden.
        if controller?.window?.isVisible != true { showWindow() }
        return true
    }

    // HyperKey activates the app by bundle id; make sure a window is shown even
    // if it had been closed/hidden while the app kept running.
    func applicationDidBecomeActive(_ notification: Notification) {
        if ARBOL_UI_KEY != "detached" { recordLastActiveArbolUI() }
        if controller?.window?.isVisible != true { showWindow() }
    }


    private static let oakenSwimlanesPanelFrameKey = "arbol-frame-oaken-swimlanes-panel"

    @MainActor
    func showOakenSwimlanesPanel() -> [String: Any] {
        guard ARBOL_UI_KEY == "oaken" else {
            return ["ok": false, "error": "Swimlanes timer panel is available in Oaken"]
        }
        let panel = ensureOakenSwimlanesPanel()
        UserDefaults.standard.set(true, forKey: "arbol-oaken-swimlanes-panel-visible")
        if oakenSwimlanesPanelReady { panel.orderFrontRegardless() }
        return ["ok": true, "visible": true]
    }

    @MainActor
    func oakenSwimlanesPanelDidBecomeReady() -> [String: Any] {
        guard ARBOL_UI_KEY == "oaken" else { return ["ok": false] }
        oakenSwimlanesPanelReady = true
        if UserDefaults.standard.bool(forKey: "arbol-oaken-swimlanes-panel-visible") {
            oakenSwimlanesPanelController?.window?.orderFrontRegardless()
        }
        return ["ok": true]
    }

    @MainActor
    func closeOakenSwimlanesPanel() -> [String: Any] {
        UserDefaults.standard.set(false, forKey: "arbol-oaken-swimlanes-panel-visible")
        oakenSwimlanesPanelController?.window?.orderOut(nil)
        return ["ok": true, "visible": false]
    }

    @MainActor
    func openOakenSwimlane(swimlaneID: String) -> [String: Any] {
        guard ARBOL_UI_KEY == "oaken", !swimlaneID.isEmpty else {
            return ["ok": false, "error": "missing swimlane id"]
        }
        showWindow()
        dispatchOakenEvent(name: "arbol-oaken-open-swimlane", detail: ["swimlane_id": swimlaneID], includePanel: false)
        return ["ok": true]
    }

    @MainActor
    func notifyOakenSwimlanesChanged() {
        guard ARBOL_UI_KEY == "oaken" else { return }
        dispatchOakenEvent(name: "arbol-oaken-swimlanes-changed", detail: [:], includePanel: true)
    }

    @MainActor
    func showEntityRelationshipSearch(entity: [String: Any]) -> [String: Any] {
        guard let source = EntityLinkEndpoint(value: entity) else {
            return ["ok": false, "error": "invalid Entity identity"]
        }
        entitySearchHotkey.showForRelationship(source: source)
        return ["ok": true]
    }

    @MainActor
    func showEntityRelationshipSearch(entityURI: String) -> [String: Any] {
        guard let source = EntityLinkEndpoint(uri: entityURI) else {
            return ["ok": false, "error": "invalid Entity URI"]
        }
        entitySearchHotkey.showForRelationship(source: source)
        return ["ok": true]
    }

    @MainActor
    func showEntitySearchForLivingTopic(
        livingTopicID: String, livingTopicTitle: String
    ) -> [String: Any] {
        guard ARBOL_UI_KEY == "seqoya", !livingTopicID.isEmpty else {
            return ["ok": false, "error": "missing living topic id"]
        }
        entitySearchHotkey.showForLivingTopicLink(topicTitle: livingTopicTitle) { [weak self] entity in
            _ = try await CoreClient.shared.call(method: "living_topic.link_entity", params: [
                "living_topic_id": livingTopicID,
                "target_entity_id": entity.entityID,
                "target_repo": entity.repo,
                "target_kind": entity.kind,
            ])
            _ = try? await CoreClient.shared.call(method: "entity.record_access", params: [
                "repo": entity.repo, "kind": entity.kind,
                "entity_id": entity.entityID, "access_kind": "link_living_topic",
            ])
            await MainActor.run {
                self?.dispatchWebEvent(
                    name: "arbol-living-topic-entity-linked",
                    detail: ["living_topic_id": livingTopicID, "entity_id": entity.entityID]
                )
            }
        }
        return ["ok": true]
    }

    @MainActor
    func showEntitySearchForSwimmer(
        swimlaneID: String, swimmerID: String, swimmerTitle: String
    ) -> [String: Any] {
        guard ARBOL_UI_KEY == "oaken", !swimlaneID.isEmpty, !swimmerID.isEmpty else {
            return ["ok": false, "error": "missing swimlane or swimmer id"]
        }
        entitySearchHotkey.showForEntityLink(swimmerTitle: swimmerTitle) { [weak self] entity in
            _ = try await CoreClient.shared.call(method: "oaken.swimlane.add_entity", params: [
                "swimlane_id": swimlaneID,
                "swimmer_id": swimmerID,
                "source_entity_id": entity.entityID,
                "source_repo": entity.repo,
                "kind": entity.kind,
                "title": entity.title,
                "ref": entity.uri,
                "ts": Int64(Date().timeIntervalSince1970 * 1000),
            ])
            _ = try? await CoreClient.shared.call(method: "entity.record_access", params: [
                "repo": entity.repo, "kind": entity.kind,
                "entity_id": entity.entityID, "access_kind": "link_swimmer",
            ])
            await MainActor.run {
                self?.notifyOakenSwimlanesChanged()
                self?.dispatchOakenEvent(
                    name: "arbol-oaken-entity-linked",
                    detail: [
                        "swimlane_id": swimlaneID, "swimmer_id": swimmerID,
                        "entity_id": entity.entityID, "entity_title": entity.title,
                    ],
                    includePanel: true
                )
            }
        }
        return ["ok": true]
    }

    /// Open the standard Entity Search popup to pick an Entity for the New
    /// Swimlane modal. Selection persists nothing: the picked Entity is handed
    /// back to the Oaken renderer, which owns the pending Swimlane draft.
    @MainActor
    func showEntitySearchForNewSwimlane() -> [String: Any] {
        guard ARBOL_UI_KEY == "oaken" else {
            return ["ok": false, "error": "New Swimlane entity picking is available in Oaken"]
        }
        entitySearchHotkey.showForNewSwimlanePick { [weak self] entity in
            await MainActor.run {
                self?.dispatchOakenEvent(
                    name: "arbol-oaken-entity-picked",
                    detail: [
                        "entity_id": entity.entityID, "uri": entity.uri,
                        "repo": entity.repo, "kind": entity.kind,
                        "title": entity.title,
                    ],
                    includePanel: false
                )
            }
        }
        return ["ok": true]
    }

    @MainActor
    private func ensureOakenSwimlanesPanel() -> NSPanel {
        if let panel = oakenSwimlanesPanelController?.window as? NSPanel { return panel }

        let host = ArbolWebContainerView(bundle: spec.bundle, launchQuery: ["panel": "swimlanes"])
        let panel = NSPanel(
            contentRect: NSRect(x: 0, y: 0, width: 320, height: 560),
            styleMask: [.titled, .nonactivatingPanel, .resizable, .fullSizeContentView, .utilityWindow],
            backing: .buffered,
            defer: false
        )
        panel.title = "Oaken Swimlanes Timer"
        panel.titleVisibility = .hidden
        panel.titlebarAppearsTransparent = true
        panel.isFloatingPanel = true
        panel.level = .floating
        panel.hidesOnDeactivate = false
        panel.becomesKeyOnlyIfNeeded = true
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
        panel.isMovable = true
        panel.isMovableByWindowBackground = true
        panel.isReleasedWhenClosed = false
        panel.contentView = host
        panel.delegate = self
        panel.minSize = NSSize(width: 280, height: 180)
        panel.maxSize = NSSize(width: 520, height: 1200)
        [NSWindow.ButtonType.closeButton, .miniaturizeButton, .zoomButton].forEach {
            panel.standardWindowButton($0)?.isHidden = true
        }
        restoreOakenSwimlanesPanelFrame(panel)
        oakenSwimlanesPanelController = NSWindowController(window: panel)
        return panel
    }

    private func restoreOakenSwimlanesPanelFrame(_ panel: NSPanel) {
        if let saved = UserDefaults.standard.string(forKey: Self.oakenSwimlanesPanelFrameKey) {
            let rect = NSRectFromString(saved)
            if rect.width >= 280, rect.height >= 180,
               NSScreen.screens.contains(where: { $0.frame.intersects(rect) }) {
                panel.setFrame(rect, display: false)
                return
            }
        }
        let anchor = controller?.window?.frame ?? NSScreen.main?.visibleFrame ?? panel.frame
        var rect = panel.frame
        rect.origin.x = anchor.maxX - rect.width
        rect.origin.y = anchor.maxY - rect.height
        if let visible = NSScreen.screens.first(where: { $0.frame.intersects(anchor) })?.visibleFrame ?? NSScreen.main?.visibleFrame {
            rect.origin.x = min(max(rect.origin.x, visible.minX), visible.maxX - rect.width)
            rect.origin.y = min(max(rect.origin.y, visible.minY), visible.maxY - rect.height)
        }
        panel.setFrame(rect, display: false)
    }

    private func saveOakenSwimlanesPanelFrame(_ window: NSWindow) {
        guard window === oakenSwimlanesPanelController?.window else { return }
        UserDefaults.standard.set(NSStringFromRect(window.frame), forKey: Self.oakenSwimlanesPanelFrameKey)
    }

    @MainActor
    private func dispatchWebEvent(name: String, detail: [String: Any]) {
        guard let data = try? JSONSerialization.data(withJSONObject: detail),
              let json = String(data: data, encoding: .utf8) else { return }
        let js = "window.dispatchEvent && window.dispatchEvent(new CustomEvent('\(name)', { detail: \(json) }))"
        for window in NSApp.windows {
            guard let contentView = window.contentView else { continue }
            for webView in Self.webViews(in: contentView) {
                webView.evaluateJavaScript(js, completionHandler: nil)
            }
        }
    }

    @MainActor
    private func dispatchOakenEvent(name: String, detail: [String: Any], includePanel: Bool) {
        guard let data = try? JSONSerialization.data(withJSONObject: detail),
              let json = String(data: data, encoding: .utf8) else { return }
        let js = "window.dispatchEvent && window.dispatchEvent(new CustomEvent('\(name)', { detail: \(json) }))"
        for window in NSApp.windows {
            if !includePanel, window === oakenSwimlanesPanelController?.window { continue }
            guard let contentView = window.contentView else { continue }
            for webView in Self.webViews(in: contentView) {
                webView.evaluateJavaScript(js, completionHandler: nil)
            }
        }
    }

    private static func webViews(in view: NSView) -> [WKWebView] {
        var found: [WKWebView] = view is WKWebView ? [view as! WKWebView] : []
        for child in view.subviews { found.append(contentsOf: webViews(in: child)) }
        return found
    }

    /// Restore and foreground this UI for an explicit cross-app `app.open`
    /// handoff. This cannot rely solely on `applicationDidBecomeActive`: a
    /// process can already be active while its main window is closed.
    @MainActor
    func activateMainWindowForOpenHandoff() {
        showWindow(activate: true)
    }

    private func showWindow(activate: Bool = true) {
        if controller == nil {
            // Use a direct AppKit web-view host instead of NSHostingView. This
            // avoids SwiftUI's window min/max constraint update path, which was
            // crashing Willo on launch when its renderer immediately toggled
            // compact/floating window mode.
            let launch = detachedLaunch
            let host = ArbolWebContainerView(
                bundle: spec.bundle,
                launchQuery: launch.map { ["artifact": $0.artifact, "detached_number": String($0.number)] } ?? [:]
            )
            let win = NSWindow(
                contentRect: NSRect(x: 0, y: 0, width: 900, height: 640),
                styleMask: [.titled, .closable, .miniaturizable, .resizable, .fullSizeContentView],
                backing: .buffered, defer: false
            )
            win.title = launch.map { "Detached View \($0.number)" } ?? spec.title
            win.titlebarAppearsTransparent = true
            win.titleVisibility = .hidden
            // Drag the window from any non-interactive part of the custom Header
            // (and background); interactive Header controls still receive clicks.
            win.isMovableByWindowBackground = true
            win.contentView = host
            win.isReleasedWhenClosed = false
            win.delegate = self
            controller = NSWindowController(window: win)
            // Restore this UI's saved frame (position/size/display); center only
            // on first launch when there's nothing valid saved.
            if !restoreFrame(win) { win.center() }
        }
        if activate {
            NSApp.activate(ignoringOtherApps: true)
            controller?.showWindow(nil)
            controller?.window?.makeKeyAndOrderFront(nil)
        } else {
            controller?.window?.orderFront(nil)
        }
    }
}


extension AppDelegate: UNUserNotificationCenterDelegate, NSUserNotificationCenterDelegate {
    func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification, withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        appendRebuildNotificationDebugLog("UN notification willPresent in foreground: \(notification.request.identifier)")
        if #available(macOS 11.0, *) {
            // macOS suppresses foreground notifications unless the delegate asks
            // for presentation explicitly. Request both the transient banner and
            // Notification Center entry so a completed response remains visible.
            completionHandler([.banner, .list, .sound])
        } else {
            completionHandler([.alert, .sound])
        }
    }

    func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse, withCompletionHandler completionHandler: @escaping () -> Void) {
        let descriptor = ComunicadoDescriptor.fromNotificationUserInfo(response.notification.request.content.userInfo)
        guard let descriptor else {
            // Compatibility notifications (rebuild-complete / notify.show)
            // retain their historical behavior of opening their host UI.
            Task { @MainActor [weak self] in
                self?.appendRebuildNotificationDebugLog("UN notification clicked without Comunicado descriptor")
                self?.showWindow(activate: true)
                completionHandler()
            }
            return
        }

        // Clicking a notification first activates the application that delivered
        // it. Finish that system activation before redirecting; otherwise macOS
        // can activate Willo again after `openApp` has already selected Elma.
        completionHandler()
        Task { @MainActor [weak self] in
            self?.appendRebuildNotificationDebugLog("UN Comunicado notification clicked; redirecting after host activation")
            try? await Task.sleep(nanoseconds: 150_000_000)
            let result = await descriptor.redirect()
            if result["ok"] as? Bool != true {
                self?.appendRebuildNotificationDebugLog("Comunicado redirect failed: \(result)")
                self?.showWindow(activate: true)
            } else {
                self?.appendRebuildNotificationDebugLog("Comunicado redirect succeeded: \(result)")
            }
        }
    }

    func userNotificationCenter(_ center: NSUserNotificationCenter, shouldPresent notification: NSUserNotification) -> Bool {
        appendRebuildNotificationDebugLog("NSUserNotification shouldPresent")
        return true
    }

    func userNotificationCenter(_ center: NSUserNotificationCenter, didActivate notification: NSUserNotification) {
        appendRebuildNotificationDebugLog("NSUserNotification clicked activationType=\(notification.activationType.rawValue)")
        DispatchQueue.main.async { [weak self] in
            self?.showWindow(activate: true)
        }
    }
}
