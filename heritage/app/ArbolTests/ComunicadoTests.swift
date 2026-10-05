import XCTest
@testable import Arbol

final class ComunicadoTests: XCTestCase {
    func testBuildResultsHaveDistinctSpeciesSoundsAndLogTargets() throws {
        for status in [0, 1, 75] {
            let data = try JSONSerialization.data(withJSONObject: [
                "runId": "build-42", "status": status,
                "finishedAt": 1234, "logPath": "/tmp/build.log",
            ])
            let result = try JSONDecoder().decode(BuildResultComunicado.self, from: data)
            XCTAssertEqual(result.species, status == 0 ? "build-success" : "build-failure")
            XCTAssertEqual(result.soundName, status == 0 ? "Glass" : "Basso")
            guard case let .link(kind, target) = result.descriptor else {
                return XCTFail("Expected build log link")
            }
            XCTAssertEqual(kind, "file")
            XCTAssertEqual(target, "/tmp/build.log")
        }
    }

    func testNotificationSpeciesInstantiatesAppDescriptor() throws {
        let comunicado = try NotificationComunicadoSpecies.instantiate(from: [
            "id": "turn-finished-42",
            "title": "Agent finished",
            "content": "The requested work is ready.",
            "soundVolume": 0.35,
            "descriptor": [
                "type": "app",
                "ui": "elma",
                "query": ["session_id": "session-42"],
            ],
        ])

        XCTAssertEqual(comunicado.id, "turn-finished-42")
        XCTAssertEqual(comunicado.title, "Agent finished")
        XCTAssertEqual(comunicado.content, "The requested work is ready.")
        XCTAssertEqual(comunicado.soundVolume, 0.35)
        guard case let .app(ui, query) = comunicado.descriptor else {
            return XCTFail("Expected app descriptor")
        }
        XCTAssertEqual(ui, "elma")
        XCTAssertEqual(query["session_id"] as? String, "session-42")
    }

    func testDescriptorSurvivesNotificationUserInfoRoundTrip() throws {
        let original = try ComunicadoDescriptor(dictionary: [
            "type": "link",
            "kind": "http",
            "target": "https://example.test/work/42",
        ])
        let decoded = try XCTUnwrap(
            ComunicadoDescriptor.fromNotificationUserInfo(original.notificationUserInfo)
        )

        guard case let .link(kind, target) = decoded else {
            return XCTFail("Expected link descriptor")
        }
        XCTAssertEqual(kind, "http")
        XCTAssertEqual(target, "https://example.test/work/42")
    }

    func testNotificationSpeciesDefaultsAndClampsSoundVolume() throws {
        let base: [String: Any] = [
            "title": "Agent finished",
            "content": "Ready",
            "descriptor": ["type": "app", "ui": "willo"],
        ]
        XCTAssertEqual(try NotificationComunicadoSpecies.instantiate(from: base).soundVolume, 1.0)

        var tooLoud = base
        tooLoud["soundVolume"] = 7
        XCTAssertEqual(try NotificationComunicadoSpecies.instantiate(from: tooLoud).soundVolume, 1.0)

        var muted = base
        muted["soundVolume"] = -1
        XCTAssertEqual(try NotificationComunicadoSpecies.instantiate(from: muted).soundVolume, 0.0)
    }

    func testNotificationSpeciesRejectsNonNumericSoundVolume() {
        XCTAssertThrowsError(try NotificationComunicadoSpecies.instantiate(from: [
            "title": "Agent finished",
            "content": "Ready",
            "soundVolume": "loud",
            "descriptor": ["type": "app", "ui": "willo"],
        ])) { error in
            XCTAssertEqual(error.localizedDescription, "soundVolume must be a number between 0 and 1")
        }
    }

    func testNotificationSpeciesRejectsUnknownDescriptor() {
        XCTAssertThrowsError(try NotificationComunicadoSpecies.instantiate(from: [
            "title": "Agent finished",
            "content": "Ready",
            "descriptor": ["type": "command", "method": "unsafe.run"],
        ])) { error in
            XCTAssertEqual(error.localizedDescription, "descriptor.type must be app or link")
        }
    }

    func testNotificationSpeciesActiveTimeoutIsOneMinute() {
        XCTAssertEqual(NotificationComunicadoSpecies.activeTimeout, 60)
    }
}

extension ComunicadoTests {
    func testDebugSpeciesFormatsCompleteSignalIncludingData() throws {
        let comunicado = try DebugComunicado.instantiate(signal: [
            "id": "signal-42",
            "type": "parser.gitlab.output",
            "source": "email-parser",
            "seq": 42,
            "data": [
                "type": "merge_request_approved",
                "isValid": true,
                "raw_body": "Raw email body",
            ],
        ])

        XCTAssertEqual(comunicado.signalID, "signal-42")
        XCTAssertEqual(comunicado.signalType, "parser.gitlab.output")
        XCTAssertTrue(comunicado.formattedSignal.contains("\"source\" : \"email-parser\""))
        XCTAssertTrue(comunicado.formattedSignal.contains("\"isValid\" : true"))
        XCTAssertTrue(comunicado.formattedSignal.contains("\"raw_body\" : \"Raw email body\""))
    }

    @MainActor
    func testDebugPresentationPersistsWhenWilloIsInactive() {
        let behavior = DebugComunicadoController.panelCollectionBehavior
        XCTAssertTrue(behavior.contains(.canJoinAllSpaces))
        XCTAssertTrue(behavior.contains(.fullScreenAuxiliary))
        XCTAssertFalse(behavior.contains(.transient))
    }

    @MainActor
    func testComunicadoFeedKeepsNewestUniqueItemsWithinBound() {
        let defaults = UserDefaults.standard
        let originalEnabled = defaults.object(forKey: ComunicadoFeedController.enabledDefaultsKey)
        defer {
            if let originalEnabled {
                defaults.set(originalEnabled, forKey: ComunicadoFeedController.enabledDefaultsKey)
            } else {
                defaults.removeObject(forKey: ComunicadoFeedController.enabledDefaultsKey)
            }
        }
        defaults.set(false, forKey: ComunicadoFeedController.enabledDefaultsKey)
        let controller = ComunicadoFeedController()
        let now = Date()
        controller.append(ComunicadoFeedItem(
            id: "same", species: "Notification Comunicado", title: "Old", content: "Old", emittedAt: now
        ))
        controller.append(ComunicadoFeedItem(
            id: "same", species: "Notification Comunicado", title: "New", content: "New", emittedAt: now
        ))
        for index in 0...ComunicadoFeedController.maximumItemCount {
            controller.append(ComunicadoFeedItem(
                id: "item-\(index)", species: "Debug Comunicado", title: "Item \(index)",
                content: "Payload", emittedAt: now
            ))
        }

        XCTAssertEqual(controller.items.count, ComunicadoFeedController.maximumItemCount)
        XCTAssertEqual(controller.items.first?.id, "item-\(ComunicadoFeedController.maximumItemCount)")
        XCTAssertFalse(controller.items.contains(where: { $0.title == "Old" }))
    }

    @MainActor
    func testComunicadoFeedCountsOnlyActiveItemsAndUsesDismissedState() {
        let defaults = UserDefaults.standard
        let originalEnabled = defaults.object(forKey: ComunicadoFeedController.enabledDefaultsKey)
        defer {
            if let originalEnabled {
                defaults.set(originalEnabled, forKey: ComunicadoFeedController.enabledDefaultsKey)
            } else {
                defaults.removeObject(forKey: ComunicadoFeedController.enabledDefaultsKey)
            }
        }
        defaults.set(false, forKey: ComunicadoFeedController.enabledDefaultsKey)
        let controller = ComunicadoFeedController()
        let now = Date()
        controller.append(ComunicadoFeedItem(
            id: "active", species: "Notification Comunicado", title: "Active", content: "Payload", emittedAt: now
        ))
        controller.append(ComunicadoFeedItem(
            id: "finished", species: "Notification Comunicado", title: "Finished", content: "Payload",
            emittedAt: now, state: .dismissed
        ))

        XCTAssertEqual(controller.items.count, 2)
        XCTAssertEqual(controller.activeItems.map(\.id), ["active"])
        XCTAssertEqual(controller.state["count"] as? Int, 1)
        XCTAssertEqual(controller.state["activeCount"] as? Int, 1)
        XCTAssertEqual(controller.items.first(where: { $0.id == "finished" })?.state, .dismissed)

        controller.setState(.dismissed, forID: "active")

        XCTAssertTrue(controller.activeItems.isEmpty)
        XCTAssertEqual(controller.state["count"] as? Int, 0)
        XCTAssertEqual(controller.state["visible"] as? Bool, false)
    }

    @MainActor
    func testClearingComunicadoFeedDismissesAllItemsWithoutDisablingFeedOnTop() {
        let defaults = UserDefaults.standard
        let originalEnabled = defaults.object(forKey: ComunicadoFeedController.enabledDefaultsKey)
        defer {
            if let originalEnabled {
                defaults.set(originalEnabled, forKey: ComunicadoFeedController.enabledDefaultsKey)
            } else {
                defaults.removeObject(forKey: ComunicadoFeedController.enabledDefaultsKey)
            }
        }
        defaults.set(false, forKey: ComunicadoFeedController.enabledDefaultsKey)
        let controller = ComunicadoFeedController()
        controller.append(ComunicadoFeedItem(
            id: "first", species: "Notification Comunicado", title: "First",
            content: "Payload", emittedAt: Date()
        ))
        controller.append(ComunicadoFeedItem(
            id: "second", species: "Debug Comunicado", title: "Second",
            content: "Payload", emittedAt: Date()
        ))
        defaults.set(true, forKey: ComunicadoFeedController.enabledDefaultsKey)

        controller.dismissAllItems()

        XCTAssertTrue(controller.isEnabled)
        XCTAssertEqual(controller.activeCount, 0)
        XCTAssertTrue(controller.activeItems.isEmpty)
        XCTAssertTrue(controller.items.allSatisfy { $0.state == .dismissed })
        XCTAssertEqual(controller.state["enabled"] as? Bool, true)
        XCTAssertEqual(controller.state["visible"] as? Bool, false)
    }

    @MainActor
    func testClickActivationRemovesComunicadoFromActiveFeed() {
        let defaults = UserDefaults.standard
        let originalEnabled = defaults.object(forKey: ComunicadoFeedController.enabledDefaultsKey)
        defer {
            if let originalEnabled {
                defaults.set(originalEnabled, forKey: ComunicadoFeedController.enabledDefaultsKey)
            } else {
                defaults.removeObject(forKey: ComunicadoFeedController.enabledDefaultsKey)
            }
        }
        defaults.set(false, forKey: ComunicadoFeedController.enabledDefaultsKey)
        let controller = ComunicadoFeedController()
        controller.append(ComunicadoFeedItem(
            id: "click-me", species: "Notification Comunicado", title: "Ready",
            content: "Payload", emittedAt: Date()
        ))

        controller.activateItem(withID: "click-me")

        XCTAssertEqual(controller.items.first?.state, .dismissed)
        XCTAssertEqual(controller.activeCount, 0)
        XCTAssertTrue(controller.activeItems.isEmpty)
    }

    @MainActor
    func testComunicadoFeedAutomaticallyDismissesAfterSpeciesLifetime() async throws {
        let defaults = UserDefaults.standard
        let originalEnabled = defaults.object(forKey: ComunicadoFeedController.enabledDefaultsKey)
        defer {
            if let originalEnabled {
                defaults.set(originalEnabled, forKey: ComunicadoFeedController.enabledDefaultsKey)
            } else {
                defaults.removeObject(forKey: ComunicadoFeedController.enabledDefaultsKey)
            }
        }
        defaults.set(false, forKey: ComunicadoFeedController.enabledDefaultsKey)
        let controller = ComunicadoFeedController()
        controller.append(
            ComunicadoFeedItem(
                id: "expires", species: "Notification Comunicado", title: "Ready",
                content: "Payload", emittedAt: Date()
            ),
            activeFor: 0.02
        )

        XCTAssertEqual(controller.activeCount, 1)
        try await Task.sleep(nanoseconds: 80_000_000)

        XCTAssertEqual(controller.items.first?.state, .dismissed)
        XCTAssertEqual(controller.activeCount, 0)
        XCTAssertEqual(controller.state["visible"] as? Bool, false)
    }

    @MainActor
    func testComunicadoFeedRedeliveryReactivatesStableInstance() {
        let defaults = UserDefaults.standard
        let originalEnabled = defaults.object(forKey: ComunicadoFeedController.enabledDefaultsKey)
        defer {
            if let originalEnabled {
                defaults.set(originalEnabled, forKey: ComunicadoFeedController.enabledDefaultsKey)
            } else {
                defaults.removeObject(forKey: ComunicadoFeedController.enabledDefaultsKey)
            }
        }
        defaults.set(false, forKey: ComunicadoFeedController.enabledDefaultsKey)
        let controller = ComunicadoFeedController()
        let now = Date()
        controller.append(ComunicadoFeedItem(
            id: "same", species: "Notification Comunicado", title: "First", content: "Payload", emittedAt: now
        ))
        controller.setState(.dismissed, forID: "same")
        controller.append(ComunicadoFeedItem(
            id: "same", species: "Notification Comunicado", title: "Redelivered", content: "Payload", emittedAt: now
        ))

        XCTAssertEqual(controller.items.count, 1)
        XCTAssertEqual(controller.activeCount, 1)
        XCTAssertEqual(controller.items.first?.state, .active)
        XCTAssertEqual(controller.items.first?.title, "Redelivered")
    }

    @MainActor
    func testComunicadoFeedOrdersActiveItemsNewestFirst() {
        let defaults = UserDefaults.standard
        let originalEnabled = defaults.object(forKey: ComunicadoFeedController.enabledDefaultsKey)
        let originalDirection = defaults.object(forKey: ComunicadoFeedController.orderDirectionDefaultsKey)
        defer {
            if let originalEnabled {
                defaults.set(originalEnabled, forKey: ComunicadoFeedController.enabledDefaultsKey)
            } else {
                defaults.removeObject(forKey: ComunicadoFeedController.enabledDefaultsKey)
            }
            if let originalDirection {
                defaults.set(originalDirection, forKey: ComunicadoFeedController.orderDirectionDefaultsKey)
            } else {
                defaults.removeObject(forKey: ComunicadoFeedController.orderDirectionDefaultsKey)
            }
        }
        defaults.set(false, forKey: ComunicadoFeedController.enabledDefaultsKey)
        defaults.set(
            ComunicadoFeedOrderDirection.latestAtTop.rawValue,
            forKey: ComunicadoFeedController.orderDirectionDefaultsKey
        )
        let controller = ComunicadoFeedController()
        let now = Date()
        controller.append(ComunicadoFeedItem(
            id: "oldest", species: "Notification Comunicado", title: "Oldest", content: "Payload",
            emittedAt: now.addingTimeInterval(-20)
        ))
        controller.append(ComunicadoFeedItem(
            id: "newest", species: "Notification Comunicado", title: "Newest", content: "Payload",
            emittedAt: now
        ))
        controller.append(ComunicadoFeedItem(
            id: "middle", species: "Debug Comunicado", title: "Middle", content: "Payload",
            emittedAt: now.addingTimeInterval(-10)
        ))

        XCTAssertEqual(controller.activeItems.map(\.id), ["newest", "middle", "oldest"])
    }

    @MainActor
    func testComunicadoFeedCanPutLatestItemsAtBottomAndPersistsDirection() {
        let defaults = UserDefaults.standard
        let originalEnabled = defaults.object(forKey: ComunicadoFeedController.enabledDefaultsKey)
        let originalDirection = defaults.object(forKey: ComunicadoFeedController.orderDirectionDefaultsKey)
        defer {
            if let originalEnabled {
                defaults.set(originalEnabled, forKey: ComunicadoFeedController.enabledDefaultsKey)
            } else {
                defaults.removeObject(forKey: ComunicadoFeedController.enabledDefaultsKey)
            }
            if let originalDirection {
                defaults.set(originalDirection, forKey: ComunicadoFeedController.orderDirectionDefaultsKey)
            } else {
                defaults.removeObject(forKey: ComunicadoFeedController.orderDirectionDefaultsKey)
            }
        }
        defaults.set(false, forKey: ComunicadoFeedController.enabledDefaultsKey)
        defaults.removeObject(forKey: ComunicadoFeedController.orderDirectionDefaultsKey)
        let controller = ComunicadoFeedController()
        let now = Date()
        controller.append(ComunicadoFeedItem(
            id: "oldest", species: "Notification Comunicado", title: "Oldest", content: "Payload",
            emittedAt: now.addingTimeInterval(-20)
        ))
        controller.append(ComunicadoFeedItem(
            id: "newest", species: "Notification Comunicado", title: "Newest", content: "Payload",
            emittedAt: now
        ))
        controller.append(ComunicadoFeedItem(
            id: "middle", species: "Debug Comunicado", title: "Middle", content: "Payload",
            emittedAt: now.addingTimeInterval(-10)
        ))

        XCTAssertEqual(controller.orderDirection, .latestAtTop)
        XCTAssertEqual(controller.activeItems.map(\.id), ["newest", "middle", "oldest"])

        controller.setOrderDirection(.latestAtBottom)

        XCTAssertEqual(controller.orderDirection, .latestAtBottom)
        XCTAssertEqual(controller.activeItems.map(\.id), ["oldest", "middle", "newest"])
        XCTAssertEqual(controller.state["orderDirection"] as? String, "bottom")
        XCTAssertEqual(
            ComunicadoFeedController().orderDirection,
            .latestAtBottom,
            "The order direction should survive controller recreation"
        )
    }

    @MainActor
    func testEnabledComunicadoFeedStaysHiddenWhileEmpty() {
        let defaults = UserDefaults.standard
        let originalEnabled = defaults.object(forKey: ComunicadoFeedController.enabledDefaultsKey)
        defer {
            if let originalEnabled {
                defaults.set(originalEnabled, forKey: ComunicadoFeedController.enabledDefaultsKey)
            } else {
                defaults.removeObject(forKey: ComunicadoFeedController.enabledDefaultsKey)
            }
        }
        let controller = ComunicadoFeedController()
        controller.setEnabled(true)

        XCTAssertTrue(controller.isEnabled)
        XCTAssertEqual(controller.state["count"] as? Int, 0)
        XCTAssertEqual(controller.state["visible"] as? Bool, false)
    }

    @MainActor
    func testComunicadoFeedCloseStatePersists() {
        let defaults = UserDefaults.standard
        let originalEnabled = defaults.object(forKey: ComunicadoFeedController.enabledDefaultsKey)
        defer {
            if let originalEnabled {
                defaults.set(originalEnabled, forKey: ComunicadoFeedController.enabledDefaultsKey)
            } else {
                defaults.removeObject(forKey: ComunicadoFeedController.enabledDefaultsKey)
            }
        }
        let controller = ComunicadoFeedController()
        controller.setEnabled(false)
        XCTAssertFalse(controller.isEnabled)
        XCTAssertEqual(controller.state["enabled"] as? Bool, false)
    }

    func testDebugSpeciesRequiresSignalIdentityAndType() {
        XCTAssertThrowsError(try DebugComunicado.instantiate(signal: [
            "type": "parser.gitlab.output", "data": [:],
        ])) { error in
            XCTAssertEqual(error.localizedDescription, "Debug Comunicado Signal id is required")
        }
        XCTAssertThrowsError(try DebugComunicado.instantiate(signal: [
            "id": "signal-42", "data": [:],
        ])) { error in
            XCTAssertEqual(error.localizedDescription, "Debug Comunicado Signal type is required")
        }
    }
}
