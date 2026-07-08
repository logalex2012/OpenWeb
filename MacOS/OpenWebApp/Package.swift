// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "OpenWebApp",
    platforms: [.macOS(.v14)],
    targets: [
        .executableTarget(
            name: "OpenWebApp",
            path: "Sources/OpenWebApp"
        )
    ]
)
