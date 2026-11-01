// Shot by sound in the iOS app (Sascha 01.11.2026: "everything" for the app – the shot heard with the phone locked in
// the pocket). The same detector as the website's (src/lib/impact.ts, ImpactCore) – line by line, so both hear the same
// cracks; change one, change the other. Pure: tested without a microphone (Tests/ShotCoreTests).

import Foundation

public struct Impact: Equatable {
    /// ms since 1970
    public let t: Double
    /// peak 0…1, two decimals
    public let level: Double
}

public enum ImpactParams {
    public static let minPeak = 0.2 // full scale = 1
    public static let rise = 12.0 // block energy ≥ 12 × the background
    public static let minZcr = 0.06 // zero crossings per sample – a crack is bright, a thump or a voice less so
    public static let decayMs = 150.0 // the energy falls to an eighth within this time
    public static let decayTo = 1.0 / 8.0
    public static let deadMs = 1500.0 // one shot – the echo and the ball landing nearby are not a second one
    public static let bgAlpha = 0.05 // how fast the background rises – per 1024 samples at 48 kHz (21 ms)
    public static let bgFall = 0.3 // and how fast it falls back once it is quiet again
}

/// The detector on blocks of samples.
public final class ImpactCore {
    private var bg = 1e-6
    private var pending: (t: Double, e: Double, level: Double)?
    private var last = -Double.infinity
    private var prev: Double?

    public init() {}

    public func feed(_ block: UnsafeBufferPointer<Float>, now: Double) -> Impact? {
        let n = block.count
        if n == 0 { return nil }
        var peak = 0.0
        var sum = 0.0
        var zc = 0
        for k in 0..<n {
            let v = Double(block[k])
            let a = abs(v)
            if a > peak { peak = a }
            sum += v * v
            if k > 0 && (v >= 0) != (block[k - 1] >= 0) { zc += 1 }
        }
        let e = sum / Double(n)
        let zcr = Double(zc) / Double(n)
        // the background follows per time, not per block
        let dt = prev == nil ? 21.3 : max(1, now - prev!)
        prev = now
        func rate(_ a: Double) -> Double { 1 - pow(1 - a, dt / 21.3) }
        // a sound still loud after 150 ms is no strike (a voice, a cart): it becomes the background
        if let p = pending, now - p.t > ImpactParams.decayMs {
            bg = max(bg, p.e, e)
            pending = nil
        }
        if var p = pending {
            // a crack across two blocks: measure the decay from the loudest part
            if e > p.e {
                // its loudest part must be bright too: a click followed by a dull, loud sound is a voice or a thump
                if zcr < ImpactParams.minZcr {
                    bg = max(bg, e)
                    pending = nil
                    return nil
                }
                p.e = e
                p.level = max(p.level, peak)
                pending = p
                return nil
            }
            if e <= p.e * ImpactParams.decayTo {
                let hit = Impact(t: p.t, level: (p.level * 100).rounded() / 100)
                pending = nil
                last = hit.t
                return hit
            }
            return nil
        }
        if now - last > ImpactParams.deadMs && peak >= ImpactParams.minPeak && e >= ImpactParams.rise * bg && zcr >= ImpactParams.minZcr {
            pending = (t: now, e: e, level: peak)
            return nil
        }
        bg += rate(e < bg ? ImpactParams.bgFall : ImpactParams.bgAlpha) * (e - bg)
        if bg < 1e-7 { bg = 1e-7 }
        return nil
    }

    public func feed(_ block: [Float], now: Double) -> Impact? {
        block.withUnsafeBufferPointer { feed($0, now: now) }
    }
}
