import XCTest
@testable import BetVerseCore
private final class MemoryVault: Vault, @unchecked Sendable {
    var values: [String: Data] = [:]
    func read(_ key: String) -> Data? { values[key] }
    func write(_ key: String, _ data: Data?) throws { values[key] = data }
}
private actor MockTransport: Transport {
    var count = 0
    func send(_ request: URLRequest) async throws -> (Data, HTTPURLResponse) {
        count += 1
        XCTAssertEqual(request.url?.host, "betverse.example")
        XCTAssertEqual(request.value(forHTTPHeaderField: "Origin"), "https://betverse.example")
        if request.url?.path == "/api/failure" { throw URLError(.timedOut) }
        return (Data("{\"csrfToken\":\"csrf-test\"}".utf8), HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!)
    }
}
final class CoreTests: XCTestCase {
    func testOriginAndTraversal() async throws {
        XCTAssertThrowsError(try API(origin: "http://example.com", vault: MemoryVault()))
        XCTAssertThrowsError(try API(origin: "https://example.com/", vault: MemoryVault()))
        let transport = MockTransport(), api = try API(origin: "https://betverse.example", vault: MemoryVault(), transport: transport)
        do { _ = try await api.request("/api/../external"); XCTFail() } catch APIError.invalidPath {} catch { XCTFail() }
        let calls = await transport.count; XCTAssertEqual(calls, 0)
    }
    func testNoRetryAfterTimeout() async throws {
        let transport = MockTransport(), api = try API(origin: "https://betverse.example", vault: MemoryVault(), transport: transport)
        do { _ = try await api.request("/api/failure", method: "POST", body: Data("{}".utf8)); XCTFail() } catch APIError.transport {} catch { XCTFail() }
        let calls = await transport.count; XCTAssertEqual(calls, 1)
    }
    func testCouponSingleRoundingAndToggle() {
        let a = Selection(matchId: "a", match: "A", betType: "HOME", odds: Decimal(string: "1.91")!)
        let b = Selection(matchId: "b", match: "B", betType: "DRAW", odds: Decimal(string: "3.85")!)
        XCTAssertEqual(Coupon.odds([a,b]), Decimal(string: "7.35"))
        XCTAssertEqual(Coupon.payout(stake: 100, rows: [a,b]), Decimal(735))
        XCTAssertEqual(Coupon.toggled([a,b], a), [b])
        XCTAssertEqual(Coupon.toggled([a], Selection(matchId: "a", match: "A", betType: "AWAY", odds: 2)).count, 1)
    }
}
