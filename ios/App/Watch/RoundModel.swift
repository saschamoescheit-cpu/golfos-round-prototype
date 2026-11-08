// The round on the watch: what the iPhone sent (the holes), where the player is (the watch's GPS), the workout that
// keeps the watch awake on the wrist (a golf workout – the swings are felt only during one), and the shots.

import CoreLocation
import CoreMotion
import Foundation
import HealthKit
import WatchConnectivity
import WatchKit

/// one hole as the iPhone sends it – places as [longitude, latitude], as everywhere in GolfOS
struct WatchHole: Codable {
    let label: String
    let par: Int
    let tee: [Double]
    let center: [Double]
    let green: [[Double]]?
    /// the hole drawn (Sascha 08.11.2026) – absent from an older iPhone app
    let map: WatchMap?
}

/// the hole as a picture (src/lib/watch.ts watchMap): metres from the tee, [right, forward], the green straight up;
/// `b` is the turn – the bearing tee → green in degrees from north
struct WatchMap: Codable {
    let b: Double
    let line: [[Double]]
    let green: [[Double]]?
    let fairways: [[[Double]]]
    let bunkers: [[[Double]]]
    let water: [[[Double]]]
    let tees: [[[Double]]]
}

struct WatchRound: Codable {
    let id: String
    let unit: String // "m" or "yd"
    let lang: String // "de" or "en"
    let start: Int // the first hole played (index)
    let holes: [WatchHole?] // null: a hole without a map
}

/// a swing felt (or a shot noted on the watch by hand) – sent to the iPhone as it is
struct WatchShot: Codable {
    let id: String
    let round: String
    let hole: Int
    let t: Double // ms since 1970
    let lng: Double?
    let lat: Double?
    let acc: Double?
    let peak: Double
    let jolt: Double
    let full: Bool
    let hit: Bool
    let manual: Bool
}

final class RoundModel: NSObject, ObservableObject {
    static let shared = RoundModel()

    @Published var round: WatchRound?
    @Published var hole = 0
    @Published var location: CLLocation?
    @Published var shots: [WatchShot] = []
    @Published var running = false
    @Published var note = ""

    private let store = HKHealthStore()
    private var session: HKWorkoutSession?
    private var builder: HKLiveWorkoutBuilder?
    private let locations = CLLocationManager()
    private let feed = SwingFeed()
    private let batched = CMBatchedSensorManager()
    private let plain = CMMotionManager()
    private let motionQueue = OperationQueue()
    private var tasks: [Task<Void, Never>] = []
    private var activated = false
    private var seq = 0
    private var holeByHand = Date.distantPast
    private var unsent: [[String: Any]] = []

    // MARK: start

    func activate() {
        if activated { return }
        activated = true
        restore()
        if WCSession.isSupported() {
            WCSession.default.delegate = self
            WCSession.default.activate()
        }
        locations.delegate = self
        locations.desiredAccuracy = kCLLocationAccuracyBest
        locations.distanceFilter = kCLDistanceFilterNone
        locations.requestWhenInUseAuthorization()
        if round != nil { locations.startUpdatingLocation() }
    }

    func t(_ en: String, _ de: String) -> String {
        let lang = round?.lang ?? (Locale.current.language.languageCode?.identifier ?? "de")
        return lang == "en" ? en : de
    }

    // MARK: what the iPhone says

    fileprivate func apply(_ ctx: [String: Any]) {
        DispatchQueue.main.async {
            if let active = ctx["active"] as? Bool, !active {
                self.endWorkout()
                self.round = nil
                self.shots = []
                self.locations.stopUpdatingLocation()
                self.persist()
                return
            }
            if let json = ctx["round"] as? String, let data = json.data(using: .utf8),
               let r = try? JSONDecoder().decode(WatchRound.self, from: data) {
                if self.round?.id != r.id {
                    self.shots = []
                    self.hole = max(0, min(r.start, r.holes.count - 1))
                }
                self.round = r
                self.locations.startUpdatingLocation()
            }
            if let h = ctx["hole"] as? Int, let r = self.round, h >= 0, h < r.holes.count, h != self.hole {
                self.hole = h
            }
            if let start = ctx["start"] as? Bool, start, self.round != nil {
                self.startWorkout()
            }
            self.persist()
        }
    }

    // MARK: the hole and the distances

    var currentHole: WatchHole? {
        guard let r = round, hole >= 0, hole < r.holes.count else { return nil }
        return r.holes[hole]
    }

    /// where the player stands in the hole's picture: metres [right, forward] from the tee, the green straight up – as
    /// the iPhone turned the hole (WatchMap.b); nil without GPS or a picture
    var spotInMap: [Double]? {
        guard let h = currentHole, let m = h.map, let p = location, h.tee.count >= 2 else { return nil }
        let lat0 = h.tee[1] * Double.pi / 180
        let e = (p.coordinate.longitude - h.tee[0]) * 111320 * cos(lat0)
        let n = (p.coordinate.latitude - h.tee[1]) * 110540
        let b = m.b * Double.pi / 180
        return [e * cos(b) - n * sin(b), e * sin(b) + n * cos(b)]
    }

    /// front, centre, back of the green from where the player stands (front/back nil without a green outline)
    var distances: (front: Double?, center: Double, back: Double?)? {
        guard let h = currentHole, let p = location else { return nil }
        let here = [p.coordinate.longitude, p.coordinate.latitude]
        let center = Geo.distance(here, h.center)
        if let g = h.green, g.count >= 3 {
            let fb = Geo.frontBack(here, g)
            return (front: fb.front, center: center, back: fb.back)
        }
        return (front: nil, center: center, back: nil)
    }

    /// metres in the round's unit, whole
    func shown(_ m: Double) -> String {
        let v = round?.unit == "yd" ? m / 0.9144 : m
        return String(Int(v.rounded()))
    }

    func step(_ by: Int) {
        guard let r = round, !r.holes.isEmpty else { return }
        let n = r.holes.count
        hole = ((hole + by) % n + n) % n
        holeByHand = Date()
        send(["hole": hole])
        persist()
    }

    /// on the next hole's tee: that hole (not for three minutes after the player chose one by hand)
    private func autoHole(_ p: CLLocation) {
        guard let r = round, !r.holes.isEmpty, Date().timeIntervalSince(holeByHand) > 180 else { return }
        let next = (hole + 1) % r.holes.count
        guard let nh = r.holes[next] else { return }
        let here = [p.coordinate.longitude, p.coordinate.latitude]
        let toNext = Geo.distance(here, nh.tee)
        if toNext > 30 { return }
        if let ch = currentHole, Geo.distance(here, ch.tee) < toNext { return } // still on this tee (tees side by side)
        hole = next
        persist()
    }

    // MARK: the shots

    /// the shots on a hole: swings at one spot within two minutes are one (practice swings – the last one is the shot)
    func count(onHole h: Int) -> Int {
        var spots: [WatchShot] = []
        for s in shots where s.hole == h {
            if let last = spots.last, sameSpot(last, s) {
                spots[spots.count - 1] = s
            } else {
                spots.append(s)
            }
        }
        return spots.count
    }

    private func sameSpot(_ a: WatchShot, _ b: WatchShot) -> Bool {
        if a.manual || b.manual { return false }
        guard let alng = a.lng, let alat = a.lat, let blng = b.lng, let blat = b.lat else { return false }
        if b.t - a.t > 120_000 { return false }
        return Geo.distance([alng, alat], [blng, blat]) <= 12
    }

    fileprivate func felt(_ swings: [Swing]) {
        for s in swings {
            let id = add(t: s.t * 1000, peak: s.peak, jolt: s.jolt, full: s.full, hit: s.hit, manual: false)
            recordSwing(s, counted: true, shot: id)
        }
    }

    /// the motion around a swing (or a turn that was no swing) to the iPhone – kept there in a file for tuning the
    /// detection; taken once the second after it is there too
    fileprivate func recordSwing(_ s: Swing, counted: Bool, shot: String?) {
        guard let r = round else { return }
        let feed = self.feed
        let rid = r.id
        DispatchQueue.global().asyncAfter(deadline: .now() + 1.5) { [weak self] in
            let w = feed.window(around: s.t)
            if w.rot.isEmpty { return }
            var d: [String: Any] = [
                "round": rid, "t": (s.t * 1000).rounded(), "peak": s.peak, "jolt": s.jolt, "dur": s.duration,
                "counted": counted, "rot": w.rot, "acc": w.acc,
            ]
            if let shot = shot { d["shot"] = shot }
            guard let data = try? JSONSerialization.data(withJSONObject: d), let json = String(data: data, encoding: .utf8) else { return }
            DispatchQueue.main.async { self?.send(["sample": json]) }
        }
    }

    func addByHand() {
        _ = add(t: Date().timeIntervalSince1970 * 1000, peak: 0, jolt: 0, full: false, hit: false, manual: true)
    }

    @discardableResult
    private func add(t: Double, peak: Double, jolt: Double, full: Bool, hit: Bool, manual: Bool) -> String? {
        guard let r = round else { return nil }
        seq += 1
        var lng: Double?
        var lat: Double?
        var acc: Double?
        if let p = location, abs(p.timestamp.timeIntervalSince1970 * 1000 - t) < 30_000 {
            lng = p.coordinate.longitude
            lat = p.coordinate.latitude
            acc = (p.horizontalAccuracy * 10).rounded() / 10
        }
        let id = "\(r.id)-w\(Int(t))-\(seq)"
        let shot = WatchShot(id: id, round: r.id, hole: hole, t: t.rounded(), lng: lng, lat: lat, acc: acc, peak: peak, jolt: jolt, full: full, hit: hit, manual: manual)
        shots.append(shot)
        if let data = try? JSONEncoder().encode(shot), let json = String(data: data, encoding: .utf8) {
            send(["shot": json])
        }
        WKInterfaceDevice.current().play(.click)
        persist()
        return id
    }

    /// the last shot on this hole was none (a swing at the range net, the club thrown into the bag)
    func removeLast() {
        guard let last = shots.last(where: { $0.hole == hole }) else { return }
        shots.removeAll { $0.id == last.id }
        send(["remove": last.id])
        persist()
    }

    private func send(_ info: [String: Any]) {
        guard WCSession.isSupported(), WCSession.default.activationState == .activated else {
            unsent.append(info)
            return
        }
        WCSession.default.transferUserInfo(info)
    }

    fileprivate func sendUnsent() {
        let list = unsent
        unsent = []
        for info in list { send(info) }
    }

    // MARK: the workout – the watch stays on the wrist's side the whole round

    func startWorkout() {
        guard session == nil, HKHealthStore.isHealthDataAvailable() else { return }
        let share: Set<HKSampleType> = [HKObjectType.workoutType()]
        let read: Set<HKObjectType> = [HKObjectType.workoutType(), HKQuantityType(.heartRate), HKQuantityType(.activeEnergyBurned)]
        store.requestAuthorization(toShare: share, read: read) { [weak self] _, _ in
            DispatchQueue.main.async { self?.beginWorkout() }
        }
    }

    private func beginWorkout() {
        guard session == nil else { return }
        let config = HKWorkoutConfiguration()
        config.activityType = .golf
        config.locationType = .outdoor
        do {
            let s = try HKWorkoutSession(healthStore: store, configuration: config)
            let b = s.associatedWorkoutBuilder()
            b.dataSource = HKLiveWorkoutDataSource(healthStore: store, workoutConfiguration: config)
            s.delegate = self
            session = s
            builder = b
            let now = Date()
            s.startActivity(with: now)
            b.beginCollection(withStart: now) { _, _ in }
            running = true
            note = ""
            locations.startUpdatingLocation()
            startSensors()
        } catch {
            note = t("The workout did not start – allow GolfOS in Health", "Training startet nicht – GolfOS in Health erlauben")
        }
    }

    func endWorkout() {
        stopSensors()
        running = false
        guard let s = session else { return }
        session = nil
        s.end()
        let b = builder
        builder = nil
        b?.endCollection(withEnd: Date()) { _, _ in
            b?.finishWorkout { _, _ in }
        }
    }

    // MARK: the swing – the wrist's motion into SwingCore

    private func startSensors() {
        stopSensors()
        feed.reset()
        // the motion's time is the time since the watch started; the shots carry the clock's
        let offset = Date().timeIntervalSince1970 - ProcessInfo.processInfo.systemUptime
        let feed = self.feed
        let report: ([Swing]) -> Void = { [weak self] found in
            let near = feed.nearMisses()
            if found.isEmpty && near.isEmpty { return }
            DispatchQueue.main.async {
                self?.felt(found)
                for s in near { self?.recordSwing(s, counted: false, shot: nil) }
            }
        }
        if CMBatchedSensorManager.isDeviceMotionSupported && CMBatchedSensorManager.isAccelerometerSupported {
            // Series 8 and later: the rotation 200 times, the acceleration 800 times a second
            let mgr = batched
            tasks.append(Task.detached {
                do {
                    for try await batch in mgr.deviceMotionUpdates() {
                        var found: [Swing] = []
                        for m in batch {
                            found.append(contentsOf: feed.motion(t: m.timestamp + offset, x: m.rotationRate.x, y: m.rotationRate.y, z: m.rotationRate.z))
                        }
                        report(found)
                    }
                } catch {}
            })
            tasks.append(Task.detached {
                do {
                    for try await batch in mgr.accelerometerUpdates() {
                        var found: [Swing] = []
                        for a in batch {
                            found.append(contentsOf: feed.accel(t: a.timestamp + offset, x: a.acceleration.x, y: a.acceleration.y, z: a.acceleration.z))
                        }
                        report(found)
                    }
                } catch {}
            })
        } else if plain.isDeviceMotionAvailable {
            // older watches: the rotation 100 times a second, no jolt
            plain.deviceMotionUpdateInterval = 1.0 / 100.0
            plain.startDeviceMotionUpdates(to: motionQueue) { m, _ in
                guard let m = m else { return }
                report(feed.motion(t: m.timestamp + offset, x: m.rotationRate.x, y: m.rotationRate.y, z: m.rotationRate.z))
            }
        }
    }

    private func stopSensors() {
        for task in tasks { task.cancel() }
        tasks = []
        if plain.isDeviceMotionActive { plain.stopDeviceMotionUpdates() }
        let rest = feed.flush()
        if !rest.isEmpty { felt(rest) }
    }

    // MARK: kept on the watch (the app may be closed and opened again during the round)

    private func persist() {
        let d = UserDefaults.standard
        if let r = round, let data = try? JSONEncoder().encode(r) {
            d.set(data, forKey: "golfos.round")
        } else {
            d.removeObject(forKey: "golfos.round")
        }
        d.set(hole, forKey: "golfos.hole")
        if let data = try? JSONEncoder().encode(shots) { d.set(data, forKey: "golfos.shots") }
    }

    private func restore() {
        let d = UserDefaults.standard
        if let data = d.data(forKey: "golfos.round"), let r = try? JSONDecoder().decode(WatchRound.self, from: data) {
            round = r
            hole = max(0, min(d.integer(forKey: "golfos.hole"), r.holes.count - 1))
        }
        if let data = d.data(forKey: "golfos.shots"), let s = try? JSONDecoder().decode([WatchShot].self, from: data) {
            shots = s
            seq = s.count
        }
    }
}

// MARK: - the iPhone

extension RoundModel: WCSessionDelegate {
    func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {
        guard activationState == .activated else { return }
        apply(session.receivedApplicationContext)
        DispatchQueue.main.async { self.sendUnsent() }
    }

    func session(_ session: WCSession, didReceiveApplicationContext applicationContext: [String: Any]) {
        apply(applicationContext)
    }

    func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
        apply(message)
    }

    func session(_ session: WCSession, didReceiveUserInfo userInfo: [String: Any]) {
        apply(userInfo)
    }
}

// MARK: - the workout

extension RoundModel: HKWorkoutSessionDelegate {
    func workoutSession(_ workoutSession: HKWorkoutSession, didChangeTo toState: HKWorkoutSessionState, from fromState: HKWorkoutSessionState, date: Date) {}

    func workoutSession(_ workoutSession: HKWorkoutSession, didFailWithError error: Error) {
        DispatchQueue.main.async {
            self.note = self.t("The workout stopped", "Training wurde beendet")
            self.endWorkout()
        }
    }
}

// MARK: - the watch's GPS

extension RoundModel: CLLocationManagerDelegate {
    func locationManager(_ manager: CLLocationManager, didUpdateLocations locs: [CLLocation]) {
        guard let p = locs.last, p.horizontalAccuracy >= 0, p.horizontalAccuracy <= 30 else { return }
        DispatchQueue.main.async {
            self.location = p
            self.autoHole(p)
        }
    }

    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {}
}

/// SwingCore from two streams at once – one at a time; and the last seconds of the motion, for the recording of each
/// swing (Sascha 08.11.2026: the thresholds are tuned from his swings)
final class SwingFeed {
    private let lock = NSLock()
    private var core = SwingCore()
    private var rot: [(t: Double, x: Float, y: Float, z: Float)] = []
    private var acc: [(t: Double, a: Float)] = []

    func reset() {
        lock.lock()
        core = SwingCore()
        rot = []
        acc = []
        lock.unlock()
    }

    func motion(t: Double, x: Double, y: Double, z: Double) -> [Swing] {
        lock.lock()
        defer { lock.unlock() }
        rot.append((t: t, x: Float(x), y: Float(y), z: Float(z)))
        if rot.count > 2400 { rot.removeFirst(rot.count - 1600) }
        return core.motion(t: t, x: x, y: y, z: z)
    }

    func accel(t: Double, x: Double, y: Double, z: Double) -> [Swing] {
        lock.lock()
        defer { lock.unlock() }
        acc.append((t: t, a: Float((x * x + y * y + z * z).squareRoot())))
        if acc.count > 8000 { acc.removeFirst(acc.count - 5000) }
        return core.accel(t: t, x: x, y: y, z: z)
    }

    func nearMisses() -> [Swing] {
        lock.lock()
        defer { lock.unlock() }
        return core.takeNearMisses()
    }

    /// around a moment: the rotation from 1.5 s before to 1 s after (every second sample – 100 a second; ms from the
    /// moment, then x, y, z in centi-rad/s) and the acceleration 0.3 s around it (all of it; 0.1 ms, centi-g)
    func window(around t: Double) -> (rot: [Int], acc: [Int]) {
        lock.lock()
        defer { lock.unlock() }
        var r: [Int] = []
        var k = 0
        for s in rot where s.t >= t - 1.5 && s.t <= t + 1.0 {
            if k % 2 == 0 {
                r.append(Int(((s.t - t) * 1000).rounded()))
                r.append(Int((s.x * 100).rounded()))
                r.append(Int((s.y * 100).rounded()))
                r.append(Int((s.z * 100).rounded()))
            }
            k += 1
        }
        var a: [Int] = []
        for s in acc where s.t >= t - 0.3 && s.t <= t + 0.3 {
            a.append(Int(((s.t - t) * 10000).rounded()))
            a.append(Int((s.a * 100).rounded()))
        }
        return (rot: r, acc: a)
    }

    func flush() -> [Swing] {
        lock.lock()
        defer { lock.unlock() }
        return core.flush()
    }
}

/// distances on the Earth – as src/lib/geo.ts
enum Geo {
    static func distance(_ a: [Double], _ b: [Double]) -> Double {
        guard a.count >= 2, b.count >= 2 else { return 0 }
        let r = 6_371_008.8
        let la1 = a[1] * Double.pi / 180
        let la2 = b[1] * Double.pi / 180
        let dla = la2 - la1
        let dlo = (b[0] - a[0]) * Double.pi / 180
        let s1 = sin(dla / 2)
        let s2 = sin(dlo / 2)
        let h = s1 * s1 + cos(la1) * cos(la2) * s2 * s2
        return 2 * r * asin(min(1, h.squareRoot()))
    }

    /// where the line from the player to the green's middle enters and leaves the green (geo.ts greenFrontBack)
    static func frontBack(_ from: [Double], _ green: [[Double]]) -> (front: Double, back: Double) {
        let kx = cos(from[1] * Double.pi / 180) * 111_320.0
        let ky = 110_574.0
        var pts: [(x: Double, y: Double)] = []
        for p in green where p.count >= 2 {
            pts.append((x: (p[0] - from[0]) * kx, y: (p[1] - from[1]) * ky))
        }
        if pts.isEmpty { return (front: 0, back: 0) }
        var cx = 0.0
        var cy = 0.0
        for p in pts {
            cx += p.x
            cy += p.y
        }
        cx /= Double(pts.count)
        cy /= Double(pts.count)
        let len = max((cx * cx + cy * cy).squareRoot(), 1)
        let ux = cx / len
        let uy = cy / len
        var hits: [Double] = []
        if pts.count >= 2 {
            for i in 1..<pts.count {
                let x1 = pts[i - 1].x
                let y1 = pts[i - 1].y
                let ex = pts[i].x - x1
                let ey = pts[i].y - y1
                let denom = ux * ey - uy * ex
                if abs(denom) < 1e-9 { continue }
                let along = (x1 * ey - y1 * ex) / denom
                let s = (x1 * uy - y1 * ux) / denom
                if along >= 0 && s >= 0 && s <= 1 { hits.append(along) }
            }
        }
        if hits.count >= 2 { return (front: hits.min() ?? 0, back: hits.max() ?? 0) }
        if hits.count == 1 { return (front: 0, back: hits[0]) }
        var near = Double.infinity
        var far = 0.0
        for p in pts {
            let d = (p.x * p.x + p.y * p.y).squareRoot()
            near = min(near, d)
            far = max(far, d)
        }
        return (front: near, back: far)
    }
}
