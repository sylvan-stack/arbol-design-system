import AppKit
import Carbon

/// Global “Hyper” shortcuts that open the four Arbol UIs from anywhere:
/// ⌘⌥⇧⌃S → Seqoya Lab, ⌘⌥⇧⌃O → Oaken, ⌘⌥⇧⌃W → Willo Station, ⌘⌥⇧⌃E → Elma Chat.
///
/// Each UI is its own app bundle, so “open” means activate the running instance
/// or launch the bundle — the same path the renderer's open-app bridge and Go
/// To Page use (`ContentView.Coordinator.openApp`), so single-instance handling
/// and LaunchServices quirks stay in one place. An empty query keeps this a pure
/// open: no pending-open payload is persisted for the target UI.
///
/// A process-wide singleton global hotkey host: every stamped Arbol UI process
/// tries to install it, but only the one holding this advisory lock registers
/// with Carbon. Losers retry periodically so the shortcuts survive if the
/// owning UI quits while another Arbol UI stays open. Like every in-app global
/// hotkey here, the shortcuts exist only while at least one Arbol UI is
/// running; cold-start launch from nothing stays with the external HyperKey
/// helper (~/repo/hyperkey), which maps the same Hyper stack to digits 1–4.
final class UISwitcherHotkeysController: NSObject {
    private static let signature = fourCharCode("UISW")
    private static let modifiers = UInt32(cmdKey | optionKey | shiftKey | controlKey)
    /// `id` is the dispatch key the Carbon callback receives — keep it in sync
    /// with `ui(for:)`.
    private static let bindings: [(id: UInt32, keyCode: UInt32, ui: String)] = [
        (1, UInt32(kVK_ANSI_S), "seqoya"),
        (2, UInt32(kVK_ANSI_O), "oaken"),
        (3, UInt32(kVK_ANSI_W), "willo"),
        (4, UInt32(kVK_ANSI_E), "elma"),
    ]

    private var eventHandlerRef: EventHandlerRef?
    private var hotKeyRefs: [UInt32: EventHotKeyRef] = [:]
    private var retryTimer: Timer?
    private var lockFD: Int32 = -1

    func installIfAvailable() {
        guard hotKeyRefs.isEmpty else { retryTimer?.invalidate(); retryTimer = nil; return }
        guard acquireLock() else { scheduleRetry(); return }
        registerHotkeys()
    }

    private func acquireLock() -> Bool {
        if lockFD >= 0 { return true }
        let dir = FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent("Library/Application Support/Arbol")
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        let fd = open(dir.appendingPathComponent("ui-switcher-hotkeys.lock").path, O_CREAT | O_RDWR, 0o644)
        guard fd >= 0 else { return true } // fail open: working shortcuts beat guaranteed-exclusive ones
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

    private func registerHotkeys() {
        NSLog("[ui-switcher] registerHotkeys: installing Carbon handler")
        var type = EventTypeSpec(eventClass: OSType(kEventClassKeyboard), eventKind: UInt32(kEventHotKeyPressed))
        let pointer = Unmanaged.passUnretained(self).toOpaque()
        let callback: EventHandlerUPP = { _, event, userData in
            guard let event, let userData else { return OSStatus(eventNotHandledErr) }
            var identifier = EventHotKeyID()
            let status = GetEventParameter(
                event, EventParamName(kEventParamDirectObject), EventParamType(typeEventHotKeyID),
                nil, MemoryLayout<EventHotKeyID>.size, nil, &identifier
            )
            guard status == noErr,
                  identifier.signature == UISwitcherHotkeysController.signature,
                  let ui = UISwitcherHotkeysController.ui(for: identifier.id) else {
                return OSStatus(eventNotHandledErr)
            }
            NSLog("[ui-switcher] hotkey fired → opening %@", ui)
            DispatchQueue.main.async {
                Task { @MainActor in
                    let result = await ContentView.Coordinator.openApp(ui: ui, query: [:])
                    NSLog("[ui-switcher] openApp(%@) → %@", ui, result as NSDictionary)
                }
            }
            return noErr
        }
        let installStatus = InstallEventHandler(GetApplicationEventTarget(), callback, 1, &type, pointer, &eventHandlerRef)
        guard installStatus == noErr else {
            NSLog("[ui-switcher] InstallEventHandler failed with status %d — releasing lock so another process can try", installStatus)
            // Release the lock before retrying: otherwise this process would hold
            // the singleton forever with no hotkeys registered (silent dead end).
            if lockFD >= 0 { close(lockFD); lockFD = -1 }
            scheduleRetry()
            return
        }
        // All-or-nothing: a partial set would leave the unregistered letters
        // silently dead. Tear the whole set down and retry from a clean slate.
        for binding in Self.bindings {
            let id = EventHotKeyID(signature: Self.signature, id: binding.id)
            var ref: EventHotKeyRef?
            let status = RegisterEventHotKey(binding.keyCode, Self.modifiers, id, GetApplicationEventTarget(), 0, &ref)
            guard status == noErr, let hotKeyRef = ref else {
                NSLog("[ui-switcher] RegisterEventHotKey failed for %@ (status %d)", binding.ui, status)
                teardownRegistrations()
                scheduleRetry()
                return
            }
            NSLog("[ui-switcher] registered hotkey for %@", binding.ui)
            hotKeyRefs[binding.id] = hotKeyRef
        }
        NSLog("[ui-switcher] all %d hotkeys registered (owner process live)", Self.bindings.count)
        retryTimer?.invalidate(); retryTimer = nil
    }

    private func teardownRegistrations() {
        for ref in hotKeyRefs.values { UnregisterEventHotKey(ref) }
        hotKeyRefs.removeAll()
        if let eventHandlerRef { RemoveEventHandler(eventHandlerRef); self.eventHandlerRef = nil }
        if lockFD >= 0 { close(lockFD); lockFD = -1 }
    }

    fileprivate static func ui(for id: UInt32) -> String? {
        bindings.first(where: { $0.id == id })?.ui
    }

    fileprivate static func fourCharCode(_ string: String) -> OSType {
        string.unicodeScalars.prefix(4).reduce(0) { ($0 << 8) + OSType($1.value) }
    }

    deinit {
        for ref in hotKeyRefs.values { UnregisterEventHotKey(ref) }
        if let eventHandlerRef { RemoveEventHandler(eventHandlerRef) }
        if lockFD >= 0 { close(lockFD) }
    }
}
