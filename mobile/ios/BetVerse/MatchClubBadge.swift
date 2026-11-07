import SwiftUI
import UIKit

struct MatchClubBadge: View {
    let name: String

    var body: some View {
        HStack(spacing: 10) {
            if let artwork = Self.image(for: name) {
                Image(uiImage: artwork)
                    .resizable()
                    .scaledToFit()
                    .frame(width: 44, height: 29)
                    .accessibilityHidden(true)
            }
            Text(name).font(.headline)
        }
    }

    private static let directory = Bundle.main.resourceURL?
        .appendingPathComponent("club-badges", isDirectory: true)
    private static let images = NSCache<NSString, UIImage>()
    private static let paths: [String: String] = {
        guard let url = directory?.appendingPathComponent("catalog.json"),
              let data = try? Data(contentsOf: url),
              let catalog = try? JSONDecoder().decode([String: [String]].self, from: data) else {
            return [:]
        }
        var paths: [String: String] = [:]
        for (path, names) in catalog {
            for name in names { paths[normalize(name)] = path }
        }
        return paths
    }()

    private static func normalize(_ name: String) -> String {
        name.folding(options: .diacriticInsensitive, locale: Locale(identifier: "en_US_POSIX"))
            .lowercased()
            .replacingOccurrences(of: "[^a-z0-9]", with: "", options: .regularExpression)
    }

    private static func image(for name: String) -> UIImage? {
        guard let path = paths[normalize(name)], let url = directory?.appendingPathComponent(path) else {
            return nil
        }
        if let image = images.object(forKey: path as NSString) { return image }
        guard let image = UIImage(contentsOfFile: url.path) else { return nil }
        images.setObject(image, forKey: path as NSString)
        return image
    }
}
