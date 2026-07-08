import Foundation

enum APIError: LocalizedError {
    case server(String, status: Int)
    case network(Error)
    case decoding(Error)
    case unauthorized
    case invalidURL

    var errorDescription: String? {
        switch self {
        case .server(let message, _): return message
        case .network(let error): return error.localizedDescription
        case .decoding(let error): return "Ошибка обработки ответа сервера: \(error.localizedDescription)"
        case .unauthorized: return "Требуется авторизация"
        case .invalidURL: return "Некорректный адрес запроса"
        }
    }
}

struct OKResponse: Codable { let ok: Bool }

private struct ErrorBody: Codable { let error: String? }

/// Kept outside APIClient (which is @MainActor) so the JSONDecoder's date-parsing
/// closure — required to be non-isolated/Sendable — can reference these freely.
private enum APIDateCoding {
    static let isoFractional: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()

    static let isoPlain: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime]
        return f
    }()

    static let decoder: JSONDecoder = {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .custom { decoder in
            let container = try decoder.singleValueContainer()
            let str = try container.decode(String.self)
            if let date = isoFractional.date(from: str) { return date }
            if let date = isoPlain.date(from: str) { return date }
            throw DecodingError.dataCorruptedError(in: container, debugDescription: "Unrecognized date format: \(str)")
        }
        return decoder
    }()
}

@MainActor
final class APIClient {
    static let shared = APIClient()

    let baseURL = URL(string: "https://open-web-three.vercel.app")!
    private let session: URLSession
    private(set) var csrfToken: String = ""
    var onUnauthorized: (() -> Void)?

    private init() {
        let config = URLSessionConfiguration.default
        config.httpCookieStorage = HTTPCookieStorage.shared
        config.httpCookieAcceptPolicy = .always
        session = URLSession(configuration: config)
    }

    private static let encoder = JSONEncoder()

    private static let csrfExemptPaths: Set<String> = [
        "/api/auth/login", "/api/auth/register", "/api/auth/logout", "/api/csrf-token",
    ]

    private func isExempt(_ path: String) -> Bool {
        if Self.csrfExemptPaths.contains(path) { return true }
        if path.hasPrefix("/api/invite/") && path.hasSuffix("/accept") { return true }
        return false
    }

    func setCSRFToken(_ token: String) {
        csrfToken = token
    }

    /// Fetches a CSRF token for the current session. Needed on cold start when a session
    /// cookie already exists (persisted from a previous launch) but we have no token in memory yet.
    func bootstrapCSRFToken() async {
        struct CSRFResponse: Codable { let csrf_token: String }
        if let response: CSRFResponse = try? await request("/api/csrf-token") {
            csrfToken = response.csrf_token
        }
    }

    @discardableResult
    func request<Response: Decodable>(
        _ path: String,
        method: String = "GET",
        query: [String: String] = [:],
        jsonBody: (any Encodable)? = nil
    ) async throws -> Response {
        guard var components = URLComponents(url: baseURL.appendingPathComponent(path), resolvingAgainstBaseURL: false) else {
            throw APIError.invalidURL
        }
        if !query.isEmpty {
            components.queryItems = query.map { URLQueryItem(name: $0.key, value: $0.value) }
        }
        guard let url = components.url else { throw APIError.invalidURL }

        var req = URLRequest(url: url)
        req.httpMethod = method
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if method != "GET" && !isExempt(path) && !csrfToken.isEmpty {
            req.setValue(csrfToken, forHTTPHeaderField: "X-CSRF-Token")
        }
        if let jsonBody {
            req.httpBody = try Self.encoder.encode(jsonBody)
        }

        let (data, response) = try await perform(req)
        return try decodeOrThrow(data: data, response: response)
    }

    /// multipart/form-data upload (attachments, avatar).
    @discardableResult
    func upload<Response: Decodable>(
        _ path: String,
        fileFieldName: String,
        fileURL: URL,
        mimeType: String,
        extraFields: [String: String] = [:]
    ) async throws -> Response {
        let url = baseURL.appendingPathComponent(path)
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        let boundary = "OpenWebBoundary-\(UUID().uuidString)"
        req.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        if !isExempt(path) && !csrfToken.isEmpty {
            req.setValue(csrfToken, forHTTPHeaderField: "X-CSRF-Token")
        }

        var body = Data()
        for (key, value) in extraFields {
            body.append("--\(boundary)\r\n")
            body.append("Content-Disposition: form-data; name=\"\(key)\"\r\n\r\n")
            body.append("\(value)\r\n")
        }
        let fileData = try Data(contentsOf: fileURL)
        body.append("--\(boundary)\r\n")
        body.append("Content-Disposition: form-data; name=\"\(fileFieldName)\"; filename=\"\(fileURL.lastPathComponent)\"\r\n")
        body.append("Content-Type: \(mimeType)\r\n\r\n")
        body.append(fileData)
        body.append("\r\n--\(boundary)--\r\n")
        req.httpBody = body

        let (data, response) = try await perform(req)
        return try decodeOrThrow(data: data, response: response)
    }

    private func perform(_ req: URLRequest) async throws -> (Data, URLResponse) {
        do {
            return try await session.data(for: req)
        } catch {
            throw APIError.network(error)
        }
    }

    private func decodeOrThrow<Response: Decodable>(data: Data, response: URLResponse) throws -> Response {
        let status = (response as? HTTPURLResponse)?.statusCode ?? 200

        if status == 401 {
            onUnauthorized?()
            throw APIError.unauthorized
        }
        if status >= 400 {
            let message = (try? APIDateCoding.decoder.decode(ErrorBody.self, from: data))?.error ?? "Ошибка запроса (\(status))"
            throw APIError.server(message, status: status)
        }
        if Response.self == OKResponse.self, data.isEmpty {
            return OKResponse(ok: true) as! Response
        }
        do {
            return try APIDateCoding.decoder.decode(Response.self, from: data)
        } catch {
            throw APIError.decoding(error)
        }
    }
}

private extension Data {
    mutating func append(_ string: String) {
        if let data = string.data(using: .utf8) { append(data) }
    }
}
