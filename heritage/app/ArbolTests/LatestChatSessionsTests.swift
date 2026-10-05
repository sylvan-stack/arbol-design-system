import XCTest
import AppKit
import Carbon
import WebKit
@testable import Arbol

final class LatestChatSessionsUnitTests: XCTestCase {
    func testCreateTemporaryTextFilePersistsExactClipboardText() throws {
        let root = FileManager.default.temporaryDirectory
            .appendingPathComponent("arbol-large-paste-tests-\(UUID().uuidString)", isDirectory: true)
        defer { try? FileManager.default.removeItem(at: root) }

        let content = "First line\nUnicode: 🌳\nLast line"
        let result = ContentView.Coordinator.createTemporaryTextFile(
            content: content,
            temporaryDirectory: root
        )

        XCTAssertEqual(result["ok"] as? Bool, true)
        let path = try XCTUnwrap(result["path"] as? String)
        XCTAssertTrue(path.hasPrefix(root.appendingPathComponent("Arbol/pasted-text").path))
        XCTAssertEqual(URL(fileURLWithPath: path).pathExtension, "txt")
        XCTAssertEqual(try String(contentsOfFile: path, encoding: .utf8), content)
        let attributes = try FileManager.default.attributesOfItem(atPath: path)
        XCTAssertEqual((attributes[.posixPermissions] as? NSNumber)?.intValue, 0o600)
        XCTAssertEqual(result["size"] as? Int, content.data(using: .utf8)?.count)
    }

    func testCreateTemporaryTextFileUsesUniqueNames() throws {
        let root = FileManager.default.temporaryDirectory
            .appendingPathComponent("arbol-large-paste-tests-\(UUID().uuidString)", isDirectory: true)
        defer { try? FileManager.default.removeItem(at: root) }

        let first = ContentView.Coordinator.createTemporaryTextFile(content: "one", temporaryDirectory: root)
        let second = ContentView.Coordinator.createTemporaryTextFile(content: "two", temporaryDirectory: root)

        XCTAssertNotEqual(first["path"] as? String, second["path"] as? String)
    }

    func testArtifactSearchRanksExactFilenameAheadOfRecentFuzzyPathMatches() {
        let exact = RepoArtifact(
            path: "/Artifacts/Arbol/GLOSSARY.md",
            displayPath: "~/Artifacts/Arbol/GLOSSARY.md",
            name: "GLOSSARY.md",
            accessedAt: 1
        )
        let recentFuzzy = RepoArtifact(
            path: "/Artifacts/Arbol/logs/validator-glossary.md.log",
            displayPath: "~/Artifacts/Arbol/logs/validator-glossary.md.log",
            name: "validator-glossary.md.log",
            accessedAt: 10_000
        )

        XCTAssertEqual(RepoArtifactStore.artifactMatchRank("glossary.md", artifact: exact), 0)
        XCTAssertGreaterThan(
            RepoArtifactStore.artifactMatchRank("glossary.md", artifact: recentFuzzy) ?? -1,
            RepoArtifactStore.artifactMatchRank("glossary.md", artifact: exact) ?? Int.max
        )
        XCTAssertEqual(
            RepoArtifactStore.filter([recentFuzzy, exact], query: "glossary.md").map(\.path),
            [exact.path, recentFuzzy.path]
        )
    }

    func testUIInstanceLockAllowsOnlyOneProcessPerUIType() throws {
        let directory = FileManager.default.temporaryDirectory
            .appendingPathComponent("arbol-ui-lock-tests-\(UUID().uuidString)")
        defer { try? FileManager.default.removeItem(at: directory) }

        let firstElma = ArbolUIInstanceLock(ui: "elma", directory: directory)
        let secondElma = ArbolUIInstanceLock(ui: "elma", directory: directory)
        let willo = ArbolUIInstanceLock(ui: "willo", directory: directory)

        XCTAssertEqual(firstElma.acquire(), .acquired)
        XCTAssertEqual(secondElma.acquire(), .alreadyRunning)
        XCTAssertEqual(willo.acquire(), .acquired)
        XCTAssertEqual(firstElma.acquire(), .acquired)
    }

    func testWindowDownsizeChoosesHalfWithMostPreviousSurface() {
        let screen = NSRect(x: 0, y: 0, width: 1200, height: 800)

        let mostlyLeft = ContentView.Coordinator.horizontalHalf(
            for: NSRect(x: 350, y: 120, width: 500, height: 500), on: screen
        )
        XCTAssertEqual(mostlyLeft.side, "left")
        XCTAssertEqual(mostlyLeft.frame, NSRect(x: 0, y: 0, width: 600, height: 800))

        let mostlyRight = ContentView.Coordinator.horizontalHalf(
            for: NSRect(x: 500, y: 120, width: 500, height: 500), on: screen
        )
        XCTAssertEqual(mostlyRight.side, "right")
        XCTAssertEqual(mostlyRight.frame, NSRect(x: 600, y: 0, width: 600, height: 800))
    }

    func testWindowDownsizeUsesPreviousCenterForEqualSurfaceTie() {
        let screen = NSRect(x: 0, y: 0, width: 1200, height: 800)
        let centered = ContentView.Coordinator.horizontalHalf(
            for: NSRect(x: 400, y: 120, width: 400, height: 500), on: screen
        )
        XCTAssertEqual(centered.side, "left")

        let outsideToRight = ContentView.Coordinator.horizontalHalf(
            for: NSRect(x: 1300, y: 120, width: 400, height: 500), on: screen
        )
        XCTAssertEqual(outsideToRight.side, "right")
    }

    func testWindowDownsizeCoversOddWidthWithoutGap() {
        let screen = NSRect(x: -300, y: 23, width: 1201, height: 777)
        let left = ContentView.Coordinator.horizontalHalf(
            for: NSRect(x: -250, y: 100, width: 300, height: 300), on: screen
        )
        let right = ContentView.Coordinator.horizontalHalf(
            for: NSRect(x: 600, y: 100, width: 300, height: 300), on: screen
        )
        XCTAssertEqual(left.frame.maxX, right.frame.minX)
        XCTAssertEqual(left.frame.minX, screen.minX)
        XCTAssertEqual(right.frame.maxX, screen.maxX)
        XCTAssertEqual(left.frame.width + right.frame.width, screen.width)
    }

    func testRowParsesTitleRepoStatusAndNormalizesMillisecondTimestamps() throws {
        let row = try XCTUnwrap(LatestChatSessionRow([
            "id": "s1",
            "title": "  ",
            "workspace_dirs": ["/Users/example/repo/sylvan-stack/Arbol/"],
            "ip_name": "glm",
            "status": "idle",
            "created_at": 1_700_000_000,
            "updated_at": 1_700_000_123_456,
        ]))

        XCTAssertEqual(row.id, "s1")
        XCTAssertEqual(row.title, "Untitled chat")
        XCTAssertEqual(row.repo, "Arbol")
        XCTAssertEqual(row.ipName, "glm")
        XCTAssertEqual(row.status, "idle")
        XCTAssertEqual(row.activityAt, 1_700_000_123.456, accuracy: 0.001)
    }

    func testRowRejectsMissingIdAndDefaultsUnknownFields() {
        XCTAssertNil(LatestChatSessionRow(["title": "No id"]))
        let row = LatestChatSessionRow(["id": "s2"])
        XCTAssertEqual(row?.title, "Untitled chat")
        XCTAssertEqual(row?.repo, "Unknown repo")
        XCTAssertEqual(row?.status, "unknown")
        XCTAssertEqual(row?.activityAt, 0)
    }

    func testTopTenHotkeyLabelsAreOneThroughNineThenZero() {
        XCTAssertEqual((0...9).map { LatestChatSessionsListView.hotkeyLabel(for: $0) }, ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"])
        XCTAssertNil(LatestChatSessionsListView.hotkeyLabel(for: 10))
        XCTAssertNil(LatestChatSessionsListView.hotkeyLabel(for: -1))
    }

    func testElmaOpenHistoryTracksTransitionsAndDoesNotPromoteRepeatedPublication() throws {
        let suite = "arbol-latest-chat-history-tests-\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }

        LatestChatSessionsHistory.recordActiveSession("first", defaults: defaults)
        LatestChatSessionsHistory.recordActiveSession("second", defaults: defaults)
        LatestChatSessionsHistory.recordActiveSession("second", defaults: defaults)
        LatestChatSessionsHistory.recordActiveSession("third", defaults: defaults)

        var snapshot = LatestChatSessionsHistory.snapshot(defaults: defaults)
        XCTAssertEqual(snapshot.currentSessionID, "third")
        XCTAssertEqual(snapshot.recentlyOpenedSessionIDs, ["third", "second", "first"])

        LatestChatSessionsHistory.recordActiveSession(nil, defaults: defaults)
        snapshot = LatestChatSessionsHistory.snapshot(defaults: defaults)
        XCTAssertNil(snapshot.currentSessionID)
        XCTAssertEqual(snapshot.recentlyOpenedSessionIDs, ["third", "second", "first"])
    }

    func testRowsExcludeCurrentSessionAndPutPreviouslyOpenedSessionFirst() {
        let response: [String: Any] = ["chat_sessions": [
            ["id": "current", "updated_at": 5000],
            ["id": "previous", "updated_at": 1000],
            ["id": "older-open", "updated_at": 9000],
            ["id": "never-opened", "updated_at": 10000],
        ]]

        let rows = LatestChatSessionsModel.rows(
            from: response,
            excluding: "current",
            recentlyOpenedSessionIDs: ["current", "previous", "older-open"]
        )

        XCTAssertEqual(rows.map(\.id), ["previous", "older-open", "never-opened"])
        XCTAssertFalse(rows.contains { $0.id == "current" })
    }

    func testRepoArtifactFuzzyMatchUsesOrderedSubsequence() {
        XCTAssertTrue(RepoArtifactStore.fuzzyMatch("adr", in: "architecture/docs/readme.md"))
        XCTAssertTrue(RepoArtifactStore.fuzzyMatch("readme", in: "docs/readme.md"))
        XCTAssertFalse(RepoArtifactStore.fuzzyMatch("rda", in: "docs/readme.md"))
    }

    func testGoToPageFuzzySearchMatchesPageNameAcrossWordBoundaries() {
        let results = GoToPageHistory.results(query: "cwalk", history: [:])
        XCTAssertEqual(results.first?.id, "elma.change-walkthrough")
        XCTAssertTrue(GoToPageHistory.fuzzyMatch("mreq", in: "mergerequests"))
        XCTAssertFalse(GoToPageHistory.fuzzyMatch("xyz", in: "mergerequests"))
    }

    func testGoToPageResultsSortMatchingPagesByRecentAccess() {
        let results = GoToPageHistory.results(query: "", history: [
            "willo.slack": 10,
            "seqoya.monitoring": 30,
            "oaken.jira": 20,
        ])
        XCTAssertEqual(Array(results.prefix(3).map(\.id)), ["seqoya.monitoring", "oaken.jira", "willo.slack"])
    }

    func testGoToPageRecordsPageAccessInSharedHistory() throws {
        let suite = "arbol-go-to-page-tests-\(UUID().uuidString)"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suite))
        defer { defaults.removePersistentDomain(forName: suite) }
        GoToPageHistory.record(ui: "seqoya", page: "artifacts", at: 123, defaults: defaults)
        XCTAssertEqual(GoToPageHistory.snapshot(defaults: defaults)["seqoya.artifacts"], 123)
    }
}


final class ArbolTrayWorktreeTests: XCTestCase {
    func testPorcelainWorktreesUseDirectoryNamesAndPutMainFirst() {
        let raw = [
            "worktree /repo/Arbol/.bare", "bare", "",
            "worktree /repo/Arbol/feature-one", "HEAD abc",
            "branch refs/heads/feat/feature-one", "",
            "worktree /repo/Arbol/main", "HEAD def",
            "branch refs/heads/main", "",
            "worktree /repo/Arbol/detached", "HEAD 123", "detached", "",
        ].joined(separator: "\0").data(using: .utf8)!

        let rows = ArbolTrayController.parseArbolWorktrees(raw) { !$0.hasSuffix("detached") }

        XCTAssertEqual(rows.map(\.name), ["main", "feature-one"])
        XCTAssertEqual(rows.map(\.branch), ["main", "feat/feature-one"])
        XCTAssertEqual(rows.map(\.path), ["/repo/Arbol/main", "/repo/Arbol/feature-one"])
    }

    func testArchivedWorktreesAreHiddenFromRebuildMenu() {
        let raw = [
            "worktree /repo/Arbol/main", "HEAD def",
            "branch refs/heads/main", "",
            "worktree /repo/Arbol/archive/old-feature", "HEAD abc",
            "branch refs/heads/feat/old-feature", "",
        ].joined(separator: "\0").data(using: .utf8)!

        let rows = ArbolTrayController.parseArbolWorktrees(
            raw, archivePrefix: "/repo/Arbol/archive/") { _ in true }

        XCTAssertEqual(rows.map(\.name), ["main"])
    }

    func testBuildLabelShowsSourceWorktreeNextToBuildTime() {
        XCTAssertEqual(ArbolTrayController.formatBuildInfoLines([
            "branch": "feat/menu",
            "commit": "abc1234",
            "built_at": "2026-07-22 12:34",
            "source": "/repo/Arbol/menu-worktree",
        ]), [
            "Build: feat/menu @ abc1234",
            "built 2026-07-22 12:34 · source menu-worktree",
        ])
    }

    func testBuildLabelIncludesFriendlyName() {
        XCTAssertEqual(ArbolTrayController.formatBuildInfoLines([
            "build_name": "purple-goose", "branch": "main",
            "commit": "abc1234", "built_at": "2026-07-22 12:34",
        ]), [
            "Build: purple-goose · main @ abc1234",
            "built 2026-07-22 12:34",
        ])
    }

    func testBuildLabelOmitsTodaysDatesAndDuplicateWorktree() {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(secondsFromGMT: 0)!
        let now = ISO8601DateFormatter().date(from: "2026-08-17T18:00:00Z")!

        let lines = ArbolTrayController.formatBuildInfoLines([
            "build_name": "lucky-wolf", "branch": "main", "commit": "994c150",
            "built_at": "2026-08-17 16:42", "source": "/repo/Arbol/main",
            "effective_start": "2026-08-17T17:42:11Z",
        ], now: now, calendar: calendar)

        XCTAssertEqual(lines.count, 3)
        XCTAssertEqual(lines[0], "Build: lucky-wolf · main @ 994c150")
        XCTAssertEqual(lines[1], "built 16:42")
        XCTAssertTrue(lines[2].hasPrefix("active since "))
        let label = ArbolTrayController.formatBuildInfo([
            "build_name": "lucky-wolf", "branch": "main", "commit": "994c150",
            "built_at": "2026-08-17 16:42", "source": "/repo/Arbol/main",
            "effective_start": "2026-08-17T17:42:11Z",
        ], now: now, calendar: calendar)
        XCTAssertEqual(label, lines.joined(separator: "\n"))
        XCTAssertFalse(label.contains("2026-08-17"))
        XCTAssertFalse(label.contains("17 Aug 2026"))
        XCTAssertFalse(label.contains("source main"))
    }

    func testArchivedBuildsShowNewestSpanNotActivationRange() {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(secondsFromGMT: 0)!
        let now = ISO8601DateFormatter().date(from: "2026-08-20T18:00:00Z")!

        // The old build was restored today, so its activation interval is the
        // most recent — but as a build it was superseded when "new" was built.
        let data = try! JSONSerialization.data(withJSONObject: [[
            "build_id": "old", "name": "happy-lama",
            "built_at": "2026-01-01 10:00",
            "effective_start": "2026-08-20T12:00:00Z",
            "effective_end": NSNull(),
        ], [
            "build_id": "new", "name": "steady-owl",
            "built_at": "2026-01-03 09:00",
            "effective_start": "2026-01-03T09:05:00Z",
            "effective_end": "2026-08-20T12:00:00Z",
        ], [
            "build_id": "pending", "name": "quiet-owl",
            "effective_start": NSNull(), "effective_end": NSNull(),
        ]])
        let builds = ArbolTrayController.parseArchivedBuilds(data, installedBuildID: "old")
        XCTAssertEqual(builds.count, 2)
        XCTAssertTrue(builds.first { $0.buildID == "old" }!.isCurrent)

        let rows = ArbolTrayController.archivedBuildMenuRows(builds, now: now, calendar: calendar)
        XCTAssertEqual(rows.map(\.build.buildID), ["new", "old"])
        // The newest build spans until now even while an older build runs.
        XCTAssertTrue(rows[0].title.hasPrefix("steady-owl · "))
        XCTAssertTrue(rows[0].title.hasSuffix(" – now"))
        // The old build's span ends when the newer build was introduced —
        // restoring it today must not change that.
        XCTAssertTrue(rows[1].title.hasPrefix("happy-lama · "))
        let oldEnd = rows[1].title.components(separatedBy: " – ").last!
        XCTAssertTrue(oldEnd.contains("2026"))
        XCTAssertFalse(rows[1].title.contains("now"))
        XCTAssertFalse(rows[1].title.contains("Aug"))
    }

    func testArchivedBuildsFallBackToArchivedAtForOldMetadata() {
        let data = try! JSONSerialization.data(withJSONObject: [[
            "build_id": "legacy", "name": "calm-seal",
            "archived_at": "2026-01-01T10:00:00Z",
            "effective_start": "2026-01-01T10:05:00Z",
        ]])
        let builds = ArbolTrayController.parseArchivedBuilds(data)
        let rows = ArbolTrayController.archivedBuildMenuRows(builds)
        XCTAssertEqual(rows.count, 1)
        XCTAssertTrue(rows[0].title.hasPrefix("calm-seal · "))
        XCTAssertTrue(rows[0].title.hasSuffix(" – now"))
    }

    func testLegacyBuildLabelWithoutSourceStillWorks() {
        XCTAssertEqual(ArbolTrayController.formatBuildInfo([
            "branch": "main", "commit": "abc1234", "built_at": "2026-07-22 12:34",
        ]), "Build: main @ abc1234\nbuilt 2026-07-22 12:34")
    }

    func testStatusBarBuildInfoExtractsInstalledWorktreeName() {
        XCTAssertEqual(ContentView.Coordinator.worktreeName(fromBuildInfo: [
            "source": "/repo/Arbol/email-parsers-and-signal-rules",
        ]), "email-parsers-and-signal-rules")
        XCTAssertNil(ContentView.Coordinator.worktreeName(fromBuildInfo: [:]))
    }

    func testActiveRebuildWorktreeUsesPersistedStatusBarSelection() {
        let rows = [
            (name: "main", branch: "main", path: "/repo/Arbol/main"),
            (name: "feature", branch: "feat/feature", path: "/repo/Arbol/feature"),
        ]
        XCTAssertEqual(ArbolTrayController.activeRebuildWorktree(
            from: rows, persistedPath: "/repo/Arbol/feature/"
        )?.path, "/repo/Arbol/feature")
    }

    func testActiveRebuildWorktreeDefaultsToMainForMissingOrStaleSelection() {
        let rows = [
            (name: "feature", branch: "feat/feature", path: "/repo/Arbol/feature"),
            (name: "main", branch: "main", path: "/repo/Arbol/main"),
        ]
        XCTAssertEqual(ArbolTrayController.activeRebuildWorktree(
            from: rows, persistedPath: "/repo/Arbol/deleted"
        )?.path, "/repo/Arbol/main")
        XCTAssertEqual(ArbolTrayController.activeRebuildWorktree(
            from: rows, persistedPath: ""
        )?.path, "/repo/Arbol/main")
    }

    func testBuildEnvironmentFallsBackToMainWorktree() {
        let rows = [
            (name: "main", branch: "main", path: "/repo/Arbol/main"),
            (name: "feature", branch: "feat/feature", path: "/repo/Arbol/feature"),
        ]
        let result = ArbolTrayController.buildEnvironmentFile(
            for: "/repo/Arbol/feature",
            worktrees: rows,
            fileExists: { $0 == "/repo/Arbol/main/.env" }
        )
        XCTAssertEqual(result, "/repo/Arbol/main/.env")
    }

    func testBuildEnvironmentPrefersSelectedWorktree() {
        let rows = [(name: "main", branch: "main", path: "/repo/Arbol/main")]
        let result = ArbolTrayController.buildEnvironmentFile(
            for: "/repo/Arbol/feature",
            worktrees: rows,
            fileExists: { _ in true }
        )
        XCTAssertEqual(result, "/repo/Arbol/feature/.env")
    }

    @MainActor
    func testGmailAccessIsEnabledOnlyForVisibleUserMediatedCaptureAfterReviewedRecovery() {
        XCTAssertFalse(WebMailBridge.gmailAccessIsSuspended)
        XCTAssertTrue(WebMailBridge.legacyAutomatedGmailAccessIsDisabled)
    }

    @MainActor
    func testLegacyGmailAutomationRemainsDisabledIndependentlyOfIncidentSuspension() async {
        XCTAssertTrue(WebMailBridge.legacyAutomatedGmailAccessIsDisabled)
        XCTAssertFalse(WebMailBridge.shared.login()["ok"] as? Bool ?? true)
        let syncResult = await WebMailBridge.shared.sync(force: true)
        XCTAssertFalse(syncResult["ok"] as? Bool ?? true)
        let enrichResult = await WebMailBridge.shared.enrich(
            remoteURL: "https://mail.google.com/mail/u/0/#inbox/private",
            surfaceMessageID: "gmail-private"
        )
        XCTAssertFalse(enrichResult["ok"] as? Bool ?? true)
        XCTAssertFalse(WebMailBridge.shared.open(
            remoteURL: "https://mail.google.com/mail/u/0/#inbox/private"
        )["ok"] as? Bool ?? true)
    }

    @MainActor
    func testUserMediatedCaptureWindowIsNotAutoReleasedDuringClose() {
        let window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 100, height: 100),
            styleMask: [.titled, .closable], backing: .buffered, defer: false
        )
        XCTAssertTrue(window.isReleasedWhenClosed, "documents AppKit's unsafe programmatic-window default")
        WebMailBridge.configureUserMediatedWindowLifetime(window)
        XCTAssertFalse(window.isReleasedWhenClosed)
    }

    @MainActor
    func testAutomaticEmailSyncWindowOriginIsOutsideEveryDisplay() {
        let screens = [
            NSRect(x: -1_920, y: 0, width: 1_920, height: 1_080),
            NSRect(x: 0, y: -200, width: 2_560, height: 1_440),
        ]
        let windowFrame = NSRect(x: 0, y: 0, width: 1_740, height: 900)

        let origin = WebMailBridge.automaticSyncWindowOrigin(
            windowFrame: windowFrame, screenFrames: screens
        )
        let hiddenFrame = NSRect(origin: origin, size: windowFrame.size)

        XCTAssertTrue(screens.allSatisfy { !$0.intersects(hiddenFrame) })
        XCTAssertEqual(origin.x, -3_760)
        XCTAssertEqual(origin.y, -1_200)
    }

    @MainActor
    func testGmailAuxiliaryPanelDefaultsToHalfOfAvailableSplitWidth() {
        XCTAssertEqual(
            WebMailBridge.defaultAuxiliaryPanelDividerPosition(
                totalWidth: 1_740, dividerThickness: 1
            ),
            869.5,
            accuracy: 0.001
        )
        XCTAssertEqual(
            WebMailBridge.defaultAuxiliaryPanelDividerPosition(
                totalWidth: 1_000, dividerThickness: 0
            ),
            500,
            accuracy: 0.001
        )
    }

    @MainActor
    func testSelectedConversationComparisonAllowsCanonicalHashEncodingButNotAnotherThreadOrAccount() throws {
        let expected = try XCTUnwrap(URL(string: "https://mail.google.com/mail/u/0/#inbox/thread%20one"))
        XCTAssertTrue(WebMailBridge.sameSelectedConversation(
            URL(string: "https://mail.google.com/mail/u/0/#inbox/thread%20one?projector=1"), expected
        ))
        XCTAssertFalse(WebMailBridge.sameSelectedConversation(
            URL(string: "https://mail.google.com/mail/u/0/#inbox/thread-two"), expected
        ))
        XCTAssertFalse(WebMailBridge.sameSelectedConversation(
            URL(string: "https://mail.google.com/mail/u/1/#inbox/thread%20one"), expected
        ))
    }

    @MainActor
    func testSupervisedQueueFormatsEmailTimeAndCapsThreadsAtFifty() {
        XCTAssertEqual(WebMailBridge.maximumSelectedThreadMessageCount, 50)
        let value = WebMailBridge.userMediatedDiscoveryTimeLabel(1_700_000_000_000 as NSNumber)
        XCTAssertFalse(value.isEmpty)
        XCTAssertNotEqual(value, "—")
        XCTAssertEqual(WebMailBridge.userMediatedDiscoveryTimeLabel(nil), "—")
        XCTAssertEqual(WebMailBridge.userMediatedThreadLabel(nil), "Thread · 1 email")
        XCTAssertEqual(WebMailBridge.userMediatedThreadLabel(1 as NSNumber), "Thread · 1 email")
        XCTAssertEqual(WebMailBridge.userMediatedThreadLabel(7 as NSNumber), "Thread · 7 emails")
    }

    @MainActor
    func testSupervisedRetryFiltersDurablyCompleteAndIgnoredDiscoveries() {
        let discoveries: [String: [String: Any]] = [
            "complete": ["persisted_content_state": "complete"],
            "partial": ["persisted_content_state": "partial"],
            "failed": ["persisted_content_state": "preview"],
            "ignored": ["persisted_content_state": "preview"],
        ]
        XCTAssertEqual(
            WebMailBridge.userMediatedRetryDiscoveryIDs(
                ["complete", "partial", "failed", "ignored", "missing"],
                discoveries: discoveries, ignoredIDs: ["ignored"]
            ),
            ["partial", "failed"]
        )
    }

    @MainActor
    func testSupervisedThreadMaterializationUsesUniqueExpandAllThenOwnedMessageHeaders() async throws {
        let view = WKWebView(frame: NSRect(x: 0, y: 0, width: 900, height: 700))
        view.loadHTMLString("""
        <style>.adn,.gE,.gD,.g3,.kQ,.a3s,button,main { display:block; width:240px; min-height:24px }</style>
        <main role="main" data-thread-perm-id="thread-f:fixture">
          <button id="older" aria-label="Older messages">Older</button>
          <div id="history" class="kQ"><span class="adx">8</span></div>
          <button id="expand-all" data-tooltip="Expand all">Expand all</button>
          <div class="adn ads" data-message-id="msg-f:visible">
            <div class="gE"><span class="gD" email="visible@example.test"></span><span class="g3" title="Jan 1, 2026"></span></div>
            <div class="a3s aiL">Already visible fixture body</div>
          </div>
        </main>
        <script>
          window.headerClicks = 0; window.otherClicks = 0; window.expandAllClicks = 0;
          const main = document.querySelector('main');
          document.getElementById('expand-all').onclick = event => {
            window.expandAllClicks += 1;
            event.currentTarget.remove();
            for (const value of ['one', 'two']) {
              const card = document.createElement('div');
              card.className = 'adn ads'; card.setAttribute('data-message-id', 'msg-f:' + value);
              card.innerHTML = '<div class="gE"><span class="gD" email="' + value
                + '@example.test"></span><span class="g3" title="Jan 2, 2026"></span></div>';
              card.querySelector('.gE').onclick = headerEvent => {
                headerEvent.currentTarget.parentElement.insertAdjacentHTML(
                  'beforeend', '<div class="a3s aiL">Complete fixture body</div>'
                );
                window.headerClicks += 1;
              };
              main.appendChild(card);
            }
          };
          older.onclick = history.onclick = () => { window.otherClicks += 1; };
        </script>
        """, baseURL: URL(string: "https://mail.google.com/mail/u/0/#inbox/thread"))
        try await Task.sleep(nanoseconds: 250_000_000)
        let value = try await view.callAsyncJavaScript(
            WebMailBridge.supervisedThreadMaterializationScript,
            arguments: ["expectedThreadCount": 3, "maximumThreadMessages": 50], contentWorld: .page
        )
        let result = try XCTUnwrap(value as? [String: Any])
        XCTAssertEqual((result["over_limit"] as? NSNumber)?.boolValue, false)
        XCTAssertEqual((result["initial_candidate_count"] as? NSNumber)?.intValue, 1)
        XCTAssertEqual((result["expand_all_candidate_count"] as? NSNumber)?.intValue, 1)
        XCTAssertEqual((result["expand_all_clicked"] as? NSNumber)?.boolValue, true)
        XCTAssertEqual((result["clicked_count"] as? NSNumber)?.intValue, 2)
        XCTAssertEqual((result["candidate_count"] as? NSNumber)?.intValue, 3)
        XCTAssertEqual((result["body_count"] as? NSNumber)?.intValue, 3)
        XCTAssertEqual((result["bodyless_count"] as? NSNumber)?.intValue, 0)
        let headerClicks = try await view.callAsyncJavaScript(
            "return Number(window.headerClicks || 0)", arguments: [:], contentWorld: .page
        ) as? NSNumber
        let expandAllClicks = try await view.callAsyncJavaScript(
            "return Number(window.expandAllClicks || 0)", arguments: [:], contentWorld: .page
        ) as? NSNumber
        let otherClicks = try await view.callAsyncJavaScript(
            "return Number(window.otherClicks || 0)", arguments: [:], contentWorld: .page
        ) as? NSNumber
        XCTAssertEqual(headerClicks?.intValue, 2)
        XCTAssertEqual(expandAllClicks?.intValue, 1)
        XCTAssertEqual(otherClicks?.intValue, 0)
        XCTAssertFalse(WebMailBridge.supervisedThreadMaterializationScript.contains("scroll"))
        XCTAssertFalse(WebMailBridge.supervisedThreadMaterializationScript.contains("location.href"))
        XCTAssertFalse(WebMailBridge.supervisedThreadMaterializationScript.contains(".kQ"))
    }

    @MainActor
    func testSupervisedThreadMaterializationRetriesOnlyAHeaderThatRemainsBodyless() async throws {
        let view = WKWebView(frame: NSRect(x: 0, y: 0, width: 900, height: 700))
        view.loadHTMLString("""
        <style>.adn,.gE,.gD,.g3,.a3s,main { display:block; width:240px; min-height:24px }</style>
        <main role="main" data-thread-perm-id="thread-f:fixture">
          <div class="adn ads" data-message-id="msg-f:visible">
            <div class="gE iv gt"><span class="gD" email="visible@example.test"></span><span class="g3" title="Jan 1, 2026"></span></div>
            <div class="a3s aiL">Already visible fixture body</div>
          </div>
          <div id="collapsed" class="adn ads" data-message-id="msg-f:collapsed">
            <div id="collapsed-header" class="gE iv gt"><span class="gD" email="collapsed@example.test"></span><span class="g3" title="Jan 2, 2026"></span></div>
          </div>
        </main>
        <script>
          window.headerClicks = 0;
          document.getElementById('collapsed-header').onclick = event => {
            window.headerClicks += 1;
            if (window.headerClicks === 2) event.currentTarget.parentElement.insertAdjacentHTML(
              'beforeend', '<div class="a3s aiL">Body after the retried header click</div>'
            );
          };
        </script>
        """, baseURL: URL(string: "https://mail.google.com/mail/u/0/#inbox/thread"))
        try await Task.sleep(nanoseconds: 250_000_000)
        let value = try await view.callAsyncJavaScript(
            WebMailBridge.supervisedThreadMaterializationScript,
            arguments: ["expectedThreadCount": 2, "maximumThreadMessages": 50], contentWorld: .page
        )
        let result = try XCTUnwrap(value as? [String: Any])
        XCTAssertEqual((result["clicked_count"] as? NSNumber)?.intValue, 1)
        XCTAssertEqual((result["header_click_attempt_count"] as? NSNumber)?.intValue, 2)
        XCTAssertEqual((result["candidate_count"] as? NSNumber)?.intValue, 2)
        XCTAssertEqual((result["body_count"] as? NSNumber)?.intValue, 2)
        XCTAssertEqual((result["bodyless_count"] as? NSNumber)?.intValue, 0)
    }

    @MainActor
    func testSupervisedCaptureReadsRenderedBodiesHiddenByGmailAccordion() async throws {
        let view = WKWebView(frame: NSRect(x: 0, y: 0, width: 900, height: 700))
        view.loadHTMLString("""
        <style>
          .adn,.gE,.gD,.g3,.a3s,main { display:block; width:240px; min-height:24px }
          #hidden-body { display:none }
        </style>
        <main role="main" data-thread-perm-id="thread-f:fixture">
          <div id="hidden-card" class="adn ads" data-message-id="msg-f:hidden">
            <div class="gE iv gt"><span class="gD" email="hidden@example.test" name="Hidden"></span><span class="g3" title="Jan 1, 2026"></span></div>
            <div id="hidden-body" class="a3s aiL">Complete body retained under display none</div>
          </div>
          <div class="adn ads" data-message-id="msg-f:visible">
            <div class="gE iv gt"><span class="gD" email="visible@example.test" name="Visible"></span><span class="g3" title="Jan 2, 2026"></span></div>
            <div class="a3s aiL">Visible complete body</div>
          </div>
        </main>
        <script>
          window.headerClicks = 0;
          document.querySelectorAll('.gE').forEach(node => node.onclick = () => {
            window.headerClicks += 1;
          });
        </script>
        """, baseURL: URL(string: "https://mail.google.com/mail/u/0/#inbox/thread"))
        try await Task.sleep(nanoseconds: 250_000_000)

        let materializationValue = try await view.callAsyncJavaScript(
            WebMailBridge.supervisedThreadMaterializationScript,
            arguments: ["expectedThreadCount": 2, "maximumThreadMessages": 50], contentWorld: .page
        )
        let materialization = try XCTUnwrap(materializationValue as? [String: Any])
        XCTAssertEqual((materialization["body_count"] as? NSNumber)?.intValue, 2)
        XCTAssertEqual((materialization["bodyless_count"] as? NSNumber)?.intValue, 0)
        XCTAssertEqual((materialization["header_click_attempt_count"] as? NSNumber)?.intValue, 0)

        let detailValue = try await view.callAsyncJavaScript(
            WebMailBridge.detailScript, arguments: ["expectedThreadCount": 2], contentWorld: .page
        )
        let detail = try XCTUnwrap(detailValue as? [String: Any])
        XCTAssertEqual((detail["message_count"] as? NSNumber)?.intValue, 2)
        XCTAssertEqual((detail["collapsed_message_count"] as? NSNumber)?.intValue, 0)
        let messages = try XCTUnwrap(detail["messages"] as? [[String: Any]])
        XCTAssertTrue(messages.contains {
            ($0["provider_message_id"] as? String) == "hidden"
                && ($0["body_text"] as? String) == "Complete body retained under display none"
        })
        let headerClicks = try await view.callAsyncJavaScript(
            "return Number(window.headerClicks || 0)", arguments: [:], contentWorld: .page
        ) as? NSNumber
        XCTAssertEqual(headerClicks?.intValue, 0)
    }

    @MainActor
    func testSupervisedThreadMaterializationDoesNotClickAmbiguousExpandAllControls() async throws {
        let view = WKWebView(frame: NSRect(x: 0, y: 0, width: 900, height: 700))
        view.loadHTMLString("""
        <style>.adn,.gE,.gD,.g3,.a3s,button,main { display:block; width:240px; min-height:24px }</style>
        <main role="main" data-thread-perm-id="thread-f:fixture">
          <button class="expand" aria-label="Expand all">Expand all A</button>
          <button class="expand" data-tooltip="Expand all">Expand all B</button>
          <div class="adn ads" data-message-id="msg-f:visible">
            <div class="gE"><span class="gD" email="visible@example.test"></span><span class="g3" title="Jan 1, 2026"></span></div>
            <div class="a3s aiL">Already visible fixture body</div>
          </div>
        </main>
        <script>
          window.expandAllClicks = 0;
          document.querySelectorAll('.expand').forEach(node => node.onclick = () => { window.expandAllClicks += 1; });
        </script>
        """, baseURL: URL(string: "https://mail.google.com/mail/u/0/#inbox/thread"))
        try await Task.sleep(nanoseconds: 250_000_000)
        let value = try await view.callAsyncJavaScript(
            WebMailBridge.supervisedThreadMaterializationScript,
            arguments: ["expectedThreadCount": 3, "maximumThreadMessages": 50], contentWorld: .page
        )
        let result = try XCTUnwrap(value as? [String: Any])
        XCTAssertEqual((result["expand_all_candidate_count"] as? NSNumber)?.intValue, 2)
        XCTAssertEqual((result["expand_all_clicked"] as? NSNumber)?.boolValue, false)
        let clicks = try await view.callAsyncJavaScript(
            "return Number(window.expandAllClicks || 0)", arguments: [:], contentWorld: .page
        ) as? NSNumber
        XCTAssertEqual(clicks?.intValue, 0)
    }

    @MainActor
    func testSupervisedThreadMaterializationRejectsOverFiftyBeforeClicking() async throws {
        let view = WKWebView(frame: NSRect(x: 0, y: 0, width: 900, height: 700))
        view.loadHTMLString("""
        <style>.adn,.gE { display:block; width:240px; min-height:24px }</style>
        <div class="adn ads"><div id="header" class="gE">Header</div></div>
        <script>window.headerClicks = 0; header.onclick = () => { window.headerClicks += 1; };</script>
        """, baseURL: URL(string: "https://mail.google.com/mail/u/0/#inbox/thread"))
        try await Task.sleep(nanoseconds: 250_000_000)
        let value = try await view.callAsyncJavaScript(
            WebMailBridge.supervisedThreadMaterializationScript,
            arguments: ["expectedThreadCount": 51, "maximumThreadMessages": 50], contentWorld: .page
        )
        let result = try XCTUnwrap(value as? [String: Any])
        XCTAssertEqual((result["over_limit"] as? NSNumber)?.boolValue, true)
        XCTAssertEqual((result["clicked_count"] as? NSNumber)?.intValue, 0)
        XCTAssertEqual((result["expand_all_candidate_count"] as? NSNumber)?.intValue, 0)
        XCTAssertEqual((result["expand_all_clicked"] as? NSNumber)?.boolValue, false)
        let clicks = try await view.callAsyncJavaScript(
            "return Number(window.headerClicks || 0)", arguments: [:], contentWorld: .page
        ) as? NSNumber
        XCTAssertEqual(clicks?.intValue, 0)
    }

    @MainActor
    func testSelectedBatchProbeIsPassiveIdentityBounded() {
        let source = WebMailBridge.selectedConversationPassiveProbe
        XCTAssertTrue(source.contains("expectedConversationID"))
        XCTAssertTrue(source.contains("data-legacy-message-id"))
        XCTAssertTrue(source.contains("data-message-id"))
        XCTAssertFalse(source.contains(".click("))
        XCTAssertFalse(source.contains("scroll"))
        XCTAssertFalse(source.contains("location.href ="))
    }

    @MainActor
    func testSelectedBatchProbeRejectsStaleConversationDOMAndAcceptsRequestedMessage() async throws {
        let view = WKWebView(frame: NSRect(x: 0, y: 0, width: 900, height: 700))
        view.loadHTMLString("""
        <main role="main" data-thread-perm-id="thread-f:stale">
          <div class="adn ads" data-legacy-message-id="msg-f:old-message">
            <div class="a3s">Old conversation body that is still visible</div>
          </div>
        </main>
        """, baseURL: URL(string: "https://mail.google.com/mail/u/0/#inbox/new-message"))
        try await Task.sleep(nanoseconds: 250_000_000)

        let stale = try await view.callAsyncJavaScript(
            WebMailBridge.selectedConversationPassiveProbe,
            arguments: ["expectedConversationID": "new-message"], contentWorld: .page
        ) as? NSNumber
        XCTAssertEqual(stale?.boolValue, false)

        _ = try await view.callAsyncJavaScript("""
          document.querySelector('[data-legacy-message-id]')
            .setAttribute('data-legacy-message-id', 'msg-f:new-message');
          return true;
        """, arguments: [:], contentWorld: .page)
        let requested = try await view.callAsyncJavaScript(
            WebMailBridge.selectedConversationPassiveProbe,
            arguments: ["expectedConversationID": "new-message"], contentWorld: .page
        ) as? NSNumber
        XCTAssertEqual(requested?.boolValue, true)
    }

    @MainActor
    func testSelectedBatchProbeAcceptsConversationAliasOnlyAfterThreadOwnerChanges() async throws {
        let view = WKWebView(frame: NSRect(x: 0, y: 0, width: 900, height: 700))
        view.loadHTMLString("""
        <main role="main" data-thread-perm-id="thread-f:old-thread">
          <div class="adn ads" data-legacy-message-id="msg-f:route-alias">
            <div class="a3s">Old conversation whose native ID misleadingly matches the next route</div>
          </div>
        </main>
        """, baseURL: URL(string: "https://mail.google.com/mail/u/0/#inbox/route-alias"))
        try await Task.sleep(nanoseconds: 250_000_000)

        let staleAlias = try await view.callAsyncJavaScript(
            WebMailBridge.selectedConversationPassiveProbe,
            arguments: [
                "expectedConversationID": "route-alias",
                "previousThreadID": "old-thread",
                "expectedThreadID": "",
            ], contentWorld: .page
        ) as? NSNumber
        XCTAssertEqual(staleAlias?.boolValue, false)

        _ = try await view.callAsyncJavaScript("""
          const main = document.querySelector('[data-thread-perm-id]');
          main.setAttribute('data-thread-perm-id', 'thread-f:new-thread');
          main.querySelector('[data-legacy-message-id]')
            .setAttribute('data-legacy-message-id', 'msg-f:sibling-message');
          return true;
        """, arguments: [:], contentWorld: .page)
        let readyAlias = try await view.callAsyncJavaScript(
            WebMailBridge.selectedConversationPassiveProbe,
            arguments: [
                "expectedConversationID": "route-alias",
                "previousThreadID": "old-thread",
                "expectedThreadID": "",
            ], contentWorld: .page
        ) as? NSNumber
        XCTAssertEqual(readyAlias?.boolValue, true)

        let boundOwner = try await view.callAsyncJavaScript(
            WebMailBridge.selectedConversationPassiveProbe,
            arguments: [
                "expectedConversationID": "route-alias",
                "previousThreadID": "",
                "expectedThreadID": "new-thread",
            ], contentWorld: .page
        ) as? NSNumber
        XCTAssertEqual(boundOwner?.boolValue, true)
    }

    @MainActor
    func testSelectedBatchRecoveryAdmitsOnlyChangedConversationRouteOnSameAccount() throws {
        let stored = try XCTUnwrap(URL(
            string: "https://mail.google.com/mail/u/0/#inbox/19f3c489d6d8b02b"
        ))
        let recovered = try XCTUnwrap(WebMailBridge.selectedConversationRecoveryURL(
            "https://mail.google.com/mail/u/0/#inbox/thread-route", replacing: stored
        ))
        XCTAssertEqual(WebMailBridge.gmailConversationID(from: recovered), "thread-route")
        XCTAssertNil(WebMailBridge.selectedConversationRecoveryURL(
            stored.absoluteString, replacing: stored
        ))
        XCTAssertNil(WebMailBridge.selectedConversationRecoveryURL(
            "https://mail.google.com/mail/u/1/#inbox/thread-route", replacing: stored
        ))
        XCTAssertNil(WebMailBridge.selectedConversationRecoveryURL(
            "https://example.test/mail/u/0/#inbox/thread-route", replacing: stored
        ))
        XCTAssertNil(WebMailBridge.selectedConversationRecoveryURL(
            "https://mail.google.com/mail/u/0/#inbox", replacing: stored
        ))
    }

    @MainActor
    func testSelectedBatchRecoveryRecognizesConversationOpenedByVerifiedSearchClick() throws {
        let recovered = try XCTUnwrap(URL(
            string: "https://mail.google.com/mail/u/0/#inbox/canonical-thread"
        ))
        XCTAssertTrue(WebMailBridge.recoveredConversationDocumentIsAlreadyOpen(
            currentURL: recovered, recoveredURL: recovered, currentThreadID: "canonical-thread-owner"
        ))
        XCTAssertFalse(WebMailBridge.recoveredConversationDocumentIsAlreadyOpen(
            currentURL: recovered, recoveredURL: recovered, currentThreadID: ""
        ))
        XCTAssertFalse(WebMailBridge.recoveredConversationDocumentIsAlreadyOpen(
            currentURL: URL(string: "https://mail.google.com/mail/u/0/#search/query"),
            recoveredURL: recovered, currentThreadID: "canonical-thread-owner"
        ))
    }

    @MainActor
    func testUserMediatedSurfaceIdentityValidationIsBounded() {
        XCTAssertTrue(WebMailBridge.isSafeSurfaceMessageID("gmail-abc_DEF-123"))
        XCTAssertFalse(WebMailBridge.isSafeSurfaceMessageID(""))
        XCTAssertFalse(WebMailBridge.isSafeSurfaceMessageID("gmail/private"))
        XCTAssertFalse(WebMailBridge.isSafeSurfaceMessageID("gmail-private?subject=secret"))
        XCTAssertFalse(WebMailBridge.isSafeSurfaceMessageID(String(repeating: "a", count: 241)))
    }

    @MainActor
    func testAutomaticVisibleListCaptureIsSinglePageAndRouteBound() {
        let route = "https://mail.google.com/mail/u/0/#inbox"
        XCTAssertTrue(WebMailBridge.shouldScheduleAutomaticVisibleListCapture(
            pageRevision: 2, route: route, currentPageRevision: 2,
            currentRoute: route, documentRoute: route, scheduledKey: "1|\(route)"
        ))
        XCTAssertFalse(WebMailBridge.shouldScheduleAutomaticVisibleListCapture(
            pageRevision: 2, route: route, currentPageRevision: 3,
            currentRoute: route, documentRoute: route, scheduledKey: "1|\(route)"
        ))
        XCTAssertFalse(WebMailBridge.shouldScheduleAutomaticVisibleListCapture(
            pageRevision: 2, route: route, currentPageRevision: 2,
            currentRoute: route, documentRoute: "https://mail.google.com/mail/u/0/#all",
            scheduledKey: "1|\(route)"
        ))
        XCTAssertFalse(WebMailBridge.shouldScheduleAutomaticVisibleListCapture(
            pageRevision: 2, route: route, currentPageRevision: 2,
            currentRoute: route, documentRoute: route, scheduledKey: "2|\(route)"
        ))
    }

    @MainActor
    func testAutomaticUserOpenedConversationCaptureIsSingleSelectionAndRouteBound() {
        XCTAssertTrue(WebMailBridge.shouldScheduleAutomaticConversationCapture(
            selectionRevision: 4, currentSelectionRevision: 4,
            route: "https://mail.google.com/mail/u/0/#inbox/abc",
            currentRoute: "https://mail.google.com/mail/u/0/#inbox/abc",
            scheduledRevision: 3
        ))
        XCTAssertFalse(WebMailBridge.shouldScheduleAutomaticConversationCapture(
            selectionRevision: 4, currentSelectionRevision: 5,
            route: "https://mail.google.com/mail/u/0/#inbox/abc",
            currentRoute: "https://mail.google.com/mail/u/0/#inbox/abc",
            scheduledRevision: 3
        ))
        XCTAssertFalse(WebMailBridge.shouldScheduleAutomaticConversationCapture(
            selectionRevision: 4, currentSelectionRevision: 4,
            route: "https://mail.google.com/mail/u/0/#inbox/abc",
            currentRoute: "https://mail.google.com/mail/u/0/#inbox/abc",
            scheduledRevision: 4
        ))
        XCTAssertTrue(WebMailBridge.shouldAcceptAutomaticConversationCaptureResult(
            selectionRevision: 4, currentSelectionRevision: 4,
            surfaceMessageID: "gmail-abc", currentSurfaceMessageID: "gmail-abc",
            route: "https://mail.google.com/mail/u/0/#inbox/abc",
            currentRoute: "https://mail.google.com/mail/u/0/#inbox/abc",
            documentRoute: "https://mail.google.com/mail/u/0/#inbox/abc"
        ))
        XCTAssertFalse(WebMailBridge.shouldAcceptAutomaticConversationCaptureResult(
            selectionRevision: 4, currentSelectionRevision: 5,
            surfaceMessageID: "gmail-abc", currentSurfaceMessageID: "gmail-other",
            route: "https://mail.google.com/mail/u/0/#inbox/abc",
            currentRoute: "https://mail.google.com/mail/u/0/#inbox/other",
            documentRoute: "https://mail.google.com/mail/u/0/#inbox/other"
        ))
    }

    @MainActor
    func testTrustedInboxSelectionObserverRequiresRealProviderIdentityAndNeverClicks() async throws {
        let controller = WKUserContentController()
        controller.addUserScript(WKUserScript(
            source: WebMailBridge.trustedInboxSelectionObserverScript,
            injectionTime: .atDocumentStart, forMainFrameOnly: true
        ))
        let configuration = WKWebViewConfiguration()
        configuration.userContentController = controller
        let view = WKWebView(frame: NSRect(x: 0, y: 0, width: 800, height: 600), configuration: configuration)
        view.loadHTMLString("""
        <style>tr { display:block; width:400px; height:30px }</style>
        <table><tr class="zA" data-legacy-thread-id="thread-f:ABC_123"><td><button id="open">Open</button></td></tr></table>
        <script>window.fixtureClicks = 0; open.onclick = () => { window.fixtureClicks += 1 };</script>
        """, baseURL: URL(string: "https://mail.google.com/mail/u/0/#inbox"))
        try await Task.sleep(nanoseconds: 250_000_000)
        let programmatic = try await view.callAsyncJavaScript(
            "document.getElementById('open').click(); return Number(window.fixtureClicks || 0)",
            arguments: [:], contentWorld: .page
        ) as? NSNumber
        XCTAssertEqual(programmatic?.intValue, 1)
        // The observer has no call to click() and rejects synthetic events through
        // event.isTrusted. It also exports only bounded Surface identity/route.
        XCTAssertFalse(WebMailBridge.trustedInboxSelectionObserverScript.contains("row.click"))
        XCTAssertTrue(WebMailBridge.trustedInboxSelectionObserverScript.contains("event.isTrusted"))
        XCTAssertTrue(WebMailBridge.trustedInboxSelectionObserverScript.contains("stage: 'list_bound'"))
        XCTAssertTrue(WebMailBridge.trustedInboxSelectionObserverScript.contains("new MutationObserver"))
        XCTAssertTrue(WebMailBridge.trustedInboxSelectionObserverScript.contains("candidate !== boundListCandidate"))
        XCTAssertFalse(WebMailBridge.trustedInboxSelectionObserverScript.contains("location.reload"))
        XCTAssertFalse(WebMailBridge.trustedInboxSelectionObserverScript.contains("innerText"))
        XCTAssertFalse(WebMailBridge.trustedInboxSelectionObserverScript.contains("subject"))
        XCTAssertTrue(WebMailBridge.trustedInboxSelectionObserverScript.contains("routeBoundPosted"))
        XCTAssertTrue(WebMailBridge.trustedInboxSelectionObserverScript.contains("stableSamples >= 2"))
        XCTAssertTrue(WebMailBridge.trustedInboxSelectionObserverScript.contains("hasVisibleMessageBody"))
        XCTAssertTrue(WebMailBridge.trustedInboxSelectionObserverScript.contains("[300, 750, 1500, 2500, 4000]"))
        XCTAssertEqual(
            WebMailBridge.trustedInboxSelectionObserverScript.components(separatedBy: "stage: 'route_bound'").count - 1,
            1
        )
    }

    @MainActor
    func testReviewedRecoveryClearsOnlyOnceAndCannotClearLaterChallenge() {
        let suite = "gmail-reviewed-recovery-\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suite)!
        defer { defaults.removePersistentDomain(forName: suite) }
        let coordinator = GmailExperimentSafetyCoordinator(
            defaults: defaults, keyPrefix: "test", clock: Date.init
        )
        coordinator.openProviderChallengeCircuit()
        XCTAssertTrue(coordinator.applyReviewedRecovery(id: "recovery-v1"))
        XCTAssertFalse(coordinator.status()["provider_challenge_detected"] as? Bool ?? true)
        coordinator.openProviderChallengeCircuit()
        XCTAssertFalse(coordinator.applyReviewedRecovery(id: "recovery-v1"))
        XCTAssertTrue(coordinator.status()["provider_challenge_detected"] as? Bool ?? false)
    }

    @MainActor
    func testGmailExperimentSafetyRequiresExplicitUUIDAndCoalescesDuplicates() {
        let suite = "gmail-safety-\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suite)!
        defer { defaults.removePersistentDomain(forName: suite) }
        var now = Date(timeIntervalSince1970: 2_000_000_000)
        let coordinator = GmailExperimentSafetyCoordinator(
            defaults: defaults, keyPrefix: "test",
            limits: GmailExperimentSafetyLimits(
                cooldown: 3600, maximumElapsed: 10, maximumNavigations: 2,
                maximumActions: 1, maximumJavaScriptEvaluations: 2
            ), clock: { now }
        )
        let operationID = UUID().uuidString
        XCTAssertEqual(coordinator.beginExplicitPrintViewExperiment(operationID: "startup"),
                       .denied("invalid_authorization"))
        XCTAssertEqual(coordinator.beginExplicitPrintViewExperiment(operationID: operationID), .admitted)
        XCTAssertEqual(coordinator.beginExplicitPrintViewExperiment(operationID: operationID), .coalesced)
        XCTAssertEqual(coordinator.beginExplicitPrintViewExperiment(operationID: UUID().uuidString),
                       .denied("operation_in_flight"))
        XCTAssertEqual(coordinator.consume(.navigation, operationID: operationID), .admitted)
        XCTAssertEqual(coordinator.consume(.action, operationID: operationID), .admitted)
        XCTAssertEqual(coordinator.consume(.action, operationID: operationID),
                       .denied("action_budget_exhausted"))
        XCTAssertEqual(coordinator.beginExplicitPrintViewExperiment(operationID: UUID().uuidString),
                       .denied("cooldown_active"))
        now.addTimeInterval(3601)
        XCTAssertEqual(coordinator.beginExplicitPrintViewExperiment(operationID: UUID().uuidString), .admitted)
    }

    @MainActor
    func testGmailExperimentSafetyBudgetsAndElapsedTimeoutFailClosed() {
        let suite = "gmail-budget-\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suite)!
        defer { defaults.removePersistentDomain(forName: suite) }
        var now = Date(timeIntervalSince1970: 2_000_000_000)
        let coordinator = GmailExperimentSafetyCoordinator(
            defaults: defaults, keyPrefix: "test",
            limits: GmailExperimentSafetyLimits(
                cooldown: 0, maximumElapsed: 5, maximumNavigations: 1,
                maximumActions: 1, maximumJavaScriptEvaluations: 1
            ), clock: { now }
        )
        var operationID = UUID().uuidString
        XCTAssertEqual(coordinator.beginExplicitPrintViewExperiment(operationID: operationID), .admitted)
        XCTAssertEqual(coordinator.consume(.navigation, operationID: operationID), .admitted)
        XCTAssertEqual(coordinator.consume(.navigation, operationID: operationID),
                       .denied("navigation_budget_exhausted"))

        operationID = UUID().uuidString
        XCTAssertEqual(coordinator.beginExplicitPrintViewExperiment(operationID: operationID), .admitted)
        now.addTimeInterval(6)
        XCTAssertEqual(coordinator.checkpoint(operationID: operationID),
                       .denied("elapsed_budget_exhausted"))
        XCTAssertEqual(coordinator.consume(.javascriptEvaluation, operationID: operationID),
                       .denied("operation_not_authorized"))
    }

    @MainActor
    func testGmailProviderChallengeOpensDurableCircuitBreaker() {
        let suite = "gmail-challenge-\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suite)!
        defer { defaults.removePersistentDomain(forName: suite) }
        let now = Date(timeIntervalSince1970: 2_000_000_000)
        let coordinator = GmailExperimentSafetyCoordinator(
            defaults: defaults, keyPrefix: "test",
            limits: GmailExperimentSafetyLimits(
                cooldown: 0, maximumElapsed: 10, maximumNavigations: 2,
                maximumActions: 2, maximumJavaScriptEvaluations: 2
            ), clock: { now }
        )
        let operationID = UUID().uuidString
        XCTAssertEqual(coordinator.beginExplicitPrintViewExperiment(operationID: operationID), .admitted)
        coordinator.recordProviderChallenge(operationID: operationID)
        let status = coordinator.status(now: now)
        XCTAssertEqual(status["provider_challenge_detected"] as? Bool, true)
        XCTAssertEqual(status["running"] as? Bool, false)
        XCTAssertEqual(coordinator.beginExplicitPrintViewExperiment(operationID: UUID().uuidString),
                       .denied("provider_challenge_circuit_open"))
    }

    @MainActor
    func testGmailProviderChallengeDetectionIsBoundedAndContentFree() async throws {
        XCTAssertTrue(WebMailBridge.isGmailProviderChallengeURL(URL(
            string: "https://mail.google.com/mail/u/0/accounttemporarilylocked"
        )))
        XCTAssertFalse(WebMailBridge.isGmailProviderChallengeURL(URL(
            string: "https://mail.google.com/mail/u/0/#inbox"
        )))
        XCTAssertFalse(WebMailBridge.isGmailProviderChallengeURL(URL(
            string: "https://mail.google.com/mail/u/0/#search/challenge"
        )))
        XCTAssertFalse(WebMailBridge.isGmailProviderChallengeURL(URL(
            string: "https://mail.google.com/mail/u/0/?query=unusualusage#inbox"
        )))
        XCTAssertTrue(WebMailBridge.isGmailProviderChallengeURL(URL(
            string: "https://accounts.google.com/v3/signin/challenge/pwd"
        )))
        XCTAssertFalse(WebMailBridge.isGmailProviderChallengeURL(URL(
            string: "https://example.com/unusualusage"
        )))

        let view = WKWebView(frame: NSRect(x: 0, y: 0, width: 800, height: 600))
        view.loadHTMLString("""
        <title>Unusual Usage - Account Temporarily Locked Down</title>
        <main>Private company account content must not leave this fixture.</main>
        """, baseURL: nil)
        try await Task.sleep(nanoseconds: 250_000_000)
        let result = try await view.callAsyncJavaScript(
            WebMailBridge.providerChallengeProbeScript, arguments: [:], contentWorld: .page
        )
        XCTAssertEqual(result as? Bool, true)

        let mailbox = WKWebView(frame: NSRect(x: 0, y: 0, width: 800, height: 600))
        mailbox.loadHTMLString("""
        <title>Inbox</title>
        <div gh="tl"><article class="a3s">Please verify it is you and try again later.</article></div>
        """, baseURL: nil)
        try await Task.sleep(nanoseconds: 250_000_000)
        let mailboxResult = try await mailbox.callAsyncJavaScript(
            WebMailBridge.providerChallengeProbeScript, arguments: [:], contentWorld: .page
        )
        XCTAssertEqual(mailboxResult as? Bool, false)
    }

    @MainActor
    func testGmailFullMessageURLAllowsOnlyExplicitHTTPSGmailFullViews() throws {
        let full = "https://mail.google.com/mail/u/0/?ui=2&ik=abc&view=lg&permmsgid=msg-f:123"
        XCTAssertEqual(WebMailBridge.gmailFullMessageURL(
            from: full, expectedLegacyMessageID: "7b")?.absoluteString, full)
        XCTAssertEqual(WebMailBridge.gmailFullMessageURL(from: full)?.absoluteString, full)
        XCTAssertNotNil(WebMailBridge.gmailFullMessageURL(
            from: "https://mail.google.com/mail/u/0/?view=LG&permmsgid=msg-f:123",
            expectedLegacyMessageID: "7b"))
        XCTAssertNil(WebMailBridge.gmailFullMessageURL(
            from: "https://mail.google.com/mail/u/0/?view=lg&permmsgid=msg-f:124",
            expectedLegacyMessageID: "7b"))
        XCTAssertNil(WebMailBridge.gmailFullMessageURL(
            from: "http://mail.google.com/mail/u/0/?view=lg&permmsgid=msg-f:123"))
        XCTAssertNil(WebMailBridge.gmailFullMessageURL(
            from: "https://example.com/mail/u/0/?view=lg&permmsgid=msg-f:123"))
        XCTAssertNil(WebMailBridge.gmailFullMessageURL(
            from: "https://mail.google.com/mail/u/0/?view=om&permmsgid=msg-f:123"))
    }

    @MainActor
    func testGmailConversationIDParsesResolvedInboxURLs() throws {
        XCTAssertEqual(
            WebMailBridge.gmailConversationID(from: try XCTUnwrap(URL(
                string: "https://mail.google.com/mail/u/0/#inbox/19f93b41c7cbf248"
            ))),
            "19f93b41c7cbf248"
        )
        XCTAssertEqual(
            WebMailBridge.gmailConversationID(from: try XCTUnwrap(URL(
                string: "https://mail.google.com/mail/u/0/#search/from%3Agitlab/ABC_123?projector=1"
            ))),
            "ABC_123"
        )
        XCTAssertNil(WebMailBridge.gmailConversationID(from: URL(string: "https://mail.google.com/mail/u/0/#inbox")!))
        XCTAssertNil(WebMailBridge.gmailConversationID(from: URL(
            string: "https://mail.google.com/mail/u/0/#search/from%3Agitlab"
        )!))
        XCTAssertNil(WebMailBridge.gmailConversationID(from: URL(string: "https://example.com/#inbox/unsafe")!))
    }

    @MainActor
    func testGmailThreadCountHintRecognizesInboxConversationCounts() {
        XCTAssertEqual(WebMailBridge.gmailThreadCountHint(
            countText: "(4)", senderCellText: "Alice, Bob (4)"), 4)
        XCTAssertEqual(WebMailBridge.gmailThreadCountHint(
            countText: "", senderCellText: "Alice, Bob 12"), 12)
        XCTAssertEqual(WebMailBridge.gmailThreadCountHint(
            countText: "", senderCellText: "Alice",
            ariaLabel: "Thread with 3 messages"), 3)
        XCTAssertEqual(WebMailBridge.gmailThreadCountHint(
            countText: "", senderCellText: "Alice"), 1)
    }

    @MainActor
    func testGmailRouteTraceMetadataContainsNoRawRouteContent() throws {
        let privateURL = "https://mail.google.com/mail/u/0/#search/from%3Aperson%40example.com/ABC_123"
        let metadata = WebMailBridge.gmailRouteTraceMetadata(privateURL)

        XCTAssertEqual(metadata["route_kind"] as? String, "search")
        XCTAssertEqual(metadata["account_path"] as? String, "/mail/u/0")
        let fingerprint = try XCTUnwrap(metadata["route_fingerprint"] as? String)
        XCTAssertEqual(fingerprint.count, 16)
        let conversationFingerprint = try XCTUnwrap(metadata["conversation_fingerprint"] as? String)
        XCTAssertEqual(conversationFingerprint.count, 16)
        let serialized = String(describing: metadata)
        XCTAssertFalse(serialized.contains("person@example.com"))
        XCTAssertFalse(serialized.contains("person%40example.com"))
        XCTAssertFalse(serialized.contains("ABC_123"))
        XCTAssertFalse(serialized.contains("from:"))

        let repeated = WebMailBridge.gmailRouteTraceMetadata(privateURL)
        XCTAssertEqual(repeated["route_fingerprint"] as? String, fingerprint)
        let different = WebMailBridge.gmailRouteTraceMetadata(
            "https://mail.google.com/mail/u/0/#inbox/different"
        )
        XCTAssertNotEqual(different["route_fingerprint"] as? String, fingerprint)
        XCTAssertEqual(WebMailBridge.gmailRouteTraceMetadata("https://example.com/private")["route_kind"] as? String, "invalid")

        let privateRouteKind = WebMailBridge.gmailRouteTraceMetadata(
            "https://mail.google.com/mail/u/0/#secret-private-label/thread-id"
        )
        XCTAssertEqual(privateRouteKind["route_kind"] as? String, "other")
        XCTAssertFalse(String(describing: privateRouteKind).contains("secret-private-label"))
    }

    @MainActor
    func testGmailPostPrepareRouteMetadataComparesSemanticConversationIdentityWithoutContent() throws {
        let expected = "https://mail.google.com/mail/u/0/#search/from%3Aperson%40example.com/THREAD_123"
        let canonicalized = "https://mail.google.com/mail/u/0/#inbox/THREAD_123"
        let changed = "https://mail.google.com/mail/u/0/#inbox/OTHER_456"

        let same = WebMailBridge.gmailPostPrepareRouteTraceMetadata(
            expectedURL: expected, currentURL: canonicalized
        )
        XCTAssertEqual(same["route_kind"] as? String, "inbox")
        XCTAssertEqual(same["conversation_identity_matches"] as? Bool, true)
        XCTAssertEqual((same["route_fingerprint"] as? String)?.count, 16)
        XCTAssertEqual((same["conversation_fingerprint"] as? String)?.count, 16)
        let serialized = String(describing: same)
        XCTAssertFalse(serialized.contains("person@example.com"))
        XCTAssertFalse(serialized.contains("THREAD_123"))

        let other = WebMailBridge.gmailPostPrepareRouteTraceMetadata(
            expectedURL: expected, currentURL: changed
        )
        XCTAssertEqual(other["conversation_identity_matches"] as? Bool, false)
        XCTAssertFalse(String(describing: other).contains("OTHER_456"))
    }

    @MainActor
    func testGmailDOMIdentityAllowsOnlyStableSameAccountCanonicalRouteDrift() {
        let before = WebMailBridge.gmailDOMIdentityFingerprint(["message-b", "message-a", "message-a"])
        let reordered = WebMailBridge.gmailDOMIdentityFingerprint(["message-a", "message-b"])
        let changed = WebMailBridge.gmailDOMIdentityFingerprint(["other-message"])

        XCTAssertEqual(before.count, 16)
        XCTAssertEqual(reordered, before)
        XCTAssertNotEqual(changed, before)
        XCTAssertTrue(WebMailBridge.gmailDetailRouteGuardAllows(
            routeMatches: false, accountPathMatches: true, domIdentityMatches: true
        ))
        XCTAssertFalse(WebMailBridge.gmailDetailRouteGuardAllows(
            routeMatches: false, accountPathMatches: true, domIdentityMatches: false
        ))
        XCTAssertFalse(WebMailBridge.gmailDetailRouteGuardAllows(
            routeMatches: false, accountPathMatches: false, domIdentityMatches: true
        ))
    }

    @MainActor
    func testGmailAcquisitionTracePayloadDropsPrivateRouteAndEmailContentBeforeRPC() throws {
        let privateRoute = "https://mail.google.com/mail/u/0/#search/from%3Aperson%40example.com/THREAD_PRIVATE"
        let privateBody = "Highly private body text"
        let privateSubject = "Private subject line"
        let metadata = WebMailBridge.gmailPostPrepareRouteTraceMetadata(
            expectedURL: privateRoute,
            currentURL: "https://mail.google.com/mail/u/0/#inbox/THREAD_PRIVATE"
        )
        var fields = metadata
        fields.merge([
            "comparison_id": "comparison-1",
            "preparation_enabled": false,
            "clicked_total": 0,
            "subject": privateSubject,
            "sender": "person@example.com",
            "body_text": privateBody,
            "body_html": "<p>\(privateBody)</p>",
            "url": privateRoute,
            "remote_url": privateRoute,
            "raw_route": "#search/from:person@example.com/THREAD_PRIVATE",
            "native_ids": ["THREAD_PRIVATE", "MESSAGE_PRIVATE"],
        ]) { _, new in new }

        let payload = WebMailBridge.gmailAcquisitionTracePayload(
            attemptID: "attempt-1", trigger: "force_refetch_noop_prepare",
            stage: "post_prepare_route", surfaceMessageID: "surface-1", fields: fields
        )

        XCTAssertEqual(payload["route_kind"] as? String, "inbox")
        XCTAssertEqual(payload["account_path"] as? String, "/mail/u/0")
        XCTAssertEqual((payload["route_fingerprint"] as? String)?.count, 16)
        XCTAssertEqual((payload["conversation_fingerprint"] as? String)?.count, 16)
        XCTAssertEqual(payload["conversation_identity_matches"] as? Bool, true)
        XCTAssertEqual(payload["preparation_enabled"] as? Bool, false)
        XCTAssertEqual(payload["clicked_total"] as? Int, 0)
        for forbiddenKey in ["subject", "sender", "body_text", "body_html", "url", "remote_url", "raw_route", "native_ids"] {
            XCTAssertNil(payload[forbiddenKey], "Willo must drop \(forbiddenKey) before the RPC")
        }
        let serialized = String(describing: payload)
        for privateValue in ["person@example.com", "person%40example.com", "THREAD_PRIVATE",
                             privateBody, privateSubject, "from:"] {
            XCTAssertFalse(serialized.contains(privateValue))
        }

        let malformed = WebMailBridge.gmailAcquisitionTracePayload(
            attemptID: "attempt-2", trigger: "force_refetch", stage: "post_prepare_route",
            surfaceMessageID: "surface-1",
            fields: [
                "route_kind": "private-person@example.com",
                "account_path": "/mail/u/person@example.com",
                "route_fingerprint": privateRoute,
                "conversation_fingerprint": "THREAD_PRIVATE",
            ]
        )
        XCTAssertNil(malformed["route_kind"])
        XCTAssertNil(malformed["account_path"])
        XCTAssertNil(malformed["route_fingerprint"])
        XCTAssertNil(malformed["conversation_fingerprint"])
    }

    @MainActor
    func testGmailIntensiveTracePayloadIsContentFreeAndEnumBounded() throws {
        let privateSeed = "person@example.com|Private body content|MESSAGE_PRIVATE"
        let fingerprint = WebMailBridge.gmailDiagnosticFingerprint(privateSeed)
        XCTAssertEqual(fingerprint.count, 16)
        XCTAssertFalse(fingerprint.contains("private"))

        let payload = WebMailBridge.gmailAcquisitionTracePayload(
            attemptID: "attempt-observability", trigger: "force_refetch",
            stage: "dom_candidate", surfaceMessageID: "surface-1", fields: [
                "command_id": "command-1", "snapshot_label": "passive_500ms",
                "snapshot_sequence": 3, "snapshot_fingerprint": fingerprint,
                "candidate_fingerprint": fingerprint, "owner_fingerprint": fingerprint,
                "candidate_kind": "kq_qualifying", "owner_kind": "conversation",
                "tag_kind": "div", "role_kind": "button", "has_adx": true,
                "document_generation": 4, "requested_document_generation": 4,
                "probe_evaluation_count": 3, "requested_navigation_returned": true,
                "requested_navigation_event": true, "navigation_eligible": true,
                "subject": "Private subject", "body_text": "Private body",
                "native_ids": ["MESSAGE_PRIVATE"], "candidate_seed": privateSeed,
            ]
        )
        XCTAssertEqual(payload["snapshot_label"] as? String, "passive_500ms")
        XCTAssertEqual(payload["candidate_kind"] as? String, "kq_qualifying")
        XCTAssertEqual(payload["snapshot_fingerprint"] as? String, fingerprint)
        XCTAssertEqual(payload["has_adx"] as? Bool, true)
        XCTAssertEqual(payload["requested_document_generation"] as? Int, 4)
        XCTAssertEqual(payload["probe_evaluation_count"] as? Int, 3)
        XCTAssertEqual(payload["requested_navigation_returned"] as? Bool, true)
        XCTAssertEqual(payload["requested_navigation_event"] as? Bool, true)
        XCTAssertEqual(payload["navigation_eligible"] as? Bool, true)
        for forbidden in ["subject", "body_text", "native_ids", "candidate_seed"] {
            XCTAssertNil(payload[forbidden])
        }
        XCTAssertFalse(String(describing: payload).contains("Private"))
        XCTAssertFalse(String(describing: payload).contains("MESSAGE_PRIVATE"))

        let malformed = WebMailBridge.gmailAcquisitionTracePayload(
            attemptID: "attempt-malformed", trigger: "force_refetch",
            stage: "dom_snapshot", surfaceMessageID: "surface-1", fields: [
                "snapshot_label": "private label", "candidate_kind": "private control",
                "owner_kind": "person@example.com", "snapshot_fingerprint": privateSeed,
            ]
        )
        XCTAssertNil(malformed["snapshot_label"])
        XCTAssertNil(malformed["candidate_kind"])
        XCTAssertNil(malformed["owner_kind"])
        XCTAssertNil(malformed["snapshot_fingerprint"])
    }

    @MainActor
    func testExpectedCountProvenanceKeepsRendererAndPersistedHintsDistinct() {
        XCTAssertEqual(WebMailBridge.expectedCountProvenance(renderer: 0, persisted: 0), "none")
        XCTAssertEqual(WebMailBridge.expectedCountProvenance(renderer: 10, persisted: 0), "renderer")
        XCTAssertEqual(WebMailBridge.expectedCountProvenance(renderer: 0, persisted: 10), "persisted")
        XCTAssertEqual(WebMailBridge.expectedCountProvenance(renderer: 10, persisted: 10), "both_equal")
        XCTAssertEqual(WebMailBridge.expectedCountProvenance(renderer: 12, persisted: 10), "max_renderer")
        XCTAssertEqual(WebMailBridge.expectedCountProvenance(renderer: 8, persisted: 10), "max_persisted")
    }

    @MainActor
    func testGmailInboxWaitDoesNotTreatTransientNavigationAsLogin() throws {
        XCTAssertFalse(WebMailBridge.isExplicitGoogleLoginURL(nil))
        XCTAssertFalse(WebMailBridge.isExplicitGoogleLoginURL(URL(string: "about:blank")))
        XCTAssertFalse(WebMailBridge.isExplicitGoogleLoginURL(URL(string: "https://sso.example.com/redirect")))
        XCTAssertFalse(WebMailBridge.isExplicitGoogleLoginURL(URL(string: "https://mail.google.com/mail/u/0/#inbox")))
        XCTAssertTrue(WebMailBridge.isExplicitGoogleLoginURL(URL(string: "https://accounts.google.com/ServiceLogin")))
        XCTAssertTrue(WebMailBridge.isExplicitGoogleLoginURL(URL(string: "https://mail.google.com/mail/u/0/signin")))
    }

    @MainActor
    func testGmailDetailReadinessRequiresCurrentRequestedDocumentGeneration() {
        XCTAssertFalse(WebMailBridge.gmailRequestedDocumentIsEligible(
            requestedNavigationCommitted: false, currentGeneration: 0, requestedGeneration: 0
        ))
        XCTAssertFalse(WebMailBridge.gmailRequestedDocumentIsEligible(
            requestedNavigationCommitted: false, currentGeneration: 7, requestedGeneration: 7
        ))
        XCTAssertTrue(WebMailBridge.gmailRequestedDocumentIsEligible(
            requestedNavigationCommitted: true, currentGeneration: 7, requestedGeneration: 7
        ))
        XCTAssertFalse(WebMailBridge.gmailRequestedDocumentIsEligible(
            requestedNavigationCommitted: true, currentGeneration: 8, requestedGeneration: 7
        ))
    }

    @MainActor
    func testGmailDetailScriptsIgnoreMailboxOlderMessageNavigation() async throws {
        let view = WKWebView(frame: NSRect(x: 0, y: 0, width: 800, height: 600))
        view.loadHTMLString("""
        <style>.adn,.a3s,button { display:block; width:120px; height:24px }</style>
        <button id="older" aria-label="Older messages">Older</button>
        <button id="more" data-tooltip="More messages">More</button>
        <h2 class="hP">Fixture</h2>
        <div class="adn ads" data-message-id="msg-f:one">
          <span class="gD" email="sender@example.test" name="Sender"></span>
          <div class="a3s aiL">Fixture body</div>
        </div>
        <script>
          window.mailboxNavigationClicks = 0;
          older.onclick = more.onclick = () => { window.mailboxNavigationClicks += 1 };
        </script>
        """, baseURL: nil)
        try await Task.sleep(nanoseconds: 250_000_000)

        let beforeValue = try await view.callAsyncJavaScript(
            WebMailBridge.detailInventoryScript, arguments: [:], contentWorld: .page
        )
        let before = try XCTUnwrap(beforeValue as? [String: Any])
        XCTAssertEqual((before["explicit_stack_count"] as? NSNumber)?.intValue, 0)

        let preparationValue = try await view.callAsyncJavaScript(
            WebMailBridge.detailPrepareScript, arguments: ["delayScale": 0], contentWorld: .page
        )
        let preparation = try XCTUnwrap(preparationValue as? [String: Any])
        XCTAssertEqual((preparation["clicked_total"] as? NSNumber)?.intValue, 0)
        let navigationClicks = try await view.callAsyncJavaScript(
            "return Number(window.mailboxNavigationClicks || 0)", arguments: [:], contentWorld: .page
        ) as? NSNumber
        XCTAssertEqual(navigationClicks?.intValue, 0)

        let detailValue = try await view.callAsyncJavaScript(
            WebMailBridge.detailScript, arguments: ["expectedThreadCount": 1], contentWorld: .page
        )
        let detail = try XCTUnwrap(detailValue as? [String: Any])
        XCTAssertEqual((detail["message_count"] as? NSNumber)?.intValue, 1)
        XCTAssertEqual((detail["collapsed_message_count"] as? NSNumber)?.intValue, 0)
    }

    @MainActor
    func testGmailDetailScriptsDoNotClickOrCountPrivateKQClass() async throws {
        let view = WKWebView(frame: NSRect(x: 0, y: 0, width: 800, height: 600))
        view.loadHTMLString("""
        <style>.adn,.a3s,.kQ,.adx { display:block; width:120px; height:24px }</style>
        <h2 class="hP">Fixture</h2>
        <div id="private-kq" class="kQ"><span class="adx">9</span></div>
        <div class="adn ads" data-message-id="msg-f:one">
          <span class="gD" email="sender@example.test" name="Sender"></span>
          <div class="a3s aiL">Fixture body</div>
        </div>
        <script>
          window.privateKQClicks = 0;
          document.getElementById('private-kq').onclick = () => { window.privateKQClicks += 1 };
        </script>
        """, baseURL: nil)
        try await Task.sleep(nanoseconds: 250_000_000)

        let inventoryValue = try await view.callAsyncJavaScript(
            WebMailBridge.detailInventoryScript, arguments: [:], contentWorld: .page
        )
        let inventory = try XCTUnwrap(inventoryValue as? [String: Any])
        XCTAssertEqual((inventory["qualifying_kq_count"] as? NSNumber)?.intValue, 1)

        let preparationValue = try await view.callAsyncJavaScript(
            WebMailBridge.detailPrepareScript, arguments: ["delayScale": 0], contentWorld: .page
        )
        let preparation = try XCTUnwrap(preparationValue as? [String: Any])
        XCTAssertEqual((preparation["clicked_kq_stack"] as? NSNumber)?.intValue, 0)
        let clicks = try await view.callAsyncJavaScript(
            "return Number(window.privateKQClicks || 0)", arguments: [:], contentWorld: .page
        ) as? NSNumber
        XCTAssertEqual(clicks?.intValue, 0)

        let detailValue = try await view.callAsyncJavaScript(
            WebMailBridge.detailScript, arguments: ["expectedThreadCount": 1], contentWorld: .page
        )
        let detail = try XCTUnwrap(detailValue as? [String: Any])
        XCTAssertEqual((detail["message_count"] as? NSNumber)?.intValue, 1)
        XCTAssertEqual((detail["unresolved_kq_stack_count"] as? NSNumber)?.intValue, 0)
        XCTAssertEqual((detail["collapsed_message_count"] as? NSNumber)?.intValue, 0)
    }

    @MainActor
    func testGmailThreadIdentityComparisonNormalizesProviderPrefixesAndIsContentFree() throws {
        let same = WebMailBridge.gmailThreadIdentityComparison(
            storedRawID: "thread-f:ABC_123",
            inboxRawIDs: ["ABC_123", "thread-f:ABC_123"],
            detailRawIDs: ["thread-f:ABC_123"],
            detailRouteRawID: "ABC_123"
        )
        XCTAssertEqual(same["stored_inbox_thread_identity_matches"] as? Bool, true)
        XCTAssertEqual(same["inbox_detail_thread_identity_matches"] as? Bool, true)
        XCTAssertEqual(same["inbox_detail_route_identity_matches"] as? Bool, true)
        XCTAssertEqual(same["detail_owner_route_identity_matches"] as? Bool, true)
        for key in ["stored_thread_fingerprint", "inbox_thread_fingerprint",
                    "detail_thread_fingerprint", "detail_route_thread_fingerprint"] {
            XCTAssertEqual(try XCTUnwrap(same[key] as? String).count, 16)
        }
        XCTAssertFalse(String(describing: same).contains("ABC_123"))

        let changed = WebMailBridge.gmailThreadIdentityComparison(
            storedRawID: "thread-f:ABC_123", inboxRawIDs: ["ABC_123"],
            detailRawIDs: ["thread-f:OTHER_456"], detailRouteRawID: "OTHER_456"
        )
        XCTAssertEqual(changed["stored_inbox_thread_identity_matches"] as? Bool, true)
        XCTAssertEqual(changed["inbox_detail_thread_identity_matches"] as? Bool, false)
        XCTAssertEqual(changed["detail_owner_route_identity_matches"] as? Bool, true)
        XCTAssertFalse(String(describing: changed).contains("OTHER_456"))
    }

    @MainActor
    func testGmailThreadIdentityScriptsCompareExactInboxAndDetailOwnersWithoutContent() async throws {
        let inbox = WKWebView(frame: NSRect(x: 0, y: 0, width: 800, height: 600))
        inbox.loadHTMLString("""
        <main role="main">
          <table><tr class="zA" data-legacy-thread-id="target-thread">
            <td class="yW">Private sender (11)</td>
            <td><a href="#inbox/target-thread">Private subject</a></td>
          </tr></table>
        </main>
        """, baseURL: URL(string: "https://mail.google.com/mail/u/0/#inbox"))
        try await Task.sleep(nanoseconds: 250_000_000)
        let inboxValue = try await inbox.callAsyncJavaScript(
            WebMailBridge.inboxThreadIdentityDiagnosticScript,
            arguments: ["expectedURL": "https://mail.google.com/mail/u/0/#inbox/target-thread"],
            contentWorld: .page
        )
        let inboxObserved = try XCTUnwrap(inboxValue as? [String: Any])
        XCTAssertEqual(inboxObserved["inbox_target_found"] as? Bool, true)
        XCTAssertEqual((inboxObserved["inbox_matching_row_count"] as? NSNumber)?.intValue, 1)
        XCTAssertEqual(inboxObserved["inbox_thread_attribute_present"] as? Bool, true)
        XCTAssertEqual(inboxObserved["inbox_thread_href_present"] as? Bool, true)
        let inboxIDs = try XCTUnwrap(inboxObserved["inbox_thread_ids"] as? [String])
        XCTAssertEqual(inboxIDs, ["target-thread"])
        XCTAssertFalse(String(describing: inboxObserved).contains("Private sender"))
        XCTAssertFalse(String(describing: inboxObserved).contains("Private subject"))

        let detail = WKWebView(frame: NSRect(x: 0, y: 0, width: 800, height: 600))
        detail.loadHTMLString("""
        <main role="main" data-thread-perm-id="thread-f:target-thread">
          <div class="adn ads" data-message-id="msg-f:one"><div class="a3s">Private body</div></div>
        </main>
        """, baseURL: URL(string: "https://mail.google.com/mail/u/0/#inbox/target-thread"))
        try await Task.sleep(nanoseconds: 250_000_000)
        let detailValue = try await detail.callAsyncJavaScript(
            WebMailBridge.detailThreadIdentityDiagnosticScript,
            arguments: ["expectedURL": "https://mail.google.com/mail/u/0/#inbox/target-thread"],
            contentWorld: .page
        )
        let detailObserved = try XCTUnwrap(detailValue as? [String: Any])
        XCTAssertEqual((detailObserved["detail_thread_owner_count"] as? NSNumber)?.intValue, 1)
        XCTAssertEqual(detailObserved["detail_thread_ids"] as? [String], ["target-thread"])
        XCTAssertEqual(detailObserved["detail_route_thread_id"] as? String, "target-thread")
        XCTAssertEqual(detailObserved["account_path_matches"] as? Bool, true)
        XCTAssertFalse(String(describing: detailObserved).contains("Private body"))
    }

    @MainActor
    func testGmailExactInboxRowNavigationClicksOnlyMatchedThread() async throws {
        let inbox = WKWebView(frame: NSRect(x: 0, y: 0, width: 800, height: 600))
        inbox.loadHTMLString("""
        <main role="main">
          <table>
            <tr class="zA" data-legacy-thread-id="other-thread">
              <td><a href="#inbox/other-thread">Other private subject</a></td>
            </tr>
            <tr class="zA" data-legacy-thread-id="target-thread">
              <td><a href="#inbox/canonical-target">Target private subject</a></td>
            </tr>
          </table>
        </main>
        """, baseURL: URL(string: "https://mail.google.com/mail/u/0/#inbox"))
        try await Task.sleep(nanoseconds: 250_000_000)
        let value = try await inbox.callAsyncJavaScript(
            WebMailBridge.inboxThreadNavigationDiagnosticScript,
            arguments: ["expectedURL": "https://mail.google.com/mail/u/0/#inbox/target-thread"],
            contentWorld: .page
        )
        let observed = try XCTUnwrap(value as? [String: Any])
        XCTAssertEqual(observed["inbox_target_found"] as? Bool, true)
        XCTAssertEqual(observed["clicked"] as? Bool, true)
        try await Task.sleep(nanoseconds: 100_000_000)
        XCTAssertEqual(inbox.url?.fragment, "inbox/canonical-target")
        XCTAssertFalse(String(describing: observed).contains("private subject"))
    }

    @MainActor
    func testGmailMessageStructureDiagnosticCountsUnrecognizedMetadataOwnerWithoutContent() async throws {
        let view = WKWebView(frame: NSRect(x: 0, y: 0, width: 800, height: 600))
        view.loadHTMLString("""
        <style>.owner,.gE,.gD,.g3,.a3s { display:block; width:160px; height:24px }</style>
        <main data-thread-perm-id="private-thread">
          <article class="owner adn ads" data-message-id="private-visible-id">
            <div class="gE"><span class="gD" email="visible@example.test">Visible</span><span class="g3" title="Today">Today</span></div>
            <div class="a3s">Private visible body</div>
          </article>
          <section class="owner">
            <div class="gE"><span class="gD" email="older@example.test">Older</span><span class="g3" title="Yesterday">Yesterday</span></div>
          </section>
        </main>
        """, baseURL: nil)
        try await Task.sleep(nanoseconds: 250_000_000)

        let value = try await view.callAsyncJavaScript(
            WebMailBridge.detailMessageStructureDiagnosticScript,
            arguments: [:], contentWorld: .page
        )
        let observed = try XCTUnwrap(value as? [String: Any])
        XCTAssertEqual((observed["structure_sender_node_count"] as? NSNumber)?.intValue, 2)
        XCTAssertEqual((observed["structure_owner_count"] as? NSNumber)?.intValue, 2)
        XCTAssertEqual((observed["structure_known_card_owner_count"] as? NSNumber)?.intValue, 1)
        XCTAssertEqual((observed["structure_native_owner_count"] as? NSNumber)?.intValue, 1)
        XCTAssertEqual((observed["structure_body_owner_count"] as? NSNumber)?.intValue, 1)
        XCTAssertEqual((observed["structure_unrecognized_owner_count"] as? NSNumber)?.intValue, 1)
        XCTAssertEqual((observed["structure_unowned_sender_count"] as? NSNumber)?.intValue, 0)
        XCTAssertFalse(String(describing: observed).contains("private-thread"))
        XCTAssertFalse(String(describing: observed).contains("example.test"))
        XCTAssertFalse(String(describing: observed).contains("Private visible body"))
    }

    @MainActor
    func testGmailPrintAllActionRequiresOneExactVisibleSemanticControl() async throws {
        let view = WKWebView(frame: NSRect(x: 0, y: 0, width: 800, height: 600))
        view.loadHTMLString("""
        <style>button { display:block; width:120px; height:24px }</style>
        <main role="main" data-thread-perm-id="private-thread">
          <button id="generic" aria-label="Print">Print</button>
          <button id="all" aria-label="Print all">Print all</button>
        </main>
        <script>
          window.genericPrintClicks = 0; window.printAllClicks = 0;
          generic.onclick = () => { window.genericPrintClicks += 1 };
          all.onclick = () => { window.printAllClicks += 1 };
        </script>
        """, baseURL: nil)
        try await Task.sleep(nanoseconds: 250_000_000)

        let menuValue = try await view.callAsyncJavaScript(
            WebMailBridge.printAllMenuOpenScript, arguments: [:], contentWorld: .page
        )
        let menuObserved = try XCTUnwrap(menuValue as? [String: Any])
        XCTAssertEqual((menuObserved["print_menu_clicked_count"] as? NSNumber)?.intValue, 0)
        let value = try await view.callAsyncJavaScript(
            WebMailBridge.printAllActionScript, arguments: [:], contentWorld: .page
        )
        let observed = try XCTUnwrap(value as? [String: Any])
        XCTAssertEqual((observed["print_action_candidate_count"] as? NSNumber)?.intValue, 1)
        XCTAssertEqual(observed["print_action_clicked"] as? Bool, true)
        let genericClicks = try await view.callAsyncJavaScript(
            "return Number(window.genericPrintClicks || 0)", arguments: [:], contentWorld: .page
        ) as? NSNumber
        let allClicks = try await view.callAsyncJavaScript(
            "return Number(window.printAllClicks || 0)", arguments: [:], contentWorld: .page
        ) as? NSNumber
        XCTAssertEqual(genericClicks?.intValue, 0)
        XCTAssertEqual(allClicks?.intValue, 1)
        XCTAssertFalse(String(describing: observed).contains("private-thread"))
    }

    @MainActor
    func testGmailPrintViewObservationCountsSectionsWithoutExportingContent() async throws {
        let view = WKWebView(frame: NSRect(x: 0, y: 0, width: 800, height: 600))
        view.loadHTMLString("""
        <main>
          <section class="message">
            <table><tr><td><b>From:</b></td><td>private-one@example.test</td></tr>
              <tr><td><b>Date:</b></td><td>Private date one</td></tr>
              <tr><td><b>Subject:</b></td><td>Private subject one</td></tr></table>
            <div>Private body one with enough diagnostic fixture characters.</div>
          </section>
          <section class="message">
            <table><tr><td><b>From:</b></td><td>private-two@example.test</td></tr>
              <tr><td><b>Sent:</b></td><td>Private date two</td></tr>
              <tr><td><b>Subject:</b></td><td>Private subject two</td></tr></table>
            <div>Private body two with enough diagnostic fixture characters.</div>
          </section>
        </main>
        """, baseURL: nil)
        try await Task.sleep(nanoseconds: 250_000_000)

        _ = try await view.callAsyncJavaScript(
            WebMailBridge.suppressWindowPrintScript, arguments: [:], contentWorld: .page
        )
        _ = try await view.callAsyncJavaScript(
            "window.print(); return true", arguments: [:], contentWorld: .page
        )
        let value = try await view.callAsyncJavaScript(
            WebMailBridge.printViewObservationScript, arguments: [:], contentWorld: .page
        )
        let observed = try XCTUnwrap(value as? [String: Any])
        XCTAssertEqual(observed["print_document_ready"] as? Bool, true)
        XCTAssertEqual(observed["print_invocation_suppressed"] as? Bool, true)
        XCTAssertEqual((observed["print_section_count"] as? NSNumber)?.intValue, 2)
        XCTAssertEqual((observed["print_header_group_count"] as? NSNumber)?.intValue, 2)
        XCTAssertEqual((observed["print_body_candidate_count"] as? NSNumber)?.intValue, 2)
        XCTAssertFalse(String(describing: observed).contains("example.test"))
        XCTAssertFalse(String(describing: observed).contains("Private subject"))
        XCTAssertFalse(String(describing: observed).contains("Private body"))
    }

    @MainActor
    func testGmailPrintTracePayloadIsBoundedAndContentFree() {
        let payload = WebMailBridge.gmailAcquisitionTracePayload(
            attemptID: "attempt-print", trigger: "print_view_dry",
            stage: "print_view_observed", surfaceMessageID: "surface-1", fields: [
                "error_stage": "print_observation",
                "print_document_kind": "popup",
                "print_action_candidate_count": 1,
                "print_section_count": 10,
                "print_native_owner_count": 10,
                "print_header_group_count": 10,
                "print_body_candidate_count": 10,
                "print_menu_candidate_count": 1,
                "print_menu_clicked_count": 1,
                "print_menu_opened": true,
                "print_action_clicked": true,
                "print_popup_created": true,
                "print_document_ready": true,
                "print_invocation_suppressed": true,
                "subject": "Private subject",
                "sender": "private@example.test",
                "body_text": "Private body",
                "raw_html": "<div>Private</div>",
            ]
        )
        XCTAssertEqual(payload["error_stage"] as? String, "print_observation")
        XCTAssertEqual(payload["print_document_kind"] as? String, "popup")
        XCTAssertEqual(payload["print_section_count"] as? Int, 10)
        XCTAssertEqual(payload["print_action_clicked"] as? Bool, true)
        XCTAssertNil(payload["subject"])
        XCTAssertNil(payload["sender"])
        XCTAssertNil(payload["body_text"])
        XCTAssertNil(payload["raw_html"])
        XCTAssertFalse(String(describing: payload).contains("Private"))
        XCTAssertFalse(String(describing: payload).contains("example.test"))
    }

    @MainActor
    func testGmailHistoryChildDiagnosticClicksOnlyCountMatchedAdxChild() async throws {
        let view = WKWebView(frame: NSRect(x: 0, y: 0, width: 800, height: 600))
        view.loadHTMLString("""
        <style>.kQ,.adx { display:block; width:120px; height:24px }</style>
        <div id="history" class="kQ"><span id="history-count" class="adx">10</span></div>
        <div class="kQ"><span class="adx">4</span></div>
        <script>
          window.historyChildClicks = 0;
          window.historyParentClicks = 0;
          document.getElementById('history').onclick = () => { window.historyParentClicks += 1 };
          document.getElementById('history-count').onclick = (event) => {
            event.stopPropagation(); window.historyChildClicks += 1;
          };
        </script>
        """, baseURL: nil)
        try await Task.sleep(nanoseconds: 250_000_000)

        let value = try await view.callAsyncJavaScript(
            WebMailBridge.detailHistoryChildDryActionScript,
            arguments: ["expectedThreadCount": 11], contentWorld: .page
        )
        let observed = try XCTUnwrap(value as? [String: Any])
        XCTAssertEqual((observed["candidate_count"] as? NSNumber)?.intValue, 1)
        XCTAssertEqual((observed["history_raw_child_count"] as? NSNumber)?.intValue, 2)
        XCTAssertEqual((observed["history_visible_child_count"] as? NSNumber)?.intValue, 2)
        XCTAssertEqual((observed["history_numeric_child_count"] as? NSNumber)?.intValue, 2)
        XCTAssertEqual((observed["history_first_numeric_control_count"] as? NSNumber)?.intValue, 10)
        XCTAssertEqual((observed["history_semantic_child_count"] as? NSNumber)?.intValue, 0)
        XCTAssertEqual((observed["history_control_count"] as? NSNumber)?.intValue, 10)
        XCTAssertEqual(observed["history_child_present"] as? Bool, true)
        XCTAssertEqual(observed["history_control_matches_hint"] as? Bool, false)
        XCTAssertEqual(observed["history_control_plus_visible_matches_hint"] as? Bool, true)
        XCTAssertEqual((observed["clicked_total"] as? NSNumber)?.intValue, 1)
        let childClicks = try await view.callAsyncJavaScript(
            "return Number(window.historyChildClicks || 0)", arguments: [:], contentWorld: .page
        ) as? NSNumber
        let parentClicks = try await view.callAsyncJavaScript(
            "return Number(window.historyParentClicks || 0)", arguments: [:], contentWorld: .page
        ) as? NSNumber
        XCTAssertEqual(childClicks?.intValue, 1)
        XCTAssertEqual(parentClicks?.intValue, 0)
    }

    @MainActor
    func testGmailHistoryChildDiagnosticClicksUniqueSemanticOlderMessageCount() async throws {
        let view = WKWebView(frame: NSRect(x: 0, y: 0, width: 800, height: 600))
        view.loadHTMLString("""
        <style>.kQ,.adx { display:block; width:120px; height:24px }</style>
        <div class="kQ" aria-label="8 older messages">
          <span id="history-count" class="adx">8</span>
        </div>
        <script>
          window.historyChildClicks = 0;
          document.getElementById('history-count').onclick = () => { window.historyChildClicks += 1 };
        </script>
        """, baseURL: nil)
        try await Task.sleep(nanoseconds: 250_000_000)

        let value = try await view.callAsyncJavaScript(
            WebMailBridge.detailHistoryChildDryActionScript,
            arguments: ["expectedThreadCount": 11], contentWorld: .page
        )
        let observed = try XCTUnwrap(value as? [String: Any])
        XCTAssertEqual((observed["candidate_count"] as? NSNumber)?.intValue, 0)
        XCTAssertEqual((observed["history_semantic_child_count"] as? NSNumber)?.intValue, 1)
        XCTAssertEqual((observed["history_message_semantic_child_count"] as? NSNumber)?.intValue, 1)
        XCTAssertEqual((observed["history_history_semantic_child_count"] as? NSNumber)?.intValue, 1)
        XCTAssertEqual((observed["history_control_count"] as? NSNumber)?.intValue, 8)
        XCTAssertEqual(observed["history_child_present"] as? Bool, true)
        XCTAssertEqual((observed["clicked_total"] as? NSNumber)?.intValue, 1)
        let clicks = try await view.callAsyncJavaScript(
            "return Number(window.historyChildClicks || 0)", arguments: [:], contentWorld: .page
        ) as? NSNumber
        XCTAssertEqual(clicks?.intValue, 1)
        XCTAssertFalse(String(describing: observed).contains("older messages"))
    }

    @MainActor
    func testGmailHistoryChildDiagnosticDoesNotClickUncorroboratedCount() async throws {
        let view = WKWebView(frame: NSRect(x: 0, y: 0, width: 800, height: 600))
        view.loadHTMLString("""
        <style>.kQ,.adx { display:block; width:120px; height:24px }</style>
        <div class="kQ"><span id="count" class="adx">4</span></div>
        <script>window.historyChildClicks = 0; count.onclick = () => { window.historyChildClicks += 1 };</script>
        """, baseURL: nil)
        try await Task.sleep(nanoseconds: 250_000_000)

        let value = try await view.callAsyncJavaScript(
            WebMailBridge.detailHistoryChildDryActionScript,
            arguments: ["expectedThreadCount": 11], contentWorld: .page
        )
        let observed = try XCTUnwrap(value as? [String: Any])
        XCTAssertEqual((observed["candidate_count"] as? NSNumber)?.intValue, 0)
        XCTAssertEqual((observed["history_raw_child_count"] as? NSNumber)?.intValue, 1)
        XCTAssertEqual((observed["history_visible_child_count"] as? NSNumber)?.intValue, 1)
        XCTAssertEqual((observed["history_numeric_child_count"] as? NSNumber)?.intValue, 1)
        XCTAssertEqual((observed["history_first_numeric_control_count"] as? NSNumber)?.intValue, 4)
        XCTAssertEqual((observed["history_semantic_child_count"] as? NSNumber)?.intValue, 0)
        XCTAssertEqual((observed["clicked_total"] as? NSNumber)?.intValue, 0)
        let clicks = try await view.callAsyncJavaScript(
            "return Number(window.historyChildClicks || 0)", arguments: [:], contentWorld: .page
        ) as? NSNumber
        XCTAssertEqual(clicks?.intValue, 0)
    }

    @MainActor
    func testGmailIdentityTracePayloadWhitelistsOnlyKeyedOwnershipEvidence() throws {
        let fingerprint = WebMailBridge.gmailThreadIdentityFingerprint(["thread-f:private-thread"])
        let payload = WebMailBridge.gmailAcquisitionTracePayload(
            attemptID: "attempt-identity", trigger: "force_refetch_identity_dry",
            stage: "identity_detail_observation", surfaceMessageID: "surface-1", fields: [
                "error_stage": "identity_detail",
                "stored_thread_fingerprint": fingerprint,
                "inbox_thread_fingerprint": fingerprint,
                "detail_thread_fingerprint": fingerprint,
                "detail_route_thread_fingerprint": fingerprint,
                "inbox_thread_identity_count": 1,
                "detail_thread_identity_count": 1,
                "detail_thread_owner_count": 1,
                "history_control_count": 10,
                "history_raw_child_count": 1,
                "history_visible_child_count": 1,
                "history_numeric_child_count": 1,
                "history_first_numeric_control_count": 10,
                "history_semantic_child_count": 1,
                "history_message_semantic_child_count": 1,
                "history_history_semantic_child_count": 1,
                "history_child_present": true,
                "history_control_matches_hint": false,
                "history_control_plus_visible_matches_hint": true,
                "stored_thread_identity_present": true,
                "inbox_thread_identity_present": true,
                "detail_thread_identity_present": true,
                "detail_route_thread_identity_present": true,
                "stored_inbox_thread_identity_matches": true,
                "inbox_detail_thread_identity_matches": true,
                "inbox_detail_route_identity_matches": true,
                "detail_owner_route_identity_matches": true,
                "raw_thread_id": "private-thread",
                "subject": "Private subject",
                "body_text": "Private body",
            ]
        )
        XCTAssertEqual(payload["error_stage"] as? String, "identity_detail")
        XCTAssertEqual(payload["stored_thread_fingerprint"] as? String, fingerprint)
        XCTAssertEqual(payload["inbox_detail_thread_identity_matches"] as? Bool, true)
        XCTAssertEqual(payload["detail_thread_owner_count"] as? Int, 1)
        XCTAssertEqual(payload["history_control_count"] as? Int, 10)
        XCTAssertEqual(payload["history_raw_child_count"] as? Int, 1)
        XCTAssertEqual(payload["history_visible_child_count"] as? Int, 1)
        XCTAssertEqual(payload["history_numeric_child_count"] as? Int, 1)
        XCTAssertEqual(payload["history_first_numeric_control_count"] as? Int, 10)
        XCTAssertEqual(payload["history_semantic_child_count"] as? Int, 1)
        XCTAssertEqual(payload["history_message_semantic_child_count"] as? Int, 1)
        XCTAssertEqual(payload["history_history_semantic_child_count"] as? Int, 1)
        XCTAssertEqual(payload["history_child_present"] as? Bool, true)
        XCTAssertEqual(payload["history_control_plus_visible_matches_hint"] as? Bool, true)
        XCTAssertNil(payload["raw_thread_id"])
        XCTAssertNil(payload["subject"])
        XCTAssertNil(payload["body_text"])
        XCTAssertFalse(String(describing: payload).contains("private-thread"))
        XCTAssertFalse(String(describing: payload).contains("Private"))
    }

    @MainActor
    func testGmailInboxCountDiagnosticSeparatesCountSourcesForExactRow() async throws {
        let view = WKWebView(frame: NSRect(x: 0, y: 0, width: 800, height: 600))
        view.loadHTMLString("""
        <main role="main">
          <table><tr class="zA" data-legacy-thread-id="target-thread"
            aria-label="conversation with 11 messages">
            <td class="yW"><span>People</span><span class="bqe">11</span></td>
            <td><a href="#inbox/target-thread">Open</a></td>
          </tr></table>
        </main>
        """, baseURL: URL(string: "https://mail.google.com/mail/u/0/#inbox"))
        try await Task.sleep(nanoseconds: 250_000_000)

        let value = try await view.callAsyncJavaScript(
            WebMailBridge.inboxCountDiagnosticScript,
            arguments: ["expectedURL": "https://mail.google.com/mail/u/0/#inbox/target-thread"],
            contentWorld: .page
        )
        let observed = try XCTUnwrap(value as? [String: Any])
        XCTAssertEqual(observed["inbox_target_found"] as? Bool, true)
        XCTAssertEqual(observed["inbox_thread_attribute_match"] as? Bool, true)
        XCTAssertEqual((observed["inbox_matching_row_count"] as? NSNumber)?.intValue, 1)
        XCTAssertEqual((observed["inbox_primary_count"] as? NSNumber)?.intValue, 11)
        XCTAssertEqual((observed["inbox_dedicated_count"] as? NSNumber)?.intValue, 11)
        XCTAssertEqual((observed["inbox_sender_suffix_count"] as? NSNumber)?.intValue, 11)
        XCTAssertEqual((observed["inbox_aria_count"] as? NSNumber)?.intValue, 11)
        XCTAssertEqual((observed["inbox_selected_count"] as? NSNumber)?.intValue, 11)
        XCTAssertEqual(observed["inbox_count_sources_agree"] as? Bool, true)
        let serialized = String(describing: observed)
        XCTAssertFalse(serialized.contains("target-thread"))
        XCTAssertFalse(serialized.contains("People"))
    }

    @MainActor
    func testGmailViewportDiagnosticTargetSurvivesCountHintDriftWhileIncomplete() {
        XCTAssertTrue(WebMailBridge.gmailViewportDiagnosticTargetIsAvailable(
            surfaceMessageID: "gmail-19f4d51b2bdb1300", contentState: "partial"
        ))
        XCTAssertTrue(WebMailBridge.gmailViewportDiagnosticTargetIsAvailable(
            surfaceMessageID: "gmail-19f4d51b2bdb1300", contentState: "preview"
        ))
        XCTAssertFalse(WebMailBridge.gmailViewportDiagnosticTargetIsAvailable(
            surfaceMessageID: "gmail-19f4d51b2bdb1300", contentState: "complete"
        ))
        XCTAssertFalse(WebMailBridge.gmailViewportDiagnosticTargetIsAvailable(
            surfaceMessageID: "gmail-other", contentState: "partial"
        ))
    }

    @MainActor
    func testGmailViewportDiagnosticScrollsOnlyOwnedContainerAndRestores() async throws {
        XCTAssertFalse(WebMailBridge.detailScrollActionScript.contains("requestAnimationFrame"))
        let view = WKWebView(frame: NSRect(x: 0, y: 0, width: 800, height: 600))
        view.loadHTMLString("""
        <style>
          #thread { display:block; width:400px; height:100px; overflow-y:auto }
          .adn { display:block; height:120px }
          .a3s { display:block; width:200px; height:80px }
        </style>
        <main id="thread" role="main">
          <div class="adn ads" data-message-id="msg-f:one"><div class="a3s aiL">One</div></div>
          <div class="adn ads" data-message-id="msg-f:two"><div class="a3s aiL">Two</div></div>
          <div class="adn ads" data-message-id="msg-f:three"><div class="a3s aiL">Three</div></div>
        </main>
        <button id="outside">Do not click</button>
        <script>
          window.outsideClicks = 0;
          outside.onclick = () => { window.outsideClicks += 1 };
          thread.scrollTop = 17;
        </script>
        """, baseURL: nil)
        try await Task.sleep(nanoseconds: 250_000_000)

        let initializedValue = try await view.callAsyncJavaScript(
            WebMailBridge.detailScrollActionScript,
            arguments: ["action": "initialize", "targetPercent": 0], contentWorld: .page
        )
        let initialized = try XCTUnwrap(initializedValue as? [String: Any])
        XCTAssertEqual(initialized["scroll_container_found"] as? Bool, true)
        XCTAssertEqual(initialized["scroll_container_kind"] as? String, "role_main")

        let movedValue = try await view.callAsyncJavaScript(
            WebMailBridge.detailScrollActionScript,
            arguments: ["action": "move", "targetPercent": 100], contentWorld: .page
        )
        let moved = try XCTUnwrap(movedValue as? [String: Any])
        XCTAssertEqual((moved["scroll_position_percent"] as? NSNumber)?.intValue, 100)

        let inventoryValue = try await view.callAsyncJavaScript(
            WebMailBridge.detailScrollInventoryScript, arguments: [:], contentWorld: .page
        )
        let inventory = try XCTUnwrap(inventoryValue as? [String: Any])
        XCTAssertEqual((inventory["unique_card_count"] as? NSNumber)?.intValue, 3)
        XCTAssertEqual((inventory["unique_native_id_count"] as? NSNumber)?.intValue, 3)

        let restoredValue = try await view.callAsyncJavaScript(
            WebMailBridge.detailScrollActionScript,
            arguments: ["action": "restore", "targetPercent": 0], contentWorld: .page
        )
        let restored = try XCTUnwrap(restoredValue as? [String: Any])
        XCTAssertEqual(restored["scroll_restored"] as? Bool, true)
        let clicks = try await view.callAsyncJavaScript(
            "return Number(window.outsideClicks || 0)", arguments: [:], contentWorld: .page
        ) as? NSNumber
        XCTAssertEqual(clicks?.intValue, 0)
    }

    @MainActor
    func testGmailRecoveryPreservesCoreBridgeTimestamp() {
        let milliseconds: Int64 = 1_783_436_640_000
        XCTAssertEqual(WebMailBridge.bridgeTimestampMilliseconds(milliseconds), milliseconds)
        XCTAssertEqual(
            WebMailBridge.bridgeTimestampMilliseconds(NSNumber(value: milliseconds)),
            milliseconds
        )
        XCTAssertEqual(
            WebMailBridge.bridgeTimestampMilliseconds("1783436640000"),
            milliseconds
        )
        XCTAssertEqual(WebMailBridge.bridgeTimestampMilliseconds(nil), 0)
        XCTAssertEqual(WebMailBridge.bridgeTimestampMilliseconds(-1), 0)
    }

    func testEveryUserMessageRequestTriggersAutomaticEmailSync() {
        XCTAssertTrue(WebMailBridge.coreRequestSubmitsUserMessage(
            method: "turn.submit",
            params: ["chat_session_creation": ["workspace_dirs": ["/repo/arbol"]]]
        ))
        XCTAssertTrue(WebMailBridge.coreRequestSubmitsUserMessage(
            method: "turn.submit", params: ["chat_session_id": "session-1"]
        ))
        XCTAssertTrue(WebMailBridge.coreRequestSubmitsUserMessage(
            method: "chat_session.send", params: ["id": "session-1", "text": "Follow up"]
        ))
        XCTAssertTrue(WebMailBridge.coreRequestSubmitsUserMessage(
            method: "chat_session.edit_turn", params: ["chat_session_id": "session-1"]
        ))
        XCTAssertFalse(WebMailBridge.coreRequestSubmitsUserMessage(
            method: "chat_session.create", params: [:]
        ))
        XCTAssertFalse(WebMailBridge.coreRequestSubmitsUserMessage(
            method: "chat_session.add_chat_note", params: [:]
        ))
        XCTAssertFalse(WebMailBridge.coreRequestSubmitsUserMessage(
            method: "chat_session.get", params: [:]
        ))
    }

    func testOpeningChatSessionRequestsAutomaticEmailSyncButClosingDoesNot() {
        XCTAssertTrue(WebMailBridge.activeChatSessionChangeRequestsAutomaticEmailSync("session-1"))
        XCTAssertTrue(WebMailBridge.activeChatSessionChangeRequestsAutomaticEmailSync(" session-1 "))
        XCTAssertFalse(WebMailBridge.activeChatSessionChangeRequestsAutomaticEmailSync(""))
        XCTAssertFalse(WebMailBridge.activeChatSessionChangeRequestsAutomaticEmailSync("  "))
    }

    func testUserMessageEmailSyncThrottleAllowsAtMostOnceEveryFiveMinutes() {
        let now = Date(timeIntervalSince1970: 2_000_000_000)
        let first = WebMailBridge.userMessageAutomaticSyncAdmission(
            lastStartedAt: nil, now: now
        )
        XCTAssertTrue(first.allowed)
        XCTAssertEqual(first.retryAfterSeconds, 0)

        let recent = WebMailBridge.userMessageAutomaticSyncAdmission(
            lastStartedAt: now.addingTimeInterval(-299.2), now: now
        )
        XCTAssertFalse(recent.allowed)
        XCTAssertEqual(recent.retryAfterSeconds, 1)

        let boundary = WebMailBridge.userMessageAutomaticSyncAdmission(
            lastStartedAt: now.addingTimeInterval(-300), now: now
        )
        XCTAssertTrue(boundary.allowed)
        XCTAssertEqual(boundary.retryAfterSeconds, 0)
    }

    @MainActor
    func testGmailRecoveryDerivesProviderMessageIdentityFromAcquisitionSurface() {
        XCTAssertEqual(WebMailBridge.gmailProviderMessageID(from: [
            "surface_message_id": "gmail-19ef334357d518e0",
        ]), "19ef334357d518e0")
        XCTAssertEqual(WebMailBridge.gmailProviderMessageID(from: [
            "surface_message_id": "gmail-surface-fallback",
            "message_id": "provider-message",
        ]), "provider-message")
        XCTAssertEqual(WebMailBridge.gmailProviderMessageID(from: [
            "surface_message_id": "gmail-surface-fallback",
            "provider_message_id": "provider-canonical",
            "message_id": "provider-message",
        ]), "provider-canonical")
        XCTAssertEqual(WebMailBridge.gmailProviderMessageID(from: [
            "surface_message_id": "other-19ef334357d518e0",
        ]), "")
    }

    @MainActor
    func testGmailDurableCandidatePreservesProviderIdentitySeparatelyFromLegacyRoute() throws {
        let result = try XCTUnwrap(WebMailBridge.automaticDiscoveryFromDurableCandidate([
            "surface_message_id": "gmail-19ef334357d518e0",
            "remote_url": "https://mail.google.com/mail/u/0/#inbox/legacy-route-alias",
            "subject": "Persisted subject",
            "sender": "jira@example.test",
            "date_received": Int64(1_783_436_640_000),
        ]))
        XCTAssertEqual(result["message_id"] as? String, "legacy-route-alias")
        XCTAssertEqual(result["provider_message_id"] as? String, "19ef334357d518e0")
    }

    @MainActor
    func testGmailSearchRecoveryUsesProviderMessageIdentityWhenSenderIsHidden() async throws {
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .nonPersistent()
        let view = WKWebView(frame: NSRect(x: 0, y: 0, width: 1000, height: 700),
                             configuration: configuration)
        view.loadHTMLString("""
        <main role="main">
          <table><tr class="zA" data-legacy-thread-id="thread-f:canonical-thread">
            <td><span class="bog">A truncated subject…</span></td>
            <td class="xW"><span title="Jul 7, 2026, 4:24 PM">Jul 7</span></td>
            <td><span data-legacy-message-id="msg-f:19ef334357d518e0"></span></td>
          </tr></table>
        </main>
        """, baseURL: URL(string: "https://mail.google.com/mail/u/0/#search/query"))
        try await Task.sleep(nanoseconds: 250_000_000)

        let result = try await view.callAsyncJavaScript(
            WebMailBridge.openInboxRowScript,
            arguments: [
                "rowIndex": 0,
                "expectedSubject": "A completely different persisted subject",
                "expectedSender": "jira@example.test",
                "expectedTimestamp": Int64(1_783_436_640_000),
                "expectedProviderMessageID": "19ef334357d518e0",
                "requireIdentityMatch": true,
                "returnConversationURL": true,
            ], contentWorld: .page
        ) as? String
        XCTAssertEqual(result, "https://mail.google.com/mail/u/0/#inbox/canonical-thread")
    }

    @MainActor
    func testGmailSearchRecoveryAcceptsExactProviderIdentityFromThreadAttribute() async throws {
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .nonPersistent()
        let view = WKWebView(frame: NSRect(x: 0, y: 0, width: 1000, height: 700),
                             configuration: configuration)
        view.loadHTMLString("""
        <main role="main">
          <table><tr class="zA" data-legacy-thread-id="thread-f:canonical-thread">
            <td><a href="#inbox/19ef334357d518e0"><span class="bog">A truncated subject…</span></a></td>
            <td><span data-legacy-message-id="msg-f:19ef334357d518e0"></span></td>
          </tr></table>
        </main>
        """, baseURL: URL(string: "https://mail.google.com/mail/u/0/#search/query"))
        try await Task.sleep(nanoseconds: 250_000_000)

        let result = try await view.callAsyncJavaScript(
            WebMailBridge.openInboxRowScript,
            arguments: [
                "rowIndex": 0,
                "expectedSubject": "A completely different persisted subject",
                "expectedSender": "jira@example.test",
                "expectedTimestamp": Int64(1_783_436_640_000),
                "expectedProviderMessageID": "19ef334357d518e0",
                "rejectedConversationURL": "https://mail.google.com/mail/u/0/#inbox/19ef334357d518e0",
                "requireIdentityMatch": true,
                "returnConversationURL": true,
            ], contentWorld: .page
        ) as? String
        XCTAssertEqual(result, "https://mail.google.com/mail/u/0/#inbox/canonical-thread")
    }

    @MainActor
    func testGmailSearchRecoveryUsesDayBoundQueryWhenRowDateIsUnavailable() async throws {
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .nonPersistent()
        let view = WKWebView(frame: NSRect(x: 0, y: 0, width: 1000, height: 700),
                             configuration: configuration)
        view.loadHTMLString("""
        <main role="main">
          <table><tr class="zA" data-legacy-thread-id="thread-f:recovered-thread">
            <td><span class="bog">DEMO-10006 update</span></td>
          </tr></table>
        </main>
        """, baseURL: URL(string: "https://mail.google.com/mail/u/0/#search/from%3Ajira%40example.test%20after%3A2026%2F07%2F06%20before%3A2026%2F07%2F07"))
        try await Task.sleep(nanoseconds: 250_000_000)

        let result = try await view.callAsyncJavaScript(
            WebMailBridge.openInboxRowScript,
            arguments: [
                "rowIndex": 0,
                "expectedSubject": "[JIRA] Updates for DEMO-10006: Example settings cannot be saved",
                "expectedSender": "jira@example.test",
                "expectedTimestamp": Int64(1_783_327_500_000),
                "expectedProviderMessageID": "provider-id-not-exposed",
                "requireIdentityMatch": true,
                "returnConversationURL": true,
            ], contentWorld: .page
        ) as? String
        XCTAssertEqual(result, "https://mail.google.com/mail/u/0/#inbox/recovered-thread")
    }

    @MainActor
    func testGmailSearchURLCanResolveLegacyPreviewRows() throws {
        let url = try XCTUnwrap(WebMailBridge.gmailSearchURL(
            mailboxURL: URL(string: "https://mail.google.com/mail/u/0/#inbox")!,
            subject: "Pipeline failed / retry?", sender: "GitLab <notifications@example.com>"
        ))
        XCTAssertEqual(url.host, "mail.google.com")
        let encodedFragment = try XCTUnwrap(URLComponents(
            url: url, resolvingAgainstBaseURL: false
        )?.percentEncodedFragment)
        // Gmail hash routes must be encoded exactly once. A double-encoded
        // `%2522` route loads Gmail but produces no search result rows.
        XCTAssertFalse(encodedFragment.contains("%25"))
        XCTAssertTrue(encodedFragment.contains("%22"))
        let fragment = encodedFragment.removingPercentEncoding ?? encodedFragment
        XCTAssertTrue(fragment.hasPrefix("search/"))
        XCTAssertTrue(fragment.contains("subject:\"Pipeline failed / retry?\""))
        XCTAssertTrue(fragment.contains("from:notifications@example.com"))
        let dated = try XCTUnwrap(WebMailBridge.gmailSearchURL(
            mailboxURL: URL(string: "https://mail.google.com/mail/u/0/#inbox")!,
            subject: "A punctuation-heavy / truncated? subject", sender: "GitLab <notifications@example.com>",
            dateReceived: 1_753_276_320_000
        ))
        let datedEncodedFragment = try XCTUnwrap(URLComponents(
            url: dated, resolvingAgainstBaseURL: false
        )?.percentEncodedFragment)
        let datedFragment = datedEncodedFragment.removingPercentEncoding ?? datedEncodedFragment
        XCTAssertTrue(datedFragment.contains("from:notifications@example.com"))
        XCTAssertTrue(datedFragment.contains("after:"))
        XCTAssertTrue(datedFragment.contains("before:"))
        XCTAssertFalse(datedFragment.contains("subject:"))
        XCTAssertNil(WebMailBridge.gmailSearchURL(
            mailboxURL: URL(string: "https://example.com/#inbox")!, subject: "Unsafe", sender: ""
        ))

        let fallbacks = WebMailBridge.gmailCandidateSearchURLs(
            mailboxURL: URL(string: "https://mail.google.com/mail/u/0/#inbox")!,
            subject: "Accepted: Team M Retro", sender: "Person <person@example.com>",
            dateReceived: 1_753_276_320_000
        )
        XCTAssertEqual(fallbacks.count, 3)
        let fallbackRoutes = fallbacks.compactMap {
            URLComponents(url: $0, resolvingAgainstBaseURL: false)?.percentEncodedFragment?.removingPercentEncoding
        }
        XCTAssertTrue(fallbackRoutes[0].contains("after:"))
        XCTAssertTrue(fallbackRoutes[0].contains("before:"))
        XCTAssertTrue(fallbackRoutes[1].contains("subject:\"Accepted: Team M Retro\""))
        XCTAssertTrue(fallbackRoutes[1].contains("from:person@example.com"))
        XCTAssertFalse(fallbackRoutes[2].contains("from:"))
    }
}

final class LatestChatSessionsIntegrationTests: XCTestCase {
    func testCoreResponseIsMappedAndSortedByRecency() {
        let rows = LatestChatSessionsModel.rows(from: ["chat_sessions": [
            ["id": "old", "title": "Old", "repo_path": "/tmp/old", "updated_at": 1000],
            ["title": "missing id", "updated_at": 9999],
            ["id": "new", "title": "New", "repo_path": "/tmp/new", "created_at": 1500, "updated_at": 2000],
            ["id": "created-only", "title": "Created", "repository": "/work/created", "created_at": 1750],
        ]])

        XCTAssertEqual(rows.map(\.id), ["new", "created-only", "old"])
        XCTAssertEqual(rows.map(\.repo), ["new", "created", "old"])
    }

    @MainActor
    func testListViewKeyboardNavigationEnterAndNumberShortcutsOpenSessions() throws {
        let view = LatestChatSessionsListView(frame: NSRect(x: 0, y: 0, width: 620, height: 560))
        var opened: [String] = []
        view.onOpen = { opened.append($0.id) }
        view.setSessions((1...12).map { LatestChatSessionRow([
            "id": "s\($0)",
            "title": "Session \($0)",
            "updated_at": $0,
        ])! })

        view.keyDown(with: keyEvent(characters: "\u{F701}", keyCode: UInt16(kVK_DownArrow)))
        view.keyDown(with: keyEvent(characters: "\u{F701}", keyCode: UInt16(kVK_DownArrow)))
        XCTAssertEqual(view.selectedIndex, 2)

        view.keyDown(with: keyEvent(characters: "\r", keyCode: UInt16(kVK_Return)))
        XCTAssertEqual(opened, ["s3"])

        view.keyDown(with: keyEvent(characters: "0", keyCode: UInt16(kVK_ANSI_0)))
        XCTAssertEqual(opened, ["s3", "s10"])

        view.keyDown(with: keyEvent(characters: "9", keyCode: UInt16(kVK_ANSI_9)))
        XCTAssertEqual(opened, ["s3", "s10", "s9"])
    }
}

final class LatestChatSessionsE2ETests: XCTestCase {
    @MainActor
    func testPrefetchedSessionsAreVisibleImmediatelyWhenPopupOpens() async throws {
        var loadCount = 0
        let popup = LatestChatSessionsPopupController(
            sessionLoader: { _ in
                loadCount += 1
                if loadCount > 1 { try await Task.sleep(nanoseconds: 1_000_000_000) }
                return ["chat_sessions": [
                    ["id": "cached", "title": "Cached session", "updated_at": 2000],
                ]]
            },
            sessionOpener: { _ in }
        )

        popup.prefetch()
        try await waitUntil(timeout: 1.0) { loadCount == 1 }
        // Yield once more so the response is committed to the popup cache after
        // the loader itself returns.
        await Task.yield()

        popup.show()

        let listView = try XCTUnwrap(popup.listView)
        XCTAssertFalse(listView.loading)
        XCTAssertEqual(listView.sessions.map(\.id), ["cached"])
        XCTAssertEqual(loadCount, 1, "the background refresh must not delay cached first paint")
        popup.dismiss()
    }

    @MainActor
    func testPopupShowsLoadsLatestSessionsAndOpensChosenSessionInElma() async throws {
        var capturedParams: [String: Any]?
        var openedSessionIDs: [String] = []
        let opened = expectation(description: "selected chat session opens")

        let popup = LatestChatSessionsPopupController(
            sessionLoader: { params in
                capturedParams = params
                return ["chat_sessions": [
                    ["id": "s1", "title": "Oldest", "updated_at": 1000],
                    ["id": "s2", "title": "Newest", "updated_at": 3000],
                    ["id": "s3", "title": "Middle", "updated_at": 2000],
                ]]
            },
            sessionOpener: { session in
                openedSessionIDs.append(session.id)
                opened.fulfill()
            }
        )

        popup.show()

        let panel = try XCTUnwrap(popup.panel)
        let listView = try XCTUnwrap(popup.listView)
        try await waitUntil(timeout: 1.0) {
            listView.sessions.map(\.id) == ["s2", "s3", "s1"]
        }
        XCTAssertTrue(panel.ignoresMouseEvents, "Latest chat sessions popup must be keyboard-only")
        XCTAssertNotNil(popup.localOutsideEventMonitor, "Popup should observe local outside actions without consuming them")
        XCTAssertNotNil(popup.globalOutsideEventMonitor, "Popup should observe global outside actions without consuming them")
        XCTAssertEqual(capturedParams?["limit"] as? Int, 100)
        XCTAssertNil(capturedParams?["include_imported"])
        XCTAssertEqual(listView.sessions.map(\.id), ["s2", "s3", "s1"])

        listView.keyDown(with: keyEvent(characters: "2", keyCode: UInt16(kVK_ANSI_2)))
        await fulfillment(of: [opened], timeout: 1.0)

        XCTAssertEqual(openedSessionIDs, ["s3"])
        XCTAssertFalse(panel.isVisible, "Opening a session should dismiss the popup")
        XCTAssertNil(popup.localOutsideEventMonitor, "Opening should remove outside-action monitors")
        XCTAssertNil(popup.globalOutsideEventMonitor, "Opening should remove outside-action monitors")
    }

    @MainActor
    func testOutsideActionDismissesPopupWithoutConsumingOtherAppsEvents() async throws {
        let popup = LatestChatSessionsPopupController(
            sessionLoader: { _ in ["chat_sessions": []] },
            sessionOpener: { _ in }
        )

        popup.show()
        try await Task.sleep(nanoseconds: 60_000_000)

        let panel = try XCTUnwrap(popup.panel)
        XCTAssertTrue(panel.isVisible)
        XCTAssertTrue(panel.ignoresMouseEvents, "Popup must not intercept mouse access to other apps")
        XCTAssertNotNil(popup.localOutsideEventMonitor)
        XCTAssertNotNil(popup.globalOutsideEventMonitor)

        popup.dismissForOutsideAction()

        XCTAssertFalse(panel.isVisible)
        XCTAssertNil(popup.localOutsideEventMonitor)
        XCTAssertNil(popup.globalOutsideEventMonitor)
    }
}


@MainActor
final class ArbolWebViewCommandNumberTests: XCTestCase {
    private func commandEvent(keyCode: UInt16, modifiers: NSEvent.ModifierFlags = [.command]) -> NSEvent {
        NSEvent.keyEvent(
            with: .keyDown, location: .zero, modifierFlags: modifiers,
            timestamp: 0, windowNumber: 0, context: nil,
            characters: "", charactersIgnoringModifiers: "",
            isARepeat: false, keyCode: keyCode
        )!
    }

    func testPhysicalNumberRowMapsToCommandNumber() {
        XCTAssertEqual(ArbolWebView.commandNumber(from: commandEvent(keyCode: UInt16(kVK_ANSI_1))), "1")
        XCTAssertEqual(ArbolWebView.commandNumber(from: commandEvent(keyCode: UInt16(kVK_ANSI_0))), "0")
        XCTAssertNil(ArbolWebView.commandNumber(from: commandEvent(keyCode: UInt16(kVK_ANSI_1), modifiers: [.command, .shift])))
        XCTAssertNil(ArbolWebView.commandNumber(from: commandEvent(keyCode: UInt16(kVK_ANSI_A))))
    }

    func testCommandEscapeStopsBeforeWebKitConsumesIt() {
        XCTAssertTrue(ArbolWebView.isCommandEscape(commandEvent(keyCode: UInt16(kVK_Escape))))
        XCTAssertTrue(ArbolWebView.isCommandEscape(commandEvent(keyCode: UInt16(kVK_Escape), modifiers: [.command, .capsLock, .function])))
        for modifiers: NSEvent.ModifierFlags in [[], [.command, .shift], [.command, .option], [.command, .control]] {
            XCTAssertFalse(ArbolWebView.isCommandEscape(commandEvent(keyCode: UInt16(kVK_Escape), modifiers: modifiers)))
        }
        XCTAssertFalse(ArbolWebView.isCommandEscape(commandEvent(keyCode: UInt16(kVK_Delete))))
        let webView = ArbolWebView(frame: .zero)
        var stops = 0
        webView.commandEscapeHandler = { stops += 1 }
        XCTAssertTrue(webView.performKeyEquivalent(with: commandEvent(keyCode: UInt16(kVK_Escape))))
        XCTAssertEqual(stops, 1)
    }

    func testCommandBackspaceIsRecognizedBeforeWebKitConsumesIt() {
        XCTAssertTrue(ArbolWebView.isCommandBackspace(commandEvent(keyCode: UInt16(kVK_Delete))))
        XCTAssertFalse(ArbolWebView.isCommandBackspace(commandEvent(keyCode: UInt16(kVK_ForwardDelete))))
        XCTAssertFalse(ArbolWebView.isCommandBackspace(commandEvent(keyCode: UInt16(kVK_Delete), modifiers: [.command, .shift])))
    }
}

private func keyEvent(characters: String, keyCode: UInt16) -> NSEvent {
    NSEvent.keyEvent(
        with: .keyDown,
        location: .zero,
        modifierFlags: [],
        timestamp: 0,
        windowNumber: 0,
        context: nil,
        characters: characters,
        charactersIgnoringModifiers: characters,
        isARepeat: false,
        keyCode: keyCode
    )!
}


private func waitUntil(timeout: TimeInterval, _ condition: @MainActor @escaping () -> Bool) async throws {
    let deadline = Date().addingTimeInterval(timeout)
    while Date() < deadline {
        if await condition() { return }
        try await Task.sleep(nanoseconds: 20_000_000)
    }
    if await condition() { return }
    XCTFail("Timed out waiting for condition")
}

@MainActor
final class GoToPageHotkeyControllerTests: XCTestCase {
    private func keyEvent(
        keyCode: UInt16,
        modifiers: NSEvent.ModifierFlags = [.command]
    ) -> NSEvent {
        NSEvent.keyEvent(
            with: .keyDown, location: .zero, modifierFlags: modifiers,
            timestamp: 0, windowNumber: 0, context: nil,
            characters: "", charactersIgnoringModifiers: "",
            isARepeat: false, keyCode: keyCode
        )!
    }

    func testCmdGIsHandledOnlyWithAVisibleArbolWindow() {
        let commandG = keyEvent(keyCode: UInt16(kVK_ANSI_G))

        XCTAssertTrue(GoToPageHotkeyController.shouldHandle(event: commandG, hasVisibleWindow: true))
        XCTAssertFalse(GoToPageHotkeyController.shouldHandle(event: commandG, hasVisibleWindow: false))
    }

    func testCmdGRequiresExactCommandModifierAndGKey() {
        XCTAssertFalse(GoToPageHotkeyController.shouldHandle(
            event: keyEvent(keyCode: UInt16(kVK_ANSI_G), modifiers: [.command, .shift]),
            hasVisibleWindow: true
        ))
        XCTAssertFalse(GoToPageHotkeyController.shouldHandle(
            event: keyEvent(keyCode: UInt16(kVK_ANSI_R)),
            hasVisibleWindow: true
        ))
    }
}

@MainActor
final class RepoArtifactsHotkeyControllerTests: XCTestCase {
    private func keyEvent(
        keyCode: UInt16,
        modifiers: NSEvent.ModifierFlags = [.command]
    ) -> NSEvent {
        NSEvent.keyEvent(
            with: .keyDown, location: .zero, modifierFlags: modifiers,
            timestamp: 0, windowNumber: 0, context: nil,
            characters: "", charactersIgnoringModifiers: "",
            isARepeat: false, keyCode: keyCode
        )!
    }

    func testCmdRIsHandledOnlyWithAVisibleArbolWindow() {
        let commandR = keyEvent(keyCode: UInt16(kVK_ANSI_R))

        XCTAssertTrue(RepoArtifactsHotkeyController.shouldHandle(event: commandR, hasVisibleWindow: true))
        XCTAssertFalse(RepoArtifactsHotkeyController.shouldHandle(event: commandR, hasVisibleWindow: false))
    }

    func testCmdRRequiresExactCommandModifierAndRKey() {
        XCTAssertFalse(RepoArtifactsHotkeyController.shouldHandle(
            event: keyEvent(keyCode: UInt16(kVK_ANSI_R), modifiers: [.command, .shift]),
            hasVisibleWindow: true
        ))
        XCTAssertFalse(RepoArtifactsHotkeyController.shouldHandle(
            event: keyEvent(keyCode: UInt16(kVK_ANSI_G)),
            hasVisibleWindow: true
        ))
    }
}
