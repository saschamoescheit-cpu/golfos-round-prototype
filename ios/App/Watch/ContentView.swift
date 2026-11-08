// The watch's screens (Sascha 08.11.2026: shots + distances): the hole with the distances to the green and the shots
// on it; swiped up, the round – shot detection on/off, end. GolfOS' look: green for what stands out, numbers on green
// white, no yellow.

import SwiftUI

private let brand = Color(red: 0x79 / 255.0, green: 0xA1 / 255.0, blue: 0x28 / 255.0)
private let brandText = Color(red: 0x9B / 255.0, green: 0xC5 / 255.0, blue: 0x3D / 255.0)
private let danger = Color(red: 0.86, green: 0.27, blue: 0.24)

struct ContentView: View {
    @EnvironmentObject var model: RoundModel

    var body: some View {
        if model.round == nil {
            NoRound()
        } else {
            TabView {
                HolePage()
                RoundPage()
            }
            .tabViewStyle(.verticalPage)
        }
    }
}

private struct NoRound: View {
    @EnvironmentObject var model: RoundModel

    var body: some View {
        VStack(spacing: 8) {
            Image(systemName: "figure.golf")
                .font(.system(size: 34))
                .foregroundStyle(brandText)
            Text(model.t("Start a round on the iPhone", "Starte eine Runde auf dem iPhone"))
                .font(.footnote)
                .multilineTextAlignment(.center)
                .foregroundStyle(.secondary)
        }
        .padding()
    }
}

private struct HolePage: View {
    @EnvironmentObject var model: RoundModel

    var body: some View {
        VStack(spacing: 4) {
            HStack {
                Button { model.step(-1) } label: { Image(systemName: "chevron.left") }
                    .buttonStyle(.plain)
                    .accessibilityLabel(model.t("Previous hole", "Voriges Loch"))
                Spacer()
                VStack(spacing: 0) {
                    Text(model.t("Hole", "Loch") + " " + (model.currentHole?.label ?? String(model.hole + 1)))
                        .font(.headline)
                    if let par = model.currentHole?.par {
                        Text("Par \(par)").font(.caption2).foregroundStyle(.secondary)
                    }
                }
                Spacer()
                Button { model.step(1) } label: { Image(systemName: "chevron.right") }
                    .buttonStyle(.plain)
                    .accessibilityLabel(model.t("Next hole", "Nächstes Loch"))
            }
            Distances()
            Spacer(minLength: 0)
            ShotBar()
        }
        .padding(.horizontal, 6)
    }
}

private struct Distances: View {
    @EnvironmentObject var model: RoundModel

    var body: some View {
        if model.currentHole == nil {
            Text(model.t("No map for this hole", "Keine Karte für dieses Loch"))
                .font(.footnote)
                .foregroundStyle(.secondary)
                .frame(maxHeight: .infinity)
        } else if let d = model.distances {
            VStack(spacing: 0) {
                Text(model.shown(d.center))
                    .font(.system(size: 52, weight: .bold, design: .rounded))
                    .foregroundStyle(.white)
                    .monospacedDigit()
                    .minimumScaleFactor(0.6)
                    .accessibilityLabel(model.t("To the middle of the green", "Bis zur Grünmitte") + " " + model.shown(d.center))
                HStack(spacing: 14) {
                    if let f = d.front { GreenEdge(label: model.t("front", "vorne"), value: model.shown(f)) }
                    if let b = d.back { GreenEdge(label: model.t("back", "hinten"), value: model.shown(b)) }
                }
            }
        } else {
            VStack(spacing: 4) {
                ProgressView()
                Text(model.t("Waiting for GPS", "Warte auf GPS"))
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
            .frame(maxHeight: .infinity)
        }
    }
}

private struct GreenEdge: View {
    let label: String
    let value: String

    var body: some View {
        VStack(spacing: 0) {
            Text(value).font(.system(size: 18, weight: .semibold, design: .rounded)).monospacedDigit()
            Text(label).font(.caption2).foregroundStyle(.secondary)
        }
    }
}

/// the shots on this hole: their number on green, one noted by hand, the last one taken back
private struct ShotBar: View {
    @EnvironmentObject var model: RoundModel

    var body: some View {
        let n = model.count(onHole: model.hole)
        HStack(spacing: 6) {
            HStack(spacing: 4) {
                Image(systemName: model.running ? "applewatch.radiowaves.left.and.right" : "figure.golf")
                    .font(.caption2)
                Text("\(n)").font(.system(size: 17, weight: .bold, design: .rounded)).monospacedDigit()
                Text(n == 1 ? model.t("shot", "Schlag") : model.t("shots", "Schläge")).font(.caption2)
            }
            .foregroundStyle(.white)
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(Capsule().fill(brand))
            Spacer(minLength: 0)
            Button { model.removeLast() } label: { Image(systemName: "arrow.uturn.backward") }
                .buttonStyle(.plain)
                .disabled(n == 0)
                .accessibilityLabel(model.t("Take the last shot back", "Letzten Schlag zurücknehmen"))
            Button { model.addByHand() } label: { Image(systemName: "plus.circle.fill").foregroundStyle(brandText) }
                .buttonStyle(.plain)
                .accessibilityLabel(model.t("Shot here", "Schlag hier"))
        }
        .font(.title3)
    }
}

/// swiped up: the shot detection (the workout) and the end of the round on the watch
private struct RoundPage: View {
    @EnvironmentObject var model: RoundModel

    var body: some View {
        ScrollView {
            VStack(spacing: 10) {
                Toggle(isOn: Binding(get: { model.running }, set: { on in on ? model.startWorkout() : model.endWorkout() })) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(model.t("Shot detection", "Schlagerkennung")).font(.headline)
                        Text(model.running ? model.t("Every swing counts", "Jeder Schwung zählt") : model.t("Off", "Aus"))
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }
                }
                .tint(brand)
                if !model.note.isEmpty {
                    Text(model.note).font(.caption2).foregroundStyle(.secondary)
                }
                let total = model.shots.count
                Text(model.t("\(total) swings this round", "\(total) Schwünge auf dieser Runde"))
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                Button(role: .destructive) {
                    model.endWorkout()
                } label: {
                    Label(model.t("End shot detection", "Schlagerkennung beenden"), systemImage: "stop.circle")
                }
                .tint(danger)
                .disabled(!model.running)
            }
            .padding(.horizontal, 4)
        }
    }
}
