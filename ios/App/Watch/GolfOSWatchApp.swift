// GolfOS on the Apple Watch (Sascha 08.11.2026: "the shot detection by the watch – the phone often lies in the cart";
// shots + distances). The round comes from the iPhone app (src/lib/watch.ts → WatchLinkPlugin): the holes with tee,
// green and par. On the wrist: the hole, the distances to the green from where the player stands (the watch's own
// GPS) and the shots – every swing is felt (SwingCore) and sent to the iPhone with the watch's place and time, where it
// counts as a "shot here" of the round.

import HealthKit
import SwiftUI
import WatchKit

final class WatchDelegate: NSObject, WKApplicationDelegate {
    func applicationDidFinishLaunching() {
        RoundModel.shared.activate()
    }

    /// the iPhone started the round (HKHealthStore.startWatchApp): the workout begins at once
    func handle(_ workoutConfiguration: HKWorkoutConfiguration) {
        RoundModel.shared.activate()
        RoundModel.shared.startWorkout()
    }
}

@main
struct GolfOSWatchApp: App {
    @WKApplicationDelegateAdaptor(WatchDelegate.self) var delegate
    @StateObject private var model = RoundModel.shared

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(model)
        }
    }
}
