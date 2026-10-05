import AppKit
import Foundation

@MainActor
final class DashboardTimelineBridge {
    static let shared = DashboardTimelineBridge()

    static let dashboardBundleIdentifier = "com.arbol.dashboard.mac"
    static let submitNotification = Notification.Name("com.arbol.dashboard.mac.timeline.submit")
    static let readyNotification = Notification.Name("com.arbol.dashboard.mac.timeline.ready")
    static let acceptedNotification = Notification.Name("com.arbol.dashboard.mac.timeline.accepted")
    static let rejectedNotification = Notification.Name("com.arbol.dashboard.mac.timeline.rejected")

    static let maximumSnapshotBytes = 256 * 1024
    static let maximumTaskCount = 500

    struct Submission: Equatable {
        let generation: String
        let snapshot: Data
        let taskCount: Int
    }

    struct Environment {
        var locateApplication: () -> URL?
        var runningApplications: () -> [NSRunningApplication]
        var launchApplication: (URL, Bool, @escaping (Error?) -> Void) -> Void
        var post: (Notification.Name, [String: Any]) -> Void
        var observe: (Notification.Name, @escaping (Notification) -> Void) -> NSObjectProtocol
        var removeObserver: (NSObjectProtocol) -> Void
        var schedule: (TimeInterval, @escaping () -> Void) -> () -> Void

        static func live() -> Environment {
            let distributed = DistributedNotificationCenter.default()
            return Environment(
                locateApplication: {
                    if let override = ProcessInfo.processInfo.environment["ARBOL_DASHBOARD_APP_PATH"]?
                        .trimmingCharacters(in: .whitespacesAndNewlines), !override.isEmpty {
                        let url = URL(fileURLWithPath: override)
                        if FileManager.default.fileExists(atPath: url.path), url.pathExtension == "app" { return url }
                    }
                    return NSWorkspace.shared.urlForApplication(
                        withBundleIdentifier: "com.arbol.dashboard.mac"
                    )
                },
                runningApplications: {
                    NSRunningApplication.runningApplications(
                        withBundleIdentifier: "com.arbol.dashboard.mac"
                    )
                },
                launchApplication: { url, activate, completion in
                    let configuration = NSWorkspace.OpenConfiguration()
                    configuration.activates = activate
                    configuration.createsNewApplicationInstance = false
                    NSWorkspace.shared.openApplication(at: url, configuration: configuration) { _, error in
                        completion(error)
                    }
                },
                post: { name, userInfo in
                    distributed.postNotificationName(
                        name, object: nil, userInfo: userInfo, deliverImmediately: true
                    )
                },
                observe: { name, callback in
                    distributed.addObserver(forName: name, object: nil, queue: .main, using: callback)
                },
                removeObserver: { distributed.removeObserver($0) },
                schedule: { delay, action in
                    let work = DispatchWorkItem(block: action)
                    DispatchQueue.main.asyncAfter(deadline: .now() + delay, execute: work)
                    return { work.cancel() }
                }
            )
        }
    }

    private let environment: Environment
    private var observers: [NSObjectProtocol] = []
    private var retryCancellations: [() -> Void] = []
    private var pending: Submission?
    private var accepted: Submission?
    private var completions: [String: ([String: Any]) -> Void] = [:]
    private var rejectedGenerations = Set<String>()

    init(environment: Environment = .live()) {
        self.environment = environment
        observers = [
            environment.observe(Self.readyNotification) { [weak self] _ in
                Task { @MainActor in self?.dashboardDidBecomeReady() }
            },
            environment.observe(Self.acceptedNotification) { [weak self] note in
                Task { @MainActor in self?.dashboardAccepted(note) }
            },
            environment.observe(Self.rejectedNotification) { [weak self] note in
                Task { @MainActor in self?.dashboardRejected(note) }
            },
        ]
    }

    deinit {
        for observer in observers { environment.removeObserver(observer) }
        retryCancellations.forEach { $0() }
    }

    static func validatedSubmission(params: [String: Any]) throws -> Submission {
        guard let generation = params["generation"] as? String,
              UUID(uuidString: generation) != nil else {
            throw bridgeError("invalid_generation", "Dashboard submission generation is invalid.")
        }
        guard let snapshotJSON = params["snapshotJSON"] as? String,
              let snapshot = snapshotJSON.data(using: .utf8) else {
            throw bridgeError("invalid_utf8", "Dashboard snapshot is not valid UTF-8.")
        }
        guard snapshot.count <= maximumSnapshotBytes else {
            throw bridgeError("snapshot_too_large", "Dashboard snapshot is too large.")
        }
        guard let taskCount = exactInt(params["taskCount"]), (0...maximumTaskCount).contains(taskCount) else {
            throw bridgeError("invalid_task_count", "Dashboard task count is invalid.")
        }
        guard let value = try? JSONSerialization.jsonObject(with: snapshot),
              let object = value as? [String: Any],
              exactInt(object["v"]) == 1,
              let tasks = object["tasks"] as? [Any],
              tasks.count == taskCount else {
            throw bridgeError("invalid_snapshot", "Dashboard snapshot envelope is invalid.")
        }
        return Submission(generation: generation.uppercased(), snapshot: snapshot, taskCount: taskCount)
    }

    func submit(params: [String: Any]) async -> [String: Any] {
        let submission: Submission
        do {
            submission = try Self.validatedSubmission(params: params)
        } catch {
            return Self.failure(error)
        }

        let force = params["force"] as? Bool ?? false
        let launchIfNeeded = params["launchIfNeeded"] as? Bool ?? true
        let activate = params["activate"] as? Bool ?? false
        if !force, pending == nil, accepted?.snapshot == submission.snapshot {
            return ["ok": true, "status": "unchanged", "taskCount": submission.taskCount]
        }

        if let previous = pending, previous.generation != submission.generation {
            finish(previous.generation, with: [
                "ok": false, "status": "superseded", "error": "A newer Dashboard snapshot superseded this submission."
            ])
        }
        cancelRetries()
        pending = submission
        rejectedGenerations.remove(submission.generation)

        let locateResult = await ensureDashboardRunning(launchIfNeeded: launchIfNeeded, activate: activate)
        if let locateResult {
            if pending?.generation == submission.generation { pending = nil }
            return locateResult
        }

        post(submission)
        scheduleRetries(for: submission.generation)
        return await withCheckedContinuation { continuation in
            completions[submission.generation] = { result in continuation.resume(returning: result) }
            let cancel = environment.schedule(8.0) { [weak self] in
                Task { @MainActor in
                    guard let self, self.completions[submission.generation] != nil else { return }
                    self.finish(submission.generation, with: [
                        "ok": false,
                        "status": "timeout",
                        "error": "Arbol Dashboard did not confirm the local timeline handoff."
                    ])
                }
            }
            retryCancellations.append(cancel)
        }
    }

    static func openDashboard(activate: Bool) async -> [String: Any] {
        await shared.openDashboard(activate: activate)
    }

    func openDashboard(activate: Bool) async -> [String: Any] {
        if let failure = await ensureDashboardRunning(launchIfNeeded: true, activate: activate) {
            return failure
        }
        return ["ok": true]
    }

    private func ensureDashboardRunning(launchIfNeeded: Bool, activate: Bool) async -> [String: Any]? {
        if let running = environment.runningApplications().first {
            if activate {
                running.activate(options: [.activateAllWindows, .activateIgnoringOtherApps])
            }
            return nil
        }
        guard launchIfNeeded else {
            return ["ok": false, "status": "not_running", "error": "Arbol Dashboard is not running."]
        }
        guard let url = environment.locateApplication() else {
            return [
                "ok": false,
                "status": "not_installed",
                "error": "Arbol Dashboard is not installed or registered with Launch Services."
            ]
        }
        return await withCheckedContinuation { continuation in
            environment.launchApplication(url, activate) { error in
                Task { @MainActor in
                    if error != nil {
                        continuation.resume(returning: [
                            "ok": false,
                            "status": "launch_failed",
                            "error": "Arbol Dashboard could not be opened."
                        ])
                    } else {
                        continuation.resume(returning: nil)
                    }
                }
            }
        }
    }

    private func post(_ submission: Submission) {
        environment.post(Self.submitNotification, [
            "generation": submission.generation,
            "snapshot": submission.snapshot,
            "taskCount": submission.taskCount,
        ])
        NSLog(
            "Dashboard timeline submission posted generation=%@ tasks=%d bytes=%d",
            submission.generation, submission.taskCount, submission.snapshot.count
        )
    }

    private func scheduleRetries(for generation: String) {
        for delay in [0.25, 0.75, 1.5, 3.0] {
            let cancel = environment.schedule(delay) { [weak self] in
                Task { @MainActor in
                    guard let self, let pending = self.pending,
                          pending.generation == generation,
                          !self.rejectedGenerations.contains(generation) else { return }
                    self.post(pending)
                }
            }
            retryCancellations.append(cancel)
        }
    }

    private func cancelRetries() {
        retryCancellations.forEach { $0() }
        retryCancellations.removeAll()
    }

    private func dashboardDidBecomeReady() {
        if let pending, !rejectedGenerations.contains(pending.generation) {
            post(pending)
            return
        }
        guard let accepted else { return }
        let replay = Submission(
            generation: UUID().uuidString,
            snapshot: accepted.snapshot,
            taskCount: accepted.taskCount
        )
        pending = replay
        rejectedGenerations.remove(replay.generation)
        post(replay)
        scheduleRetries(for: replay.generation)
    }

    private func dashboardAccepted(_ note: Notification) {
        guard let generation = Self.normalizedGeneration(note.userInfo?["generation"]),
              let pending, pending.generation == generation else { return }
        accepted = pending
        self.pending = nil
        rejectedGenerations.remove(generation)
        cancelRetries()
        finish(generation, with: ["ok": true, "status": "accepted", "taskCount": pending.taskCount])
        NSLog("Dashboard timeline submission accepted generation=%@ tasks=%d", generation, pending.taskCount)
    }

    private func dashboardRejected(_ note: Notification) {
        guard let generation = Self.normalizedGeneration(note.userInfo?["generation"]),
              pending?.generation == generation else { return }
        rejectedGenerations.insert(generation)
        cancelRetries()
        let code = Self.sanitizedRejectionCode(note.userInfo?["error"])
        finish(generation, with: [
            "ok": false,
            "status": "rejected",
            "code": code,
            "error": "Arbol Dashboard rejected the timeline snapshot."
        ])
        NSLog("Dashboard timeline submission rejected generation=%@ code=%@", generation, code)
    }

    private func finish(_ generation: String, with result: [String: Any]) {
        let completion = completions.removeValue(forKey: generation)
        completion?(result)
    }

    private static func normalizedGeneration(_ value: Any?) -> String? {
        guard let string = value as? String, UUID(uuidString: string) != nil else { return nil }
        return string.uppercased()
    }

    static func sanitizedRejectionCode(_ value: Any?) -> String {
        guard let raw = value as? String else { return "rejected" }
        let sanitized = raw.lowercased().filter { $0.isASCII && ($0.isLetter || $0.isNumber || $0 == "_") }
        return sanitized.isEmpty ? "rejected" : String(sanitized.prefix(64))
    }

    private static func exactInt(_ value: Any?) -> Int? {
        if let int = value as? Int { return int }
        guard let number = value as? NSNumber else { return nil }
        let double = number.doubleValue
        guard double.rounded() == double, double >= Double(Int.min), double <= Double(Int.max) else { return nil }
        return Int(double)
    }

    private static func bridgeError(_ code: String, _ description: String) -> NSError {
        NSError(domain: "DashboardTimelineBridge", code: 1, userInfo: [
            NSLocalizedDescriptionKey: description,
            "code": code,
        ])
    }

    private static func failure(_ error: Error) -> [String: Any] {
        let nsError = error as NSError
        return [
            "ok": false,
            "status": "invalid",
            "code": nsError.userInfo["code"] as? String ?? "invalid_snapshot",
            "error": nsError.localizedDescription,
        ]
    }
}
