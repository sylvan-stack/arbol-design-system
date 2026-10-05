import SwiftUI

/// All windows are managed by AppDelegate/WindowManager (AppKit) so they can be
/// toggled by global hotkeys. The SwiftUI App therefore exposes no main
/// WindowGroup — only a Settings scene (no auto-window on launch).
@main
struct ArbolApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) var appDelegate
    var body: some Scene {
        Settings { EmptyView() }
    }
}
