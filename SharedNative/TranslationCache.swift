import Foundation

public enum TranslationText {
    public static func normalized(_ source: String) -> String {
        source
            .precomposedStringWithCompatibilityMapping
            .split(whereSeparator: \Character.isWhitespace)
            .joined(separator: " ")
    }
}

public actor TranslationCache {
    private struct Entry: Codable {
        var translation: String
        var lastUsed: TimeInterval
    }

    private let fileURL: URL
    private let limit: Int
    private var entries: [String: Entry]

    public init(fileURL: URL? = nil, limit: Int = 5_000) {
        self.fileURL = fileURL ?? Self.defaultFileURL()
        self.limit = max(1, limit)
        self.entries = Self.load(from: self.fileURL)
    }

    public func value(for source: String) -> String? {
        let key = TranslationText.normalized(source)
        guard var entry = entries[key] else { return nil }
        entry.lastUsed = Date.timeIntervalSinceReferenceDate
        entries[key] = entry
        return entry.translation
    }

    public func values(for sources: [String]) -> [String: String] {
        let now = Date.timeIntervalSinceReferenceDate
        var result: [String: String] = [:]
        for source in sources {
            let key = TranslationText.normalized(source)
            guard var entry = entries[key] else { continue }
            entry.lastUsed = now
            entries[key] = entry
            result[key] = entry.translation
        }
        return result
    }

    public func insert(_ translation: String, for source: String) throws {
        let key = TranslationText.normalized(source)
        guard !key.isEmpty else { return }
        entries[key] = Entry(translation: translation, lastUsed: Date.timeIntervalSinceReferenceDate)
        evictIfNeeded()
        try persist()
    }

    public func insert(_ values: [String: String]) throws {
        let now = Date.timeIntervalSinceReferenceDate
        for (source, translation) in values {
            let key = TranslationText.normalized(source)
            if !key.isEmpty { entries[key] = Entry(translation: translation, lastUsed: now) }
        }
        evictIfNeeded()
        try persist()
    }

    public func removeAll() throws {
        entries.removeAll(keepingCapacity: false)
        try persist()
    }

    private func evictIfNeeded() {
        let excess = entries.count - limit
        guard excess > 0 else { return }
        for key in entries.sorted(by: { $0.value.lastUsed < $1.value.lastUsed }).prefix(excess).map(\.key) {
            entries.removeValue(forKey: key)
        }
    }

    private func persist() throws {
        let directory = fileURL.deletingLastPathComponent()
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let data = try JSONEncoder().encode(entries)
        try data.write(to: fileURL, options: [.atomic, .completeFileProtection])
    }

    private static func load(from fileURL: URL) -> [String: Entry] {
        guard let data = try? Data(contentsOf: fileURL),
              let decoded = try? JSONDecoder().decode([String: Entry].self, from: data) else {
            return [:]
        }
        return decoded
    }

    private static func defaultFileURL() -> URL {
        let base = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first
            ?? FileManager.default.temporaryDirectory
        return base.appendingPathComponent("AutoEnglish", isDirectory: true)
            .appendingPathComponent("translations-v1.json", isDirectory: false)
    }
}
