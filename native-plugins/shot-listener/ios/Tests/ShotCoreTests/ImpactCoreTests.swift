// The website's tests of the detector (src/lib/impact.test.ts), the same sounds – the app must hear what the website hears.
import XCTest
@testable import ShotCore

private let RATE = 48000.0
private let N = 1024
private let blockMs = Double(N) / RATE * 1000

private var seed: Double = 1
private func rnd() -> Double {
    seed = (seed * 16807).truncatingRemainder(dividingBy: 2147483647)
    return seed / 2147483647 * 2 - 1
}
private func noise(_ a: Double) -> [Float] { (0..<N).map { _ in Float(rnd() * a) } }
/// a bright crack: high-frequency burst that dies away inside the block
private func crack(_ a: Double) -> [Float] { (0..<N).map { k in Float((k % 2 == 1 ? 1.0 : -1.0) * a * exp(-Double(k) / 120) + rnd() * 0.005) } }
private func tone(_ a: Double, _ hz: Double, _ from: Int) -> [Float] {
    (0..<N).map { k in Float(a * sin(2 * Double.pi * hz * Double(from * N + k) / RATE)) }
}
private func quiet(_ n: Int) -> [[Float]] { (0..<n).map { _ in noise(0.01) } }

private func run(_ blocks: [[Float]]) -> Int {
    let core = ImpactCore()
    var hits = 0
    for (k, b) in blocks.enumerated() where core.feed(b, now: Double(k) * blockMs) != nil { hits += 1 }
    return hits
}

final class ImpactCoreTests: XCTestCase {
    override func setUp() { seed = 1 }

    func testHearsTheCrackOfAStrike() {
        XCTAssertEqual(run(quiet(50) + [crack(0.7)] + quiet(20)), 1)
    }

    func testHearsACrackThatStartsAtTheEndOfABlock() {
        let start: [Float] = (0..<N).map { k in
            k > N - 40 ? Float((k % 2 == 1 ? 1.0 : -1.0) * 0.7 * exp(-Double(k - (N - 40)) / 120)) : Float(rnd() * 0.01)
        }
        let rest: [Float] = (0..<N).map { k in Float((k % 2 == 1 ? 1.0 : -1.0) * 0.7 * exp(-Double(k + 40) / 120) + rnd() * 0.005) }
        XCTAssertEqual(run(quiet(50) + [start, rest] + quiet(20)), 1)
    }

    func testStaysQuietInTheBackground() {
        XCTAssertEqual(run(quiet(200)), 0)
    }

    func testAVoiceOrALastingSoundIsNoStrike() {
        XCTAssertEqual(run(quiet(50) + (0..<30).map { tone(0.5, 220, $0) } + quiet(20)), 0)
    }

    func testASuddenVoiceStoppingASecondLaterIsNoStrike() {
        XCTAssertEqual(run(quiet(50) + (0..<47).map { tone(0.35, 180, $0) } + quiet(20)), 0)
    }

    func testOneStrikeNotItsEcho() {
        XCTAssertEqual(run(quiet(50) + [crack(0.7)] + quiet(5) + [crack(0.5)] + quiet(20)), 1)
    }

    func testTwoShotsAFewSecondsApartAreTwo() {
        XCTAssertEqual(run(quiet(50) + [crack(0.7)] + quiet(150) + [crack(0.7)] + quiet(20)), 2)
    }

    func testAVoiceBetweenTwoShotsAlsoInBigBlocks() {
        let blocks = quiet(140) + [crack(0.7)] + quiet(94) + (0..<47).map { tone(0.35, 180, $0) } + quiet(94) + [crack(0.7)] + quiet(40)
        XCTAssertEqual(run(blocks), 2)
        for per in [2, 4] {
            let core = ImpactCore()
            var hits = 0
            var k = 0
            while k + per <= blocks.count {
                let big = (0..<per).flatMap { blocks[k + $0] }
                if core.feed(big, now: Double(k) * blockMs) != nil { hits += 1 }
                k += per
            }
            XCTAssertEqual(hits, 2, "blocks of \(N * per)")
        }
    }
}
