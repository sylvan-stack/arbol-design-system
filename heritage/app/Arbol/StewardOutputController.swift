import AppKit

/// Willo-owned consumer for Steward presentation outputs. Core materialises the
/// file and emits a durable request; the native host performs the UI action.
@MainActor
final class StewardOutputController {
    private static let signalType = "steward.output.detached.ready"
    private static let checkpointKey = "arbol.steward-output.acknowledged-signal-seq"
    private let subscriptionID = "native-steward-outputs"
    private let launcher = DetachedArtifactViewLauncher()
    private var reconnectInstalled = false
    private var seen = Set<String>()

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
        subscribe(catchUp: true)
    }

    private func subscribe(catchUp: Bool) {
        var params: [String: Any] = ["types": [Self.signalType]]
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
                // CoreClient reconnect invokes subscribe again. The durable
                // Signal remains unacknowledged until Detached View is launched.
            }
        }
    }

    private func receive(_ envelope: [String: Any]) {
        guard (envelope["event"] as? String) == "signal",
              let signal = envelope["data"] as? [String: Any],
              let signalID = signal["id"] as? String,
              !signalID.isEmpty,
              let data = signal["data"] as? [String: Any],
              let path = data["path"] as? String,
              !path.isEmpty,
              FileManager.default.fileExists(atPath: path),
              seen.insert(signalID).inserted
        else { return }
        launcher.open(path: path, repoName: "Arbol", repoPath: nil, theme: nil)
        if let seq = Self.intValue(signal["seq"]) {
            let old = UserDefaults.standard.integer(forKey: Self.checkpointKey)
            UserDefaults.standard.set(max(old, seq), forKey: Self.checkpointKey)
        }
    }

    private static func intValue(_ value: Any?) -> Int? {
        if let value = value as? Int { return value }
        if let value = value as? NSNumber { return value.intValue }
        return nil
    }
}
