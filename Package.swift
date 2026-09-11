// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "AutoEnglishNativeCore",
    platforms: [.macOS(.v15)],
    products: [
        .library(name: "AutoEnglishNativeCore", targets: ["AutoEnglishNativeCore"])
    ],
    targets: [
        .target(name: "AutoEnglishNativeCore", path: "SharedNative"),
        .testTarget(
            name: "AutoEnglishNativeCoreTests",
            dependencies: ["AutoEnglishNativeCore"],
            path: "Tests/Native"
        )
    ]
)
