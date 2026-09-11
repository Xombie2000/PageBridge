import SafariServices
import SwiftUI
import Translation

struct ContentView: View {
    private static let extensionIdentifier = "com.example.PageBridge.Extension"
    private let japanese = Locale.Language(identifier: "ja")
    private let english = Locale.Language(identifier: "en")

    @State private var configuration: TranslationSession.Configuration?
    @State private var status = "Checking languages…"
    @State private var isInstalled = false
    @State private var isPreparing = false
    @State private var showsPrivacy = false

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("PageBridge")
                .font(.title2.weight(.semibold))

            Text("Japanese → English, privately on this Mac")
                .foregroundStyle(.secondary)

            HStack(spacing: 8) {
                Image(systemName: isInstalled ? "checkmark.circle.fill" : "arrow.down.circle")
                    .foregroundStyle(isInstalled ? .green : .secondary)
                Text(status)
            }

            Button(isInstalled ? "Languages Installed" : "Download Languages") {
                isPreparing = true
                status = "Waiting for Apple Translation…"
                if configuration == nil {
                    configuration = TranslationSession.Configuration(source: japanese, target: english)
                } else {
                    configuration?.invalidate()
                }
            }
            .disabled(isInstalled || isPreparing)

            Button("Open Safari Extension Settings") {
                SFSafariApplication.showPreferencesForExtension(withIdentifier: Self.extensionIdentifier) { error in
                    if let error {
                        Task { @MainActor in status = error.localizedDescription }
                    }
                }
            }

            Button("Privacy") {
                showsPrivacy = true
            }

            Text("After enabling PageBridge in Safari, Japanese pages translate automatically. No account, server, or API key is used.")
                .font(.caption)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(22)
        .frame(width: 390)
        .task { await refreshAvailability() }
        .translationTask(configuration) { session in
            do {
                try await session.prepareTranslation()
                await MainActor.run {
                    isInstalled = true
                    isPreparing = false
                    status = "Japanese and English are installed."
                }
            } catch {
                await MainActor.run {
                    isPreparing = false
                    status = error.localizedDescription
                }
            }
        }
        .sheet(isPresented: $showsPrivacy) {
            PrivacyView()
        }
    }

    private func refreshAvailability() async {
        let availability = LanguageAvailability()
        let current = await availability.status(from: japanese, to: english)
        await MainActor.run {
            isInstalled = current == .installed
            status = isInstalled
                ? "Japanese and English are installed."
                : "One-time language download required."
        }
    }
}

private struct PrivacyView: View {
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Privacy")
                .font(.title2.weight(.semibold))

            Text("PageBridge does not collect, transmit, sell, or share personal data. Webpage text, translation results, cached translations, and site preferences remain on this Mac.")

            Text("The only network activity outside the websites you visit may occur when macOS downloads Japanese and English language resources for Apple’s Translation framework.")

            Button("Done") {
                dismiss()
            }
            .keyboardShortcut(.defaultAction)
        }
        .padding(22)
        .frame(width: 430)
    }
}
