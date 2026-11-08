// The Apple Watch for the page (Sascha 08.11.2026: "the shot detection by the Apple Watch – the phone often lies in the
// cart"). The page (src/lib/watch.ts) hands over the round – the holes with tee, green and par – and the hole on the
// screen; the watch app (ios/App/Watch) shows the distances and feels the swings. Each swing comes back with the
// watch's place and time and is kept here until the page took it (the page may sleep in the cart), also over a restart
// of the app – the page knows the ones it has by their id.
//
// startWatchApp opens the watch app and starts its golf workout – the swings are felt only during one.

#if os(iOS)
import Capacitor
import Foundation
import HealthKit
import WatchConnectivity

@objc(WatchLinkPlugin)
public class WatchLinkPlugin: CAPPlugin, CAPBridgedPlugin, WCSessionDelegate {
    public let identifier = "WatchLinkPlugin"
    public let jsName = "WatchLink"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "status", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "round", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "hole", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "end", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "take", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "forget", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "samples", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clearSamples", returnType: CAPPluginReturnPromise),
    ]

    private let keptKey = "golfos.watch.kept"
    private let lock = NSLock()
    private var kept: [[String: Any]] = [] // {kind: "shot", shot: {...}} or {kind: "remove", id}
    private var context: [String: Any] = [:]
    private let health = HKHealthStore()

    override public func load() {
        if let data = UserDefaults.standard.data(forKey: keptKey),
           let list = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]] {
            kept = list
        }
        guard WCSession.isSupported() else { return }
        WCSession.default.delegate = self
        WCSession.default.activate()
    }

    /// status() → {supported, paired, installed, reachable}
    @objc func status(_ call: CAPPluginCall) {
        guard WCSession.isSupported() else {
            return call.resolve(["supported": false, "paired": false, "installed": false, "reachable": false])
        }
        // right after the app started the link to the watch may still be coming up: wait for it up to 3 s
        answerStatus(call, tries: 12)
    }

    private func answerStatus(_ call: CAPPluginCall, tries: Int) {
        let s = WCSession.default
        let on = s.activationState == .activated
        if !on && tries > 0 {
            DispatchQueue.global().asyncAfter(deadline: .now() + 0.25) { self.answerStatus(call, tries: tries - 1) }
            return
        }
        call.resolve([
            "supported": true,
            "paired": on && s.isPaired,
            "installed": on && s.isWatchAppInstalled,
            "reachable": on && s.isReachable,
        ])
    }

    /// round({json, hole, start}) – the round to the watch; start: open the watch app and its workout
    @objc func round(_ call: CAPPluginCall) {
        guard let json = call.getString("json") else { return call.reject("json needed") }
        context["round"] = json
        context["active"] = true
        context["hole"] = call.getInt("hole") ?? 0
        let start = call.getBool("start") ?? false
        push()
        if start, WCSession.isSupported(), WCSession.default.activationState == .activated,
           WCSession.default.isPaired, WCSession.default.isWatchAppInstalled, HKHealthStore.isHealthDataAvailable() {
            let config = HKWorkoutConfiguration()
            config.activityType = .golf
            config.locationType = .outdoor
            health.startWatchApp(with: config) { ok, error in
                call.resolve(["started": ok, "why": error?.localizedDescription ?? ""])
            }
        } else {
            call.resolve(["started": false, "why": "no watch"])
        }
    }

    /// hole({hole}) – the hole on the phone's screen
    @objc func hole(_ call: CAPPluginCall) {
        context["hole"] = call.getInt("hole") ?? 0
        push()
        call.resolve()
    }

    /// end() – the round is over: the watch ends its workout
    @objc func end(_ call: CAPPluginCall) {
        context = ["active": false]
        push()
        call.resolve()
    }

    /// take() → {items}: what the watch sent, oldest first (kept until the next round)
    @objc func take(_ call: CAPPluginCall) {
        lock.lock()
        let list = kept
        lock.unlock()
        call.resolve(["items": list])
    }

    private func push() {
        guard WCSession.isSupported(), WCSession.default.activationState == .activated else { return }
        var ctx = context
        ctx["at"] = Date().timeIntervalSince1970 // a context equal to the last one is not sent again
        try? WCSession.default.updateApplicationContext(ctx)
        if WCSession.default.isReachable {
            WCSession.default.sendMessage(ctx, replyHandler: nil, errorHandler: nil)
        }
    }

    // the motion around each swing (Sascha 08.11.2026: to tune the detection from his swings) – one line each in a file
    // of the app, shared from the profile; never in the page's small storage
    private let samplesQueue = DispatchQueue(label: "golfos.watch.samples")
    private var samplesFile: URL? {
        FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first?.appendingPathComponent("golfos-swings.jsonl")
    }

    private func keepSample(_ json: String) {
        samplesQueue.async {
            guard let url = self.samplesFile, let line = (json + "\n").data(using: .utf8) else { return }
            if let size = (try? FileManager.default.attributesOfItem(atPath: url.path))?[.size] as? Int, size > 30_000_000 { return }
            if let h = try? FileHandle(forWritingTo: url) {
                h.seekToEndOfFile()
                h.write(line)
                h.closeFile()
            } else {
                try? line.write(to: url)
            }
        }
    }

    /// samples() → {count, uri}: the recorded swings, the file's address for the share sheet
    @objc func samples(_ call: CAPPluginCall) {
        samplesQueue.async {
            guard let url = self.samplesFile, let data = try? Data(contentsOf: url) else {
                return call.resolve(["count": 0, "uri": ""])
            }
            var count = 0
            for b in data where b == 10 { count += 1 }
            call.resolve(["count": count, "uri": url.absoluteString])
        }
    }

    @objc func clearSamples(_ call: CAPPluginCall) {
        samplesQueue.async {
            if let url = self.samplesFile { try? FileManager.default.removeItem(at: url) }
            call.resolve()
        }
    }

    private func receive(_ info: [String: Any]) {
        if let json = info["sample"] as? String {
            keepSample(json)
            return
        }
        var item: [String: Any]?
        if let json = info["shot"] as? String, let data = json.data(using: .utf8),
           let shot = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
            item = ["kind": "shot", "shot": shot]
        } else if let id = info["remove"] as? String {
            item = ["kind": "remove", "id": id]
        } else if let h = info["hole"] as? Int {
            item = ["kind": "hole", "hole": h, "t": Date().timeIntervalSince1970 * 1000]
        }
        guard let it = item else { return }
        lock.lock()
        kept.append(it)
        if kept.count > 600 { kept.removeFirst(kept.count - 600) }
        let list = kept
        lock.unlock()
        if let data = try? JSONSerialization.data(withJSONObject: list) {
            UserDefaults.standard.set(data, forKey: keptKey)
        }
        notifyListeners("watch", data: it)
    }

    /// a new round: what the watch sent for the rounds before goes
    private func dropOld(except round: String) {
        lock.lock()
        kept = kept.filter { x in
            guard let shot = x["shot"] as? [String: Any] else { return false }
            return (shot["round"] as? String) == round
        }
        let list = kept
        lock.unlock()
        if let data = try? JSONSerialization.data(withJSONObject: list) {
            UserDefaults.standard.set(data, forKey: keptKey)
        }
    }

    @objc func forget(_ call: CAPPluginCall) {
        dropOld(except: call.getString("round") ?? "")
        call.resolve()
    }

    // MARK: WCSessionDelegate

    public func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {
        if activationState == .activated && !context.isEmpty { push() }
    }

    public func sessionDidBecomeInactive(_ session: WCSession) {}

    public func sessionDidDeactivate(_ session: WCSession) {
        WCSession.default.activate() // another watch paired
    }

    public func session(_ session: WCSession, didReceiveUserInfo userInfo: [String: Any] = [:]) {
        receive(userInfo)
    }

    public func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
        receive(message)
    }
}
#endif
