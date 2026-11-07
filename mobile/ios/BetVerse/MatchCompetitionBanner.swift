import SwiftUI

struct MatchCompetitionBanner: View {
    let name: String
    let sport: String

    private var artwork: (image: String, background: Color, foreground: Color)? {
        guard sport == "football" else { return nil }
        switch name.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() {
        case "ligue 1", "france": return ("ligue_1", rgb(0x12327e), .white)
        case "premier league", "epl": return ("premier_league", rgb(0x3c164b), .white)
        case "la liga", "laliga", "spain": return ("la_liga", rgb(0x792919), .white)
        case "serie a", "italy": return ("serie_a", rgb(0xf4e5c4), rgb(0x142137))
        case "bundesliga", "germany": return ("bundesliga", rgb(0x591719), .white)
        default: return nil
        }
    }

    var body: some View {
        if let artwork {
            Text(name)
                .font(.subheadline.weight(.bold))
                .foregroundStyle(artwork.foreground)
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
                .frame(maxWidth: .infinity, minHeight: 40, alignment: .leading)
                .background {
                    GeometryReader { geometry in
                        ZStack(alignment: .trailing) {
                            artwork.background
                            Image(artwork.image)
                                .resizable()
                                .scaledToFill()
                                .frame(
                                    width: geometry.size.width * 0.65,
                                    height: geometry.size.height,
                                    alignment: .trailing
                                )
                                .clipped()
                                .accessibilityHidden(true)
                            LinearGradient(
                                stops: [
                                    .init(color: artwork.background, location: 0.45),
                                    .init(color: artwork.background.opacity(0), location: 0.70)
                                ],
                                startPoint: .leading,
                                endPoint: .trailing
                            )
                        }
                    }
                }
                .clipShape(RoundedRectangle(cornerRadius: 8))
        } else {
            Text(name).font(.caption).foregroundStyle(.secondary)
        }
    }

    private func rgb(_ hex: UInt32) -> Color {
        Color(
            red: Double((hex >> 16) & 0xff) / 255,
            green: Double((hex >> 8) & 0xff) / 255,
            blue: Double(hex & 0xff) / 255
        )
    }
}
