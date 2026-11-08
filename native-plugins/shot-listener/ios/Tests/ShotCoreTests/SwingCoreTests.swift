// The swing detector of the watch (SwingCore) on made-up wrists: a full swing, a chip, a putt, walking, a wave, a
// practice swing and the hit. (Written plainly – the Swift compiler gives up on long expressions.)
import XCTest
@testable import SwingCore

private let RATE = 200.0
private let ACC = 800.0
private let T0 = 1_762_600_000.0

/// the wrist's turn over time: calm, then a bell of `peak` rad/s lasting `len` s, then calm
private func bell(_ peak: Double, _ len: Double, at: Double) -> (Double) -> Double {
    return { t in
        let u = (t - at) / len
        if u < 0 || u > 1 { return 0.3 }
        let s = sin(Double.pi * u)
        return 0.3 + peak * s * s
    }
}

/// feeds `secs` seconds of rotation (all on the x axis) and acceleration (1 g, with `jolt` g at `joltAt`)
private func play(_ d: SwingCore, secs: Double, w: (Double) -> Double, joltAt: Double? = nil, jolt: Double = 0, accel: Bool = true) -> [Swing] {
    var out: [Swing] = []
    let n = Int(secs * ACC)
    for k in 0..<n {
        let t = T0 + Double(k) / ACC
        if accel {
            var z = 1.0
            if let j = joltAt, abs(t - (T0 + j)) < 0.5 / ACC { z = 1.0 + jolt }
            out.append(contentsOf: d.accel(t: t, x: 0, y: 0, z: z))
        }
        if k % 4 == 0 {
            out.append(contentsOf: d.motion(t: t, x: w(t - T0), y: 0, z: 0))
        }
    }
    out.append(contentsOf: d.flush())
    return out
}

final class SwingCoreTests: XCTestCase {
    func testFullSwingWithTheBall() {
        let s = play(SwingCore(), secs: 6, w: bell(25, 1.2, at: 2), joltAt: 2.6, jolt: 6)
        XCTAssertEqual(s.count, 1)
        XCTAssertTrue(s[0].full)
        XCTAssertTrue(s[0].hit)
        XCTAssertEqual(s[0].t, T0 + 2.6, accuracy: 0.05)
        XCTAssertGreaterThan(s[0].peak, 20)
    }

    func testPracticeSwingFeelsNoBall() {
        let s = play(SwingCore(), secs: 6, w: bell(22, 1.2, at: 2))
        XCTAssertEqual(s.count, 1)
        XCTAssertFalse(s[0].hit)
    }

    func testChip() {
        let s = play(SwingCore(), secs: 5, w: bell(8, 0.9, at: 1.5), joltAt: 1.95, jolt: 3)
        XCTAssertEqual(s.count, 1)
        XCTAssertFalse(s[0].full)
    }

    func testPuttIsLeftToTheScore() {
        let s = play(SwingCore(), secs: 5, w: bell(2.5, 1.0, at: 1.5), joltAt: 2.0, jolt: 1)
        XCTAssertEqual(s.count, 0)
    }

    func testWalkingIsNoSwing() {
        // the arm swinging while walking: up to 3.8 rad/s, twice a second, for a minute
        let s = play(SwingCore(), secs: 60, w: { t in abs(3.8 * sin(Double.pi * 2 * t)) }, accel: false)
        XCTAssertEqual(s.count, 0)
    }

    func testWavingIsNoSwing() {
        // fast for 5 s without a pause – no golf swing takes that long
        let s = play(SwingCore(), secs: 8, w: { t in (t > 1 && t < 6) ? 9 + 3 * sin(t * 20) : 0.3 }, accel: false)
        XCTAssertEqual(s.count, 0)
    }

    func testTwoSwingsAFewSecondsApart() {
        // practice swing, then the shot: both reported – the phone keeps one per spot
        let a = bell(20, 1.2, at: 1)
        let b = bell(24, 1.2, at: 6)
        let s = play(SwingCore(), secs: 10, w: { t in max(a(t), b(t)) }, joltAt: 6.6, jolt: 5)
        XCTAssertEqual(s.count, 2)
        XCTAssertFalse(s[0].hit)
        XCTAssertTrue(s[1].hit)
    }

    func testATooSoftTurnIsANearMissNotASwing() {
        let d = SwingCore()
        let s = play(d, secs: 5, w: bell(4, 0.9, at: 1.5), accel: false)
        XCTAssertEqual(s.count, 0)
        let near = d.takeNearMisses()
        XCTAssertEqual(near.count, 1)
        XCTAssertLessThan(near[0].peak, SwingParams.minPeak)
        XCTAssertEqual(d.takeNearMisses().count, 0)
    }

    func testWithoutAccelerationItStillDecides() {
        let s = play(SwingCore(), secs: 6, w: bell(25, 1.2, at: 2), accel: false)
        XCTAssertEqual(s.count, 1)
        XCTAssertEqual(s[0].jolt, 0)
    }
}
