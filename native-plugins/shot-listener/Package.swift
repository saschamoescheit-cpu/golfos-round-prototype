// swift-tools-version: 5.9
// GolfOS' own iOS plugin: the shot by sound with the phone locked (Sascha 01.11.2026). Found by `cap sync` through
// package.json ("capacitor"), as the plugins from npm. ShotCore is the detector alone – its tests run on a Mac of
// GitHub (.github/workflows/ios.yml) against the website's test sounds.
import PackageDescription

let package = Package(
    name: "GolfosShotListener",
    platforms: [.iOS(.v15), .macOS(.v12)],
    products: [
        .library(name: "GolfosShotListener", targets: ["ShotListenerPlugin"])
    ],
    dependencies: [
        .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", from: "8.0.0")
    ],
    targets: [
        .target(name: "ShotCore", path: "ios/Sources/ShotCore"),
        .target(
            name: "ShotListenerPlugin",
            // Capacitor only for the phone: on the Mac that runs the tests the plugin is empty (#if os(iOS))
            dependencies: [
                "ShotCore",
                .product(name: "Capacitor", package: "capacitor-swift-pm", condition: .when(platforms: [.iOS])),
                .product(name: "Cordova", package: "capacitor-swift-pm", condition: .when(platforms: [.iOS]))
            ],
            path: "ios/Sources/ShotListenerPlugin"),
        .testTarget(name: "ShotCoreTests", dependencies: ["ShotCore"], path: "ios/Tests/ShotCoreTests")
    ]
)
