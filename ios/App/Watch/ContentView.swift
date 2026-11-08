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
                HoleMapPage()
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

/// the hole as a picture (Sascha 08.11.2026: "the hole's picture on the watch beside the score and the distances"):
/// tee at the bottom, the green on top, fairways, bunkers, water, the playing line and where the player stands; the
/// distance to the middle of the green and the shots on it over the picture
private struct HoleMapPage: View {
    @EnvironmentObject var model: RoundModel

    var body: some View {
        if let h = model.currentHole, let m = h.map {
            ZStack {
                HoleDrawing(map: m, spot: model.spotInMap)
                VStack {
                    HStack(alignment: .top) {
                        VStack(alignment: .leading, spacing: 0) {
                            if let d = model.distances {
                                Text(model.shown(d.center))
                                    .font(.system(size: 30, weight: .bold, design: .rounded))
                                    .monospacedDigit()
                                    .foregroundStyle(.white)
                                    .shadow(color: .black.opacity(0.7), radius: 2)
                                HStack(spacing: 6) {
                                    if let f = d.front { Text(model.shown(f)).font(.caption2).monospacedDigit() }
                                    if let b = d.back { Text(model.shown(b)).font(.caption2).monospacedDigit() }
                                }
                                .foregroundStyle(.white.opacity(0.85))
                                .shadow(color: .black.opacity(0.7), radius: 2)
                            }
                        }
                        Spacer()
                        VStack(alignment: .trailing, spacing: 0) {
                            Text(model.t("Hole", "Loch") + " " + h.label).font(.caption).bold()
                            Text("Par \(h.par)").font(.caption2).foregroundStyle(.white.opacity(0.8))
                        }
                        .shadow(color: .black.opacity(0.7), radius: 2)
                    }
                    Spacer()
                    HStack {
                        let n = model.count(onHole: model.hole)
                        Text("\(n)")
                            .font(.system(size: 15, weight: .bold, design: .rounded))
                            .monospacedDigit()
                            .foregroundStyle(.white)
                            .padding(.horizontal, 8)
                            .padding(.vertical, 2)
                            .background(Capsule().fill(brand))
                            .accessibilityLabel(model.t("\(n) shots on this hole", "\(n) Schläge an diesem Loch"))
                        Spacer()
                    }
                }
                .padding(.horizontal, 4)
            }
            .ignoresSafeArea(edges: .bottom)
        } else {
            Text(model.t("No picture of this hole", "Kein Bild von diesem Loch"))
                .font(.footnote)
                .foregroundStyle(.secondary)
        }
    }
}

/// the hole drawn to fit the screen: metres [right, forward] – forward up
private struct HoleDrawing: View {
    let map: WatchMap
    let spot: [Double]?

    private static let rough = Color(red: 0.12, green: 0.22, blue: 0.10)
    private static let fairway = Color(red: 0.25, green: 0.48, blue: 0.17)
    private static let greenFill = Color(red: 0x9B / 255.0, green: 0xC5 / 255.0, blue: 0x3D / 255.0)
    private static let bunker = Color(red: 0.85, green: 0.78, blue: 0.60)
    private static let water = Color(red: 0.20, green: 0.45, blue: 0.65)
    private static let teeBox = Color(red: 0.30, green: 0.55, blue: 0.20)
    private static let flagRed = Color(red: 0.86, green: 0.27, blue: 0.24)

    /// the frame: the playing line and the green – the shapes beside may be cut at the edges
    private func frame(_ size: CGSize) -> (scale: Double, midX: Double, minY: Double)? {
        var pts = map.line
        if let g = map.green { pts += g }
        var xs: [Double] = []
        var ys: [Double] = []
        for p in pts where p.count > 1 {
            xs.append(p[0])
            ys.append(p[1])
        }
        guard let minY = ys.min(), let maxY = ys.max(), let minX = xs.min(), let maxX = xs.max() else { return nil }
        let pad = 14.0
        let spanY = max(maxY - minY, 40)
        let spanX = max(maxX - minX, 60)
        let s = min((Double(size.height) - pad * 2) / spanY, (Double(size.width) - pad * 2) / spanX)
        return (s, (minX + maxX) / 2, minY)
    }

    var body: some View {
        Canvas { ctx, size in
            guard let f = frame(size) else { return }
            let pad = 14.0
            func screen(_ p: [Double]) -> CGPoint {
                guard p.count > 1 else { return .zero }
                return CGPoint(x: Double(size.width) / 2 + (p[0] - f.midX) * f.scale, y: Double(size.height) - pad - (p[1] - f.minY) * f.scale)
            }
            func shape(_ ring: [[Double]]) -> Path {
                var path = Path()
                for k in 0..<ring.count {
                    if k == 0 { path.move(to: screen(ring[k])) } else { path.addLine(to: screen(ring[k])) }
                }
                path.closeSubpath()
                return path
            }
            ctx.fill(Path(CGRect(origin: .zero, size: size)), with: .color(Self.rough))
            for r in map.fairways where r.count >= 3 { ctx.fill(shape(r), with: .color(Self.fairway)) }
            for r in map.tees where r.count >= 3 { ctx.fill(shape(r), with: .color(Self.teeBox)) }
            for r in map.water where r.count >= 3 { ctx.fill(shape(r), with: .color(Self.water)) }
            for r in map.bunkers where r.count >= 3 { ctx.fill(shape(r), with: .color(Self.bunker)) }
            if let g = map.green, g.count >= 3 {
                ctx.fill(shape(g), with: .color(Self.greenFill))
                ctx.stroke(shape(g), with: .color(.white.opacity(0.6)), lineWidth: 1)
            }
            // the playing line, dashed
            var line = Path()
            for k in 0..<map.line.count {
                if k == 0 { line.move(to: screen(map.line[k])) } else { line.addLine(to: screen(map.line[k])) }
            }
            ctx.stroke(line, with: .color(.white.opacity(0.55)), style: StrokeStyle(lineWidth: 1.5, dash: [4, 3]))
            // the flag at the end of the line
            if let end = map.line.last {
                let e = screen(end)
                var pole = Path()
                pole.move(to: e)
                pole.addLine(to: CGPoint(x: e.x, y: e.y - 12))
                ctx.stroke(pole, with: .color(.white), lineWidth: 1.5)
                var flag = Path()
                flag.move(to: CGPoint(x: e.x, y: e.y - 12))
                flag.addLine(to: CGPoint(x: e.x + 7, y: e.y - 9))
                flag.addLine(to: CGPoint(x: e.x, y: e.y - 6))
                flag.closeSubpath()
                ctx.fill(flag, with: .color(Self.flagRed))
            }
            // the player – only while on the picture
            if let p = spot {
                let q = screen(p)
                if q.x >= 0 && q.x <= size.width && q.y >= 0 && q.y <= size.height {
                    let dot = Path(ellipseIn: CGRect(x: q.x - 5, y: q.y - 5, width: 10, height: 10))
                    ctx.fill(dot, with: .color(.white))
                    ctx.stroke(dot, with: .color(brand), lineWidth: 2.5)
                }
            }
        }
        .accessibilityElement()
        .accessibilityLabel("Golf")
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
