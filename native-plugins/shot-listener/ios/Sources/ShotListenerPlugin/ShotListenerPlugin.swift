// Shot by sound in the iOS app, with the phone locked (Sascha 01.11.2026). The website hears only while its page is
// open and the screen on; here iOS's own audio engine listens – in the background too (UIBackgroundModes "audio" in
// Info.plist) – and the detector (ShotCore, the website's ImpactCore) runs on every block. Nothing is recorded: only
// the moment and the loudness of a crack.
//
// For the page (src/lib/native.ts listenShots): start, stop, status (on / stalled / dead and why), and every crack as
// an event "impact" – and kept with its number until the page takes it (take), since the page may sleep in the pocket.

#if os(iOS)
import AVFoundation
import Capacitor
import Foundation
import ShotCore

@objc(ShotListenerPlugin)
public class ShotListenerPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "ShotListenerPlugin"
    public let jsName = "ShotListener"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "status", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "take", returnType: CAPPluginReturnPromise),
    ]

    private let engine = AVAudioEngine()
    private let queue = DispatchQueue(label: "golfos.shots")
    private var running = false
    private var lastBlock = Date.distantPast
    private var why = ""
    private var restarts = 0
    private var seq = 0
    private var kept: [[String: Any]] = [] // cracks not taken by the page yet
    private var observers: [NSObjectProtocol] = []

    @objc func start(_ call: CAPPluginCall) {
        AVAudioSession.sharedInstance().requestRecordPermission { granted in
            guard granted else { return call.reject("Microphone not allowed", "NOT_AUTHORIZED") }
            self.queue.async {
                do {
                    try self.open()
                    self.watch()
                    call.resolve()
                } catch {
                    call.reject("Microphone could not be opened: \(error.localizedDescription)", "FAILED")
                }
            }
        }
    }

    @objc func stop(_ call: CAPPluginCall) {
        queue.async {
            self.close()
            call.resolve()
        }
    }

    @objc func status(_ call: CAPPluginCall) {
        queue.async {
            call.resolve(["health": self.health(), "why": self.why, "restarts": self.restarts])
        }
    }

    /// The cracks since the last take – the page asks when it wakes up, so none is lost while it slept.
    @objc func take(_ call: CAPPluginCall) {
        queue.async {
            let out = self.kept
            self.kept.removeAll()
            call.resolve(["impacts": out])
        }
    }

    // MARK: - the engine

    private func open() throws {
        let session = AVAudioSession.sharedInstance()
        // raw sound ("measurement": no echo cancelling, no automatic gain) – and the caddie's voice and music go on
        try session.setCategory(.playAndRecord, mode: .measurement, options: [.mixWithOthers, .defaultToSpeaker, .allowBluetoothA2DP])
        try session.setActive(true)
        let input = engine.inputNode
        let format = input.outputFormat(forBus: 0)
        guard format.sampleRate > 0 else { throw NSError(domain: "ShotListener", code: 1, userInfo: [NSLocalizedDescriptionKey: "no microphone"]) }
        input.removeTap(onBus: 0)
        // the detector and its count of samples live on the engine's thread alone (its blocks come one after another)
        let core = ImpactCore()
        let t0 = Date().timeIntervalSince1970 * 1000
        let rate = format.sampleRate
        var samples = 0.0
        input.installTap(onBus: 0, bufferSize: 1024, format: format) { [weak self] buffer, _ in
            guard let data = buffer.floatChannelData else { return }
            let n = Int(buffer.frameLength)
            // time from the samples, not the clock: the blocks may arrive in bursts, the sound keeps exact time
            let hit = core.feed(UnsafeBufferPointer(start: data[0], count: n), now: t0 + samples * 1000 / rate)
            samples += Double(n)
            self?.queue.async {
                self?.lastBlock = Date()
                if let hit = hit { self?.heard(hit) }
            }
        }
        engine.prepare()
        try engine.start()
        running = true
        lastBlock = Date()
        why = ""
    }

    private func close() {
        observers.forEach { NotificationCenter.default.removeObserver($0) }
        observers.removeAll()
        engine.inputNode.removeTap(onBus: 0)
        engine.stop()
        running = false
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }

    private func heard(_ hit: Impact) {
        seq += 1
        let item: [String: Any] = ["seq": seq, "t": hit.t, "level": hit.level]
        kept.append(item)
        if kept.count > 500 { kept.removeFirst(kept.count - 500) }
        notifyListeners("impact", data: item)
    }

    /// A call, Siri, another app taking the sound: held up – afterwards it listens again by itself.
    private func watch() {
        guard observers.isEmpty else { return }
        let center = NotificationCenter.default
        observers.append(center.addObserver(forName: AVAudioSession.interruptionNotification, object: nil, queue: nil) { [weak self] note in
            guard let self = self, let raw = note.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt,
                  let type = AVAudioSession.InterruptionType(rawValue: raw) else { return }
            self.queue.async {
                if type == .began {
                    self.why = "Ton unterbrochen (Anruf, Siri oder eine andere App)"
                } else {
                    self.reopen("nach der Unterbrechung")
                }
            }
        })
        observers.append(center.addObserver(forName: .AVAudioEngineConfigurationChange, object: engine, queue: nil) { [weak self] _ in
            self?.queue.async { self?.reopen("Mikrofon gewechselt") }
        })
        observers.append(center.addObserver(forName: AVAudioSession.mediaServicesWereResetNotification, object: nil, queue: nil) { [weak self] _ in
            self?.queue.async { self?.reopen("Ton des iPhones neu gestartet") }
        })
    }

    private func reopen(_ reason: String) {
        guard running else { return }
        engine.inputNode.removeTap(onBus: 0)
        engine.stop()
        do {
            try open()
            restarts += 1
        } catch {
            why = "Mikrofon \(reason) nicht wieder geöffnet: \(error.localizedDescription)"
        }
    }

    private func health() -> String {
        if !running { return "dead" }
        if !engine.isRunning || Date().timeIntervalSince(lastBlock) > 2.5 { return "stalled" }
        return "on"
    }
}
#endif
