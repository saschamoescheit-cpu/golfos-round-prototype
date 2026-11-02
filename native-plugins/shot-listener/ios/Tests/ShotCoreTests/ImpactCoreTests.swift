// The website's tests of the detector (src/lib/impact.test.ts), the same sounds – the app must hear what the website hears.
// (Written plainly: the Swift compiler gives up on long chains of "+" and closures with ternaries – the first cloud
// build, 02.11.2026 – and "run" is XCTestCase's own method.)
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
/// +1 / −1 sample by sample: the brightest sound there is
private func alt(_ k: Int) -> Double { k % 2 == 1 ? 1.0 : -1.0 }
private func noise(_ a: Double) -> [Float] {
    var out = [Float](repeating: 0, count: N)
    for k in 0..<N { out[k] = Float(rnd() * a) }
    return out
}
/// a bright crack: high-frequency burst that dies away inside the block
private func crack(_ a: Double) -> [Float] {
    var out = [Float](repeating: 0, count: N)
    for k in 0..<N {
        let burst: Double = alt(k) * a * exp(-Double(k) / 120)
        out[k] = Float(burst + rnd() * 0.005)
    }
    return out
}
private func tone(_ a: Double, _ hz: Double, _ from: Int) -> [Float] {
    var out = [Float](repeating: 0, count: N)
    for k in 0..<N {
        let x: Double = 2 * Double.pi * hz * Double(from * N + k) / RATE
        out[k] = Float(a * sin(x))
    }
    return out
}
private func quiet(_ n: Int) -> [[Float]] {
    var out: [[Float]] = []
    for _ in 0..<n { out.append(noise(0.01)) }
    return out
}
private func voice(_ a: Double, _ hz: Double, _ n: Int) -> [[Float]] {
    var out: [[Float]] = []
    for k in 0..<n { out.append(tone(a, hz, k)) }
    return out
}
/// the parts one after another
private func sound(_ parts: [[Float]]...) -> [[Float]] {
    var out: [[Float]] = []
    for p in parts { out.append(contentsOf: p) }
    return out
}
/// the strikes the detector hears in the blocks
private func hitsIn(_ blocks: [[Float]]) -> Int {
    let core = ImpactCore()
    var hits = 0
    for k in 0..<blocks.count {
        if core.feed(blocks[k], now: Double(k) * blockMs) != nil { hits += 1 }
    }
    return hits
}

final class ImpactCoreTests: XCTestCase {
    override func setUp() { seed = 1 }

    func testHearsTheCrackOfAStrike() {
        XCTAssertEqual(hitsIn(sound(quiet(50), [crack(0.7)], quiet(20))), 1)
    }

    func testHearsACrackThatStartsAtTheEndOfABlock() {
        var start = [Float](repeating: 0, count: N)
        for k in 0..<N {
            if k > N - 40 {
                let v: Double = alt(k) * 0.7 * exp(-Double(k - (N - 40)) / 120)
                start[k] = Float(v)
            } else {
                start[k] = Float(rnd() * 0.01)
            }
        }
        var rest = [Float](repeating: 0, count: N)
        for k in 0..<N {
            let v: Double = alt(k) * 0.7 * exp(-Double(k + 40) / 120)
            rest[k] = Float(v + rnd() * 0.005)
        }
        XCTAssertEqual(hitsIn(sound(quiet(50), [start, rest], quiet(20))), 1)
    }

    func testStaysQuietInTheBackground() {
        XCTAssertEqual(hitsIn(quiet(200)), 0)
    }

    func testAVoiceOrALastingSoundIsNoStrike() {
        XCTAssertEqual(hitsIn(sound(quiet(50), voice(0.5, 220, 30), quiet(20))), 0)
    }

    func testASuddenVoiceStoppingASecondLaterIsNoStrike() {
        XCTAssertEqual(hitsIn(sound(quiet(50), voice(0.35, 180, 47), quiet(20))), 0)
    }

    func testOneStrikeNotItsEcho() {
        XCTAssertEqual(hitsIn(sound(quiet(50), [crack(0.7)], quiet(5), [crack(0.5)], quiet(20))), 1)
    }

    func testTwoShotsAFewSecondsApartAreTwo() {
        XCTAssertEqual(hitsIn(sound(quiet(50), [crack(0.7)], quiet(150), [crack(0.7)], quiet(20))), 2)
    }

    func testAVoiceBetweenTwoShotsAlsoInBigBlocks() {
        let blocks = sound(quiet(140), [crack(0.7)], quiet(94), voice(0.35, 180, 47), quiet(94), [crack(0.7)], quiet(40))
        XCTAssertEqual(hitsIn(blocks), 2)
        for per in [2, 4] {
            let core = ImpactCore()
            var hits = 0
            var k = 0
            while k + per <= blocks.count {
                var big: [Float] = []
                for j in 0..<per { big.append(contentsOf: blocks[k + j]) }
                if core.feed(big, now: Double(k) * blockMs) != nil { hits += 1 }
                k += per
            }
            XCTAssertEqual(hits, 2, "blocks of \(N * per)")
        }
    }
}
