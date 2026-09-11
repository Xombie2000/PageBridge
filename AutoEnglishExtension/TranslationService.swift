import Foundation
import Translation

struct TranslationInput: Sendable {
    let id: String
    let text: String
}

struct TranslationOutput: Sendable {
    let id: String
    let text: String
}

enum TranslationServiceError: LocalizedError {
    case modelsNotInstalled
    case incompleteResponse

    var errorDescription: String? {
        switch self {
        case .modelsNotInstalled:
            "Japanese and English must be downloaded in PageBridge first."
        case .incompleteResponse:
            "Apple Translation did not return every requested string."
        }
    }
}

actor TranslationService {
    static let shared = TranslationService()

    private let cache: TranslationCache
    private let source = Locale.Language(identifier: "ja")
    private let target = Locale.Language(identifier: "en")
    private var session: TranslationSession?

    init(cache: TranslationCache = TranslationCache()) {
        self.cache = cache
    }

    func translate(_ items: [TranslationInput]) async throws -> [TranslationOutput] {
        var uniqueSources: [String] = []
        var seen = Set<String>()

        for item in items {
            let source = TranslationText.normalized(item.text)
            guard !source.isEmpty else { continue }
            if seen.insert(source).inserted { uniqueSources.append(source) }
        }
        var translatedBySource = await cache.values(for: uniqueSources)
        let missingSources = uniqueSources.filter { translatedBySource[$0] == nil }

        if !missingSources.isEmpty {
            let session = try await readySession()

            let requests = missingSources.map {
                TranslationSession.Request(sourceText: $0, clientIdentifier: $0)
            }
            var newValues: [String: String] = [:]
            do {
                for try await response in session.translate(batch: requests) {
                    guard let key = response.clientIdentifier else { continue }
                    translatedBySource[key] = response.targetText
                    newValues[key] = response.targetText
                }
            } catch {
                self.session = nil
                throw error
            }
            guard newValues.count == missingSources.count else {
                throw TranslationServiceError.incompleteResponse
            }
            try await cache.insert(newValues)
        }

        return items.compactMap { item in
            let key = TranslationText.normalized(item.text)
            guard let text = translatedBySource[key] else { return nil }
            return TranslationOutput(id: item.id, text: text)
        }
    }

    private func readySession() async throws -> TranslationSession {
        if let session, await session.isReady { return session }

        // Keep one warm session for the lifetime of the native extension process.
        // Recreating it for every small web-extension message repeatedly pays the
        // model setup cost even when the languages are already installed.
        let session = TranslationSession(installedSource: source, target: target)
        guard await session.isReady else { throw TranslationServiceError.modelsNotInstalled }
        self.session = session
        return session
    }
}
