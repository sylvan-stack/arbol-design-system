import Foundation
import Network

/// Persistent connection to arbol-core over a Unix socket, with multiplexed
/// RPC and stream subscriptions.
///
/// One connection per process. The read loop demultiplexes by `id` (responses)
/// and `sub_id` (events). On disconnect, pending continuations fail, active
/// subscriptions are notified, and a reconnect is scheduled with exponential
/// backoff.
actor CoreClient {
    static let shared = CoreClient()

    private let socketPath: String = {
        let home = FileManager.default.homeDirectoryForCurrentUser.path
        return "\(home)/Library/Application Support/Arbol/run/core.sock"
    }()

    enum CoreError: Error {
        case badResponse, remote(String), connection(String), notConnected
    }

    typealias EventHandler = @Sendable ([String: Any]) -> Void
    typealias DisconnectHandler = @Sendable () -> Void
    typealias ReconnectHandler = @Sendable () -> Void

    private var conn: NWConnection?
    private var pending: [String: CheckedContinuation<Any, Error>] = [:]
    private var subscriptions: [String: EventHandler] = [:]
    private var disconnectHandlers: [DisconnectHandler] = []
    private var reconnectHandlers: [ReconnectHandler] = []
    private var connected = false
    private var connecting = false
    private var reconnectAttempt = 0
    // Set on a drop, cleared once the socket comes back, so the reconnect
    // handlers fire only on a *re*connection — never on the initial connect.
    private var didDisconnect = false

    // MARK: - Public API

    func onDisconnect(_ handler: @escaping DisconnectHandler) {
        disconnectHandlers.append(handler)
    }

    // Fired when the socket reconnects after a drop. The renderer uses this to
    // resubscribe with `since_session_seq` (seq-based catch-up, event-sourcing.md
    // §12), replacing the old fixed-timer guesswork.
    func onReconnect(_ handler: @escaping ReconnectHandler) {
        reconnectHandlers.append(handler)
    }

    func call(method: String, params: [String: Any] = [:]) async throws -> [String: Any] {
        try await ensureConnected()
        let id = UUID().uuidString
        let body: [String: Any] = ["kind": "request", "id": id, "method": method, "params": params]
        let result: Any = try await withCheckedThrowingContinuation { (cont: CheckedContinuation<Any, Error>) in
            pending[id] = cont
            Task { [weak self] in
                do {
                    try await self?.sendEnvelope(body)
                } catch {
                    if let s = self {
                        await s.failPending(id, error: error)
                    }
                }
            }
        }
        return (result as? [String: Any]) ?? [:]
    }

    func subscribe(stream: String, subId: String, params: [String: Any], onEvent: @escaping EventHandler) async throws {
        try await ensureConnected()
        subscriptions[subId] = onEvent
        let body: [String: Any] = ["kind": "subscribe", "id": subId, "stream": stream, "params": params]
        try await sendEnvelope(body)
    }

    func unsubscribe(subId: String) async throws {
        subscriptions.removeValue(forKey: subId)
        guard connected else { return }
        try await sendEnvelope(["kind": "unsubscribe", "sub_id": subId])
    }

    // MARK: - Connection lifecycle

    private func ensureConnected() async throws {
        if connected { return }
        if connecting {
            while connecting { try await Task.sleep(nanoseconds: 50_000_000) }
            if connected { return }
            throw CoreError.notConnected
        }
        connecting = true
        defer { connecting = false }

        // core.sock is absent for ~20s while arbol-core restarts
        // (scripts/rebuild-and-restart.sh). Each connect attempt in that
        // window fails fast (see startConnection), so retry here until the
        // deadline instead of surfacing the failure: a call()/subscribe()
        // issued mid-restart becomes a delayed success rather than a failed
        // turn in the renderer. Waiters queued on `connecting` resolve the
        // same way.
        let deadline = DispatchTime.now() + .seconds(30)
        while true {
            do {
                let endpoint = NWEndpoint.unix(path: socketPath)
                let c = NWConnection(to: endpoint, using: .tcp)
                try await startConnection(c)
                conn = c
                connected = true
                reconnectAttempt = 0
                Task { [weak self] in await self?.readLoop() }
                // Notify on a *re*connection (subscriptions were dropped on the drop;
                // the renderer must resubscribe). Whoever wins the connect race —
                // scheduleReconnect or a renderer-triggered subscribe — fires this
                // exactly once, since the flag is cleared here.
                if didDisconnect {
                    didDisconnect = false
                    let handlers = reconnectHandlers
                    for h in handlers { h() }
                }
                return
            } catch {
                if DispatchTime.now() >= deadline { throw error }
                try await Task.sleep(nanoseconds: 500_000_000)
            }
        }
    }

    private func startConnection(_ c: NWConnection) async throws {
        let box = ResumeBox()
        try await withCheckedThrowingContinuation { (cont: CheckedContinuation<Void, Error>) in
            c.stateUpdateHandler = { [weak self] state in
                switch state {
                case .ready:
                    box.resumeOnce(cont, with: .success(()))
                case .failed(let err):
                    box.resumeOnce(cont, with: .failure(CoreError.connection("\(err)")))
                    Task { [weak self] in await self?.handleDisconnect() }
                case .cancelled:
                    box.resumeOnce(cont, with: .failure(CoreError.connection("cancelled")))
                    Task { [weak self] in await self?.handleDisconnect() }
                case .waiting(let err):
                    // core.sock is absent/refused — this is the ~20s window while
                    // arbol-core restarts. NWConnection parks in `.waiting` and will
                    // NOT promote to `.ready` on its own (it doesn't watch a unix
                    // path's reappearance), so if we ignored this the connect
                    // continuation would never resume: `ensureConnected` would hang
                    // with `connecting = true` latched and every later call()/
                    // subscribe() would block forever. Fail fast and cancel; the
                    // retry loop in `ensureConnected` (and, after a drop,
                    // scheduleReconnect) re-attempts until the socket is back,
                    // then reconnects + fires `__core_reconnect__`.
                    box.resumeOnce(cont, with: .failure(CoreError.connection("waiting: \(err)")))
                    c.cancel()
                default:
                    break
                }
            }
            c.start(queue: .global())
        }
    }

    private func handleDisconnect() {
        guard connected else { return }
        connected = false
        didDisconnect = true
        conn?.cancel()
        conn = nil
        // Fail pending RPCs.
        for (_, cont) in pending {
            cont.resume(throwing: CoreError.connection("disconnected"))
        }
        pending.removeAll()
        // Drop subscriptions; renderer is expected to resubscribe.
        let handlers = disconnectHandlers
        subscriptions.removeAll()
        for h in handlers { h() }
        Task { [weak self] in await self?.scheduleReconnect() }
    }

    private func scheduleReconnect() async {
        reconnectAttempt += 1
        let backoffMs = min(4000, 250 * (1 << min(reconnectAttempt, 4)))
        try? await Task.sleep(nanoseconds: UInt64(backoffMs) * 1_000_000)
        do {
            try await ensureConnected()
        } catch {
            await scheduleReconnect()
        }
    }

    private func failPending(_ id: String, error: Error) {
        if let cont = pending.removeValue(forKey: id) {
            cont.resume(throwing: error)
        }
    }

    // MARK: - Read / write

    private func sendEnvelope(_ obj: [String: Any]) async throws {
        guard let c = conn else { throw CoreError.notConnected }
        let data = try JSONSerialization.data(withJSONObject: obj)
        var header = withUnsafeBytes(of: UInt32(data.count).bigEndian) { Data($0) }
        header.append(data)
        try await sendData(c, header)
    }

    private func sendData(_ c: NWConnection, _ data: Data) async throws {
        let box = ResumeBox()
        try await withCheckedThrowingContinuation { (cont: CheckedContinuation<Void, Error>) in
            c.send(content: data, completion: .contentProcessed { err in
                if let err = err { box.resumeOnce(cont, with: .failure(CoreError.connection("\(err)"))) }
                else { box.resumeOnce(cont, with: .success(())) }
            })
        }
    }

    private func readLoop() async {
        while connected, let c = conn {
            do {
                let header = try await recv(c, 4)
                let len = header.withUnsafeBytes { raw -> UInt32 in raw.load(as: UInt32.self).bigEndian }
                let body = try await recv(c, Int(len))
                let obj = try JSONSerialization.jsonObject(with: body) as? [String: Any] ?? [:]
                dispatchIncoming(obj)
            } catch {
                handleDisconnect()
                return
            }
        }
    }

    private func dispatchIncoming(_ obj: [String: Any]) {
        let kind = obj["kind"] as? String ?? ""
        switch kind {
        case "response":
            guard let id = obj["id"] as? String, let cont = pending.removeValue(forKey: id) else { return }
            let ok = obj["ok"] as? Bool ?? false
            if ok {
                cont.resume(returning: obj["result"] ?? [String: Any]())
            } else {
                cont.resume(throwing: CoreError.remote((obj["error"] as? String) ?? "unknown"))
            }
        case "event":
            guard let subId = obj["sub_id"] as? String, let handler = subscriptions[subId] else { return }
            handler(obj)
        case "error":
            guard let subId = obj["sub_id"] as? String, let handler = subscriptions[subId] else { return }
            handler(obj)
            subscriptions.removeValue(forKey: subId)
        default:
            break
        }
    }

    private func recv(_ c: NWConnection, _ n: Int) async throws -> Data {
        let box = DataResumeBox()
        return try await withCheckedThrowingContinuation { (cont: CheckedContinuation<Data, Error>) in
            c.receive(minimumIncompleteLength: n, maximumLength: n) { data, _, _, err in
                if let err = err {
                    box.resumeOnce(cont, with: .failure(CoreError.connection("\(err)"))); return
                }
                guard let data = data, data.count == n else {
                    box.resumeOnce(cont, with: .failure(CoreError.badResponse)); return
                }
                box.resumeOnce(cont, with: .success(data))
            }
        }
    }
}

extension CoreClient.CoreError: LocalizedError {
    var errorDescription: String? {
        switch self {
        case .badResponse:
            return "Core returned an invalid response"
        case .remote(let message):
            return message
        case .connection(let message):
            return "Could not connect to Core: \(message)"
        case .notConnected:
            return "Core is not connected"
        }
    }
}

private final class ResumeBox: @unchecked Sendable {
    private var resumed = false
    private let lock = NSLock()
    func resumeOnce(_ cont: CheckedContinuation<Void, Error>, with result: Result<Void, Error>) {
        lock.lock(); defer { lock.unlock() }
        if resumed { return }
        resumed = true
        switch result {
        case .success: cont.resume()
        case .failure(let e): cont.resume(throwing: e)
        }
    }
}

private final class DataResumeBox: @unchecked Sendable {
    private var resumed = false
    private let lock = NSLock()
    func resumeOnce(_ cont: CheckedContinuation<Data, Error>, with result: Result<Data, Error>) {
        lock.lock(); defer { lock.unlock() }
        if resumed { return }
        resumed = true
        switch result {
        case .success(let d): cont.resume(returning: d)
        case .failure(let e): cont.resume(throwing: e)
        }
    }
}
