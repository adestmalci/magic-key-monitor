// swift-tools-version: 5.10
import PackageDescription

let package = Package(
    name: "MagicKeyDisneyWorkerTray",
    platforms: [
        .macOS(.v14)
    ],
    products: [
        .executable(name: "MagicKeyDisneyWorkerTray", targets: ["MagicKeyDisneyWorkerTray"])
    ],
    targets: [
        .executableTarget(
            name: "MagicKeyDisneyWorkerTray",
            path: "Sources"
        )
    ]
)
