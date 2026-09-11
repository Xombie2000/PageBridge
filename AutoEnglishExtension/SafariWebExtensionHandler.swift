import Foundation
import SafariServices
import Translation

final class SafariWebExtensionHandler: NSObject, NSExtensionRequestHandling {
    func beginRequest(with context: NSExtensionContext) {
        guard let extensionItem = context.inputItems.first as? NSExtensionItem,
              let message = extensionItem.userInfo?[SFExtensionMessageKey] as? [String: Any],
              message["type"] as? String == "translate",
              let rawItems = message["items"] as? [[String: Any]] else {
            complete(context, with: ["ok": false, "error": "Invalid native message."])
            return
        }

        let items = rawItems.prefix(64).compactMap { value -> TranslationInput? in
            guard let id = value["id"] as? String,
                  let text = value["text"] as? String,
                  !id.isEmpty,
                  !text.isEmpty,
                  text.count <= 12_000 else { return nil }
            return TranslationInput(id: id, text: text)
        }

        Task {
            do {
                let translations = try await TranslationService.shared.translate(items)
                let payload = translations.map { ["id": $0.id, "text": $0.text] }
                complete(context, with: ["ok": true, "translations": payload])
            } catch {
                let needsSetup: Bool
                if let serviceError = error as? TranslationServiceError,
                   case .modelsNotInstalled = serviceError {
                    needsSetup = true
                } else {
                    needsSetup = TranslationError.notInstalled ~= error
                }
                complete(context, with: [
                    "ok": false,
                    "needsSetup": needsSetup,
                    "error": needsSetup
                        ? "Open PageBridge once to download Japanese and English."
                        : error.localizedDescription
                ])
            }
        }
    }

    private func complete(_ context: NSExtensionContext, with message: [String: Any]) {
        let response = NSExtensionItem()
        response.userInfo = [SFExtensionMessageKey: message]
        context.completeRequest(returningItems: [response])
    }
}
