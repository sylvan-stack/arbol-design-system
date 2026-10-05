import Foundation

/// A typed click target carried by a Comunicado delivery.
///
/// The descriptor deliberately reuses Arbol's existing navigation boundaries:
/// another Arbol UI receives the same query as `app.open`, while external/local
/// links pass through the validated `link.open` path. The JSON representation is
/// retained for backward compatibility with older native notification deliveries.
enum ComunicadoDescriptor {
    case app(ui: String, query: [String: Any])
    case link(kind: String, target: String)

    private static let notificationUserInfoKey = "arbol.comunicado.descriptor"

    init(dictionary: [String: Any]) throws {
        guard let type = dictionary["type"] as? String else {
            throw ComunicadoContractError("descriptor.type is required")
        }
        switch type {
        case "app":
            guard let ui = dictionary["ui"] as? String, UI_SPECS[ui] != nil else {
                throw ComunicadoContractError("descriptor.ui must name an Arbol UI")
            }
            let query = dictionary["query"] as? [String: Any] ?? [:]
            guard JSONSerialization.isValidJSONObject(query) else {
                throw ComunicadoContractError("descriptor.query must be JSON-compatible")
            }
            self = .app(ui: ui, query: query)
        case "link":
            guard let kind = dictionary["kind"] as? String, kind == "http" || kind == "file" else {
                throw ComunicadoContractError("descriptor.kind must be http or file")
            }
            guard let target = dictionary["target"] as? String,
                  !target.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
                throw ComunicadoContractError("descriptor.target is required")
            }
            self = .link(kind: kind, target: target)
        default:
            throw ComunicadoContractError("descriptor.type must be app or link")
        }
    }

    var dictionary: [String: Any] {
        switch self {
        case let .app(ui, query):
            return ["type": "app", "ui": ui, "query": query]
        case let .link(kind, target):
            return ["type": "link", "kind": kind, "target": target]
        }
    }

    var notificationJSON: String? {
        guard JSONSerialization.isValidJSONObject(dictionary),
              let data = try? JSONSerialization.data(withJSONObject: dictionary) else { return nil }
        return String(data: data, encoding: .utf8)
    }

    var notificationUserInfo: [AnyHashable: Any] {
        notificationJSON.map { [Self.notificationUserInfoKey: $0] } ?? [:]
    }

    static func fromNotificationUserInfo(_ userInfo: [AnyHashable: Any]) -> ComunicadoDescriptor? {
        guard let json = userInfo[notificationUserInfoKey] as? String,
              let data = json.data(using: .utf8),
              let dictionary = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            return nil
        }
        return try? ComunicadoDescriptor(dictionary: dictionary)
    }

    @MainActor
    func redirect() async -> [String: Any] {
        switch self {
        case let .app(ui, query):
            return await ContentView.Coordinator.openApp(ui: ui, query: query)
        case let .link(kind, target):
            return await ContentView.Coordinator.openLink(kind: kind, target: target)
        }
    }
}

struct NotificationComunicado {
    let id: String
    let title: String
    let content: String
    let descriptor: ComunicadoDescriptor
    /// Legacy input retained for bridge compatibility; playback uses system volume.
    let soundVolume: Double
}

/// The complete implementation of the first Comunicado Species. It owns the
/// instance contract; Willo's Comunicado Feed supplies its sole Presentation.
enum NotificationComunicadoSpecies {
    static let identifier = "notification"
    static let defaultSoundVolume = 1.0
    /// Notification Comunicados are transient: if the user does not activate or
    /// dismiss one explicitly, its active Presentation ends after one minute.
    static let activeTimeout: TimeInterval = 60

    static func instantiate(from params: [String: Any]) throws -> NotificationComunicado {
        guard let rawTitle = params["title"] as? String else {
            throw ComunicadoContractError("title is required")
        }
        let title = rawTitle.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !title.isEmpty else { throw ComunicadoContractError("title must not be empty") }
        guard let content = params["content"] as? String else {
            throw ComunicadoContractError("content is required")
        }
        guard let descriptorDictionary = params["descriptor"] as? [String: Any] else {
            throw ComunicadoContractError("descriptor is required")
        }
        let suppliedID = (params["id"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines)
        let soundVolume: Double
        if let rawVolume = params["soundVolume"] {
            guard let number = rawVolume as? NSNumber else {
                throw ComunicadoContractError("soundVolume must be a number between 0 and 1")
            }
            soundVolume = min(1, max(0, number.doubleValue))
        } else {
            soundVolume = defaultSoundVolume
        }
        return NotificationComunicado(
            id: suppliedID.flatMap { $0.isEmpty ? nil : $0 } ?? UUID().uuidString,
            title: title,
            content: content,
            descriptor: try ComunicadoDescriptor(dictionary: descriptorDictionary),
            soundVolume: soundVolume
        )
    }
}

/// Priority Notification Comunicados share the Notification instance contract
/// and Feed presentation, but have an independent Species identifier and user
/// preference. They remain visible when ordinary Notifications are disabled.
enum PriorityNotificationComunicadoSpecies {
    static let identifier = "priority-notification"
    static let activeTimeout = NotificationComunicadoSpecies.activeTimeout

    static func instantiate(from params: [String: Any]) throws -> NotificationComunicado {
        try NotificationComunicadoSpecies.instantiate(from: params)
    }
}

struct ComunicadoContractError: LocalizedError {
    let message: String

    init(_ message: String) { self.message = message }

    var errorDescription: String? { message }
}

/// The generic diagnostic Comunicado receives a complete durable Signal. It
/// deliberately has no Signal-type-specific rendering policy: every payload is
/// shown as formatted JSON and can be handed to Elma as a Chat Note.
struct DebugComunicado {
    let signalID: String
    let signalType: String
    let formattedSignal: String

    static func instantiate(signal: [String: Any]) throws -> DebugComunicado {
        guard let id = signal["id"] as? String, !id.isEmpty else {
            throw ComunicadoContractError("Debug Comunicado Signal id is required")
        }
        guard let type = signal["type"] as? String, !type.isEmpty else {
            throw ComunicadoContractError("Debug Comunicado Signal type is required")
        }
        guard JSONSerialization.isValidJSONObject(signal) else {
            throw ComunicadoContractError("Debug Comunicado Signal must be JSON-compatible")
        }
        let encoded = try JSONSerialization.data(
            withJSONObject: signal,
            options: [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes]
        )
        guard let formatted = String(data: encoded, encoding: .utf8) else {
            throw ComunicadoContractError("Debug Comunicado Signal could not be formatted")
        }
        return DebugComunicado(signalID: id, signalType: type, formattedSignal: formatted)
    }
}

/// Durable rebuild result, emitted only after the lifecycle finishes.
struct BuildResultComunicado: Decodable {
    let runId: String
    let status: Int
    let finishedAt: TimeInterval
    let logPath: String?

    var succeeded: Bool { status == 0 }
    var species: String { succeeded ? "build-success" : "build-failure" }
    var title: String { succeeded ? "Arbol build succeeded" : "Arbol build failed" }
    var content: String {
        succeeded ? "Rebuild completed successfully." : "Rebuild failed (exit \(status)). Open the build log for details."
    }
    var soundName: String { succeeded ? "Glass" : "Basso" }
    var descriptor: ComunicadoDescriptor? {
        guard let logPath, !logPath.isEmpty else { return nil }
        return .link(kind: "file", target: logPath)
    }
}
