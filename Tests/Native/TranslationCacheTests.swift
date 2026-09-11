import Foundation
import XCTest
@testable import AutoEnglishNativeCore

final class TranslationCacheTests: XCTestCase {
    func testCacheNormalizesAndPersistsValues() async throws {
        let directory = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString, isDirectory: true)
        let file = directory.appendingPathComponent("cache.json")
        defer { try? FileManager.default.removeItem(at: directory) }

        let first = TranslationCache(fileURL: file, limit: 10)
        try await first.insert("Recommended products", for: "  おすすめ\n商品 ")
        let firstValue = await first.value(for: "おすすめ 商品")
        XCTAssertEqual(firstValue, "Recommended products")

        let reloaded = TranslationCache(fileURL: file, limit: 10)
        let reloadedValue = await reloaded.value(for: "おすすめ   商品")
        XCTAssertEqual(reloadedValue, "Recommended products")
    }

    func testCacheEvictsLeastRecentlyUsedEntry() async throws {
        let directory = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString, isDirectory: true)
        let file = directory.appendingPathComponent("cache.json")
        defer { try? FileManager.default.removeItem(at: directory) }

        let cache = TranslationCache(fileURL: file, limit: 2)
        try await cache.insert("one", for: "一")
        try await Task.sleep(for: .milliseconds(2))
        try await cache.insert("two", for: "二")
        _ = await cache.value(for: "一")
        try await Task.sleep(for: .milliseconds(2))
        try await cache.insert("three", for: "三")

        let one = await cache.value(for: "一")
        let two = await cache.value(for: "二")
        let three = await cache.value(for: "三")
        XCTAssertEqual(one, "one")
        XCTAssertNil(two)
        XCTAssertEqual(three, "three")
    }

    func testBatchLookupReturnsOnlyCachedNormalizedSources() async throws {
        let directory = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString, isDirectory: true)
        let file = directory.appendingPathComponent("cache.json")
        defer { try? FileManager.default.removeItem(at: directory) }

        let cache = TranslationCache(fileURL: file, limit: 10)
        try await cache.insert(["おすすめ 商品": "Recommended products", "サイズ": "Size"])

        let values = await cache.values(for: [" おすすめ\n商品 ", "サイズ", "未登録"])
        XCTAssertEqual(values["おすすめ 商品"], "Recommended products")
        XCTAssertEqual(values["サイズ"], "Size")
        XCTAssertNil(values["未登録"])
    }
}
