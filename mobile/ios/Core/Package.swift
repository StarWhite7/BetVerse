// swift-tools-version: 5.9
import PackageDescription
let package = Package(name: "BetVerseCore", platforms: [.iOS(.v17), .macOS(.v13)], products: [.library(name: "BetVerseCore", targets: ["BetVerseCore"])], targets: [.target(name: "BetVerseCore"), .testTarget(name: "BetVerseCoreTests", dependencies: ["BetVerseCore"])])
