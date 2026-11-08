// The swing on the wrist (Sascha 08.11.2026: "the shot detection by the Apple Watch – the phone often lies in the
// cart"). The watch app (ios/App/Watch) feeds the watch's motion – rotation of the wrist 200 times a second and its
// acceleration 800 times a second (CMBatchedSensorManager, watchOS 10, Series 8 and later) – and gets each swing once
// it is over: when, how fast the wrist turned, and how hard the hit was felt (the ball, not the air of a practice
// swing). Pure: tested without a watch (Tests/ShotCoreTests/SwingCoreTests.swift).
//
// A golf swing turns the wrist far faster than anything else on a round: walking 2–4 rad/s, a putt 1–3, a chip 5–10,
// a full swing 15–35. Putts are left to the score (score − putts), the watch counts chips, pitches and full swings.

import Foundation

public struct Swing: Equatable {
    /// the moment the wrist turned fastest – about the moment of the hit, s since 1970
    public let t: Double
    /// that fastest turn, rad/s
    public let peak: Double
    /// the hardest jolt around that moment (change of acceleration from one sample to the next, g) – a ball hit jolts
    /// the wrist, a practice swing through the air does not; 0 when the watch gave no acceleration
    public let jolt: Double
    /// how long the wrist turned fast, s
    public let duration: Double

    public init(t: Double, peak: Double, jolt: Double, duration: Double) {
        self.t = t
        self.peak = peak
        self.jolt = jolt
        self.duration = duration
    }

    /// a chip or pitch – or a full swing
    public var full: Bool { peak >= SwingParams.fullPeak }
    /// the ball felt (Sascha's swings will set the real line; until then only a hint for the phone)
    public var hit: Bool { jolt >= SwingParams.hitJolt }
}

public enum SwingParams {
    public static let start = 3.0 // rad/s – the wrist starts to turn fast
    public static let end = 2.0 // and is calm again below this
    public static let calmS = 0.25 // for this long
    public static let minPeak = 5.0 // a chip at least – below a putt, a waggle, walking
    public static let fullPeak = 12.0 // a full swing from here
    public static let minS = 0.25 // a swing takes longer than a flick of the hand
    public static let maxS = 3.0 // and is over sooner than a wave or a stretch
    public static let deadS = 2.0 // one swing – the follow-through and putting the club down are not a second one
    public static let joltWindowS = 0.15 // the hit is this close to the fastest turn
    public static let hitJolt = 2.5 // g from one sample to the next at 800 Hz
    public static let waitAccelS = 2.0 // the acceleration comes in its own batches: wait this long for it, then decide without
}

/// The detector on the two streams of the watch's motion.
public final class SwingCore {
    private var inSwing = false
    private var from = 0.0
    private var peak = 0.0
    private var peakT = 0.0
    private var calmSince: Double?
    private var waitCalm = false // turned fast too long: nothing new before the wrist is calm again
    private var lastEnd = -Double.infinity
    private var pending: [Swing] = [] // over, waiting for the acceleration around their moment
    private var near: [Swing] = [] // turned fast, but no swing (too slow, too short) – kept to tune the thresholds
    // the acceleration: the jolts of the last seconds, and how far it has come
    private var jolts: [(t: Double, j: Double)] = []
    private var prevAcc: (x: Double, y: Double, z: Double)?
    private var accUntil = -Double.infinity

    public init() {}

    /// One sample of the wrist's rotation (rad/s, the three axes) at time t (s since 1970). Returns the swings that are
    /// decided now.
    public func motion(t: Double, x: Double, y: Double, z: Double) -> [Swing] {
        let w = (x * x + y * y + z * z).squareRoot()
        if waitCalm {
            if w < SwingParams.end { waitCalm = false }
        } else if !inSwing {
            if w >= SwingParams.start && t - lastEnd >= SwingParams.deadS {
                inSwing = true
                from = t
                peak = w
                peakT = t
                calmSince = nil
            }
        } else {
            if w > peak {
                peak = w
                peakT = t
            }
            if w < SwingParams.end {
                if calmSince == nil { calmSince = t }
                if let c = calmSince, t - c >= SwingParams.calmS { close(at: c) }
            } else {
                calmSince = nil
            }
            // turning fast for too long: no swing (a wave, a stretch) – nothing until the wrist is calm again
            if inSwing && t - from > SwingParams.maxS {
                inSwing = false
                waitCalm = true
            }
        }
        return decide(now: t, waiting: false)
    }

    /// One sample of the wrist's acceleration (g, the three axes) at time t.
    public func accel(t: Double, x: Double, y: Double, z: Double) -> [Swing] {
        if let p = prevAcc {
            let dx = x - p.x
            let dy = y - p.y
            let dz = z - p.z
            jolts.append((t: t, j: (dx * dx + dy * dy + dz * dz).squareRoot()))
        }
        prevAcc = (x: x, y: y, z: z)
        accUntil = t
        // only what a pending or coming swing may still ask for
        let keep = t - SwingParams.maxS - SwingParams.waitAccelS - 1
        if let first = jolts.first, first.t < keep {
            jolts.removeAll { $0.t < keep }
        }
        return decide(now: t, waiting: false)
    }

    /// The turns that were no swing since the last call (Sascha's swings tune the thresholds – the watch records them too).
    public func takeNearMisses() -> [Swing] {
        let out = near
        near = []
        return out
    }

    /// The swings still waiting (the round ends, the app goes away): decided with what is there.
    public func flush() -> [Swing] {
        return decide(now: .infinity, waiting: true)
    }

    private func close(at end: Double) {
        inSwing = false
        let duration = end - from
        lastEnd = end
        if peak < SwingParams.minPeak || duration < SwingParams.minS || duration > SwingParams.maxS {
            if duration > 0.1 {
                near.append(Swing(t: peakT, peak: (peak * 10).rounded() / 10, jolt: 0, duration: (duration * 100).rounded() / 100))
                if near.count > 50 { near.removeFirst(near.count - 50) }
            }
            return
        }
        pending.append(Swing(t: peakT, peak: peak, jolt: 0, duration: duration))
    }

    private func decide(now: Double, waiting: Bool) -> [Swing] {
        if pending.isEmpty { return [] }
        var out: [Swing] = []
        var still: [Swing] = []
        for s in pending {
            let need = s.t + SwingParams.joltWindowS
            let ready = accUntil >= need || now - s.t >= SwingParams.waitAccelS || waiting
            if !ready {
                still.append(s)
                continue
            }
            var j = 0.0
            for x in jolts where abs(x.t - s.t) <= SwingParams.joltWindowS {
                if x.j > j { j = x.j }
            }
            out.append(Swing(t: s.t, peak: (s.peak * 10).rounded() / 10, jolt: (j * 10).rounded() / 10, duration: (s.duration * 100).rounded() / 100))
        }
        pending = still
        return out
    }
}
