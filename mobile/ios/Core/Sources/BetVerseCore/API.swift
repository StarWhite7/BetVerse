import Foundation
import Security

public enum APIError: Error, LocalizedError {
    case invalidOrigin, invalidPath, response(Int, String), transport
    public var errorDescription: String? {
        switch self {
        case .invalidOrigin: return "Une origine HTTPS exacte est requise."
        case .invalidPath: return "Chemin de requête invalide."
        case .response(_, let message): return message
        case .transport: return "Connexion interrompue. Vérifiez le statut du ticket avant de réessayer."
        }
    }
}
public protocol Vault: Sendable {
    func read(_ key: String) -> Data?
    func write(_ key: String, _ data: Data?) throws
}
public struct KeychainVault: Vault {
    private let service: String
    public init(service: String) { self.service = service }
    private func query(_ key: String) -> [String: Any] {
        [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: key]
    }
    public func read(_ key: String) -> Data? {
        var request = query(key); request[kSecReturnData as String] = true; request[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: CFTypeRef?
        guard SecItemCopyMatching(request as CFDictionary, &result) == errSecSuccess else { return nil }
        return result as? Data
    }
    public func write(_ key: String, _ data: Data?) throws {
        let request = query(key)
        guard let data else { SecItemDelete(request as CFDictionary); return }
        let status = SecItemUpdate(request as CFDictionary, [kSecValueData as String: data] as CFDictionary)
        if status == errSecItemNotFound {
            var insertion = request; insertion[kSecValueData as String] = data
            insertion[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
            guard SecItemAdd(insertion as CFDictionary, nil) == errSecSuccess else { throw APIError.transport }
        } else if status != errSecSuccess { throw APIError.transport }
    }
}
public protocol Transport: Sendable {
    func send(_ request: URLRequest) async throws -> (Data, HTTPURLResponse)
}
private final class NoRedirects: NSObject, URLSessionTaskDelegate, @unchecked Sendable {
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) { completionHandler(nil) }
}
public final class SecureTransport: Transport, @unchecked Sendable {
    private let session: URLSession
    private let delegate = NoRedirects()
    public init() {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.httpShouldSetCookies = false; configuration.httpCookieStorage = nil
        configuration.urlCache = nil; configuration.requestCachePolicy = .reloadIgnoringLocalCacheData
        configuration.timeoutIntervalForRequest = 20; configuration.timeoutIntervalForResource = 25
        session = URLSession(configuration: configuration, delegate: delegate, delegateQueue: nil)
    }
    public func send(_ request: URLRequest) async throws -> (Data, HTTPURLResponse) {
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse, data.count <= 4 * 1024 * 1024 else { throw APIError.transport }
        return (data, http)
    }
}
public actor API {
    public let origin: String
    private let base: URL, vault: any Vault, transport: any Transport
    private var csrf: String?
    public init(origin: String, vault: any Vault, transport: any Transport = SecureTransport()) throws {
        guard let url = URL(string: origin), url.scheme == "https", url.host != nil,
              url.user == nil, url.password == nil, url.query == nil, url.fragment == nil,
              url.path.isEmpty, url.absoluteString == origin else { throw APIError.invalidOrigin }
        self.origin = origin; base = url; self.vault = vault; self.transport = transport
    }
    public func request(_ path: String, method: String = "GET", body: Data? = nil, idempotency: String? = nil) async throws -> Data {
        guard path.hasPrefix("/api/"), !path.contains(".."), !path.contains("%"), !path.contains("#"), !path.contains("\\"), let url = URL(string: origin + path), url.host == base.host, url.port == base.port else { throw APIError.invalidPath }
        var request = URLRequest(url: url); request.httpMethod = method
        request.setValue(origin, forHTTPHeaderField: "Origin")
        request.setValue("BetVerse", forHTTPHeaderField: "X-Requested-With")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if let body { request.httpBody = body; request.setValue("application/json", forHTTPHeaderField: "Content-Type") }
        if let csrf { request.setValue(csrf, forHTTPHeaderField: "X-CSRF-Token") }
        if let cookie = vault.read("session"), let value = String(data: cookie, encoding: .utf8) { request.setValue(value, forHTTPHeaderField: "Cookie") }
        if let idempotency { request.setValue(idempotency, forHTTPHeaderField: "Idempotency-Key") }
        let data: Data, response: HTTPURLResponse
        do { (data, response) = try await transport.send(request) } catch { throw APIError.transport }
        guard (200...299).contains(response.statusCode) else {
            if response.statusCode == 401 { csrf = nil; try vault.write("session", nil) }
            let message = (try? JSONSerialization.jsonObject(with: data) as? [String: Any])?["message"] as? String
            throw APIError.response(response.statusCode, message ?? "Requête refusée (\(response.statusCode)).")
        }
        if let header = response.value(forHTTPHeaderField: "Set-Cookie") {
            for cookie in HTTPCookie.cookies(withResponseHeaderFields: ["Set-Cookie": header], for: base) where cookie.name == "__Host-betverse_session" && cookie.isSecure {
                try vault.write("session", cookie.expiresDate.map { $0 < Date() } == true || cookie.value.isEmpty ? nil : Data("\(cookie.name)=\(cookie.value)".utf8))
            }
        }
        if let token = response.value(forHTTPHeaderField: "X-CSRF-Token"), !token.isEmpty { csrf = token }
        if let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any], let token = object["csrfToken"] as? String { csrf = token }
        if path == "/api/auth/logout" { csrf = nil; try vault.write("session", nil) }
        return data
    }
    public func savePrivate(_ key: String, data: Data?) throws { try vault.write(key, data) }
    public func privateData(_ key: String) -> Data? { vault.read(key) }
    public func clearSession() throws { csrf = nil; try vault.write("session", nil) }
}

public struct Selection: Codable, Identifiable, Equatable, Sendable {
    public let matchId: String, match: String, betType: String
    public let odds: Decimal
    public var id: String { matchId }
    public init(matchId: String, match: String, betType: String, odds: Decimal) { self.matchId = matchId; self.match = match; self.betType = betType; self.odds = odds }
}
public enum Coupon {
    public static func toggled(_ rows: [Selection], _ row: Selection) -> [Selection] {
        var result = rows
        if let index = result.firstIndex(where: { $0.matchId == row.matchId }) {
            if result[index].betType == row.betType { result.remove(at: index) } else { result[index] = row }
        } else if result.count < 10 { result.append(row) }
        return result
    }
    public static func odds(_ rows: [Selection]) -> Decimal {
        var value = rows.reduce(Decimal(1)) { $0 * $1.odds }, rounded = Decimal()
        NSDecimalRound(&rounded, &value, 2, .plain); return rounded
    }
    public static func payout(stake: Int, rows: [Selection]) -> Decimal {
        var value = Decimal(stake) * odds(rows), rounded = Decimal()
        NSDecimalRound(&rounded, &value, 0, .plain); return rounded
    }
}
