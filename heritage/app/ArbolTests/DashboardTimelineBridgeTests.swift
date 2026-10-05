import XCTest
@testable import Arbol

@MainActor
final class DashboardTimelineBridgeTests: XCTestCase {
    private let generation = "6A072D5F-E5EF-438A-B528-B6AF4F739DBE"

    func testValidatesCompactSnapshotAndPreservesBytes() throws {
        let json = #"{"v":1,"tasks":[{"id":"F4F8323E-C699-464A-8B72-3DC4D2E5E22D","n":"Task","s":1,"u":"normal"}]}"#
        let submission = try DashboardTimelineBridge.validatedSubmission(params: [
            "generation": generation,
            "snapshotJSON": json,
            "taskCount": 1,
        ])

        XCTAssertEqual(submission.generation, generation)
        XCTAssertEqual(submission.snapshot, Data(json.utf8))
        XCTAssertEqual(submission.taskCount, 1)
    }

    func testAcceptsAuthoritativeEmptySnapshot() throws {
        let submission = try DashboardTimelineBridge.validatedSubmission(params: [
            "generation": generation,
            "snapshotJSON": #"{"v":1,"tasks":[]}"#,
            "taskCount": 0,
        ])
        XCTAssertEqual(submission.taskCount, 0)
    }

    func testRejectsMismatchedTaskCount() {
        XCTAssertThrowsError(try DashboardTimelineBridge.validatedSubmission(params: [
            "generation": generation,
            "snapshotJSON": #"{"v":1,"tasks":[]}"#,
            "taskCount": 1,
        ]))
    }

    func testRejectsOversizedSnapshot() {
        XCTAssertThrowsError(try DashboardTimelineBridge.validatedSubmission(params: [
            "generation": generation,
            "snapshotJSON": String(repeating: "x", count: DashboardTimelineBridge.maximumSnapshotBytes + 1),
            "taskCount": 0,
        ]))
    }

    func testSanitizesDashboardRejectionWithoutReflectingFreeFormText() {
        XCTAssertEqual(DashboardTimelineBridge.sanitizedRejectionCode("Invalid Schema: token=secret"), "invalidschematokensecret")
        XCTAssertEqual(DashboardTimelineBridge.sanitizedRejectionCode(nil), "rejected")
    }
}
