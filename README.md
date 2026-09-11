# PageBridge

PageBridge is a deliberately small, macOS-only Safari Web Extension that replaces visible Japanese text nodes with English. Translation runs through Apple's on-device `Translation` framework. There is no account, subscription, analytics, ad SDK, custom server, or paid API.

## Download and install

PageBridge currently ships as source because a generally installable macOS binary must be signed and notarized through the paid Apple Developer Program. Download the latest source from the repository's [Releases page](../../releases/latest), unzip it, and open `AutoEnglish.xcodeproj` in Xcode.

In Xcode:

1. Select the **AutoEnglish** project and assign your personal Development Team to both targets under **Signing & Capabilities**. A free Apple Account is sufficient for building it for your own Mac.
2. Select the **AutoEnglish** scheme and **My Mac**, then press **Run**.
3. In PageBridge, select **Download Languages**, then **Open Safari Extension Settings**.
4. Enable PageBridge in Safari and grant it access to websites.

Do not download compiled PageBridge apps from unofficial sources. Until an official Developer ID–signed and notarized build exists, building the source in Xcode is the safe installation path.

## Requirements

- macOS 26 or later
- Safari 26 or later
- Xcode 26 or later
- Apple silicon or Intel Mac supported by those releases

The macOS 26 deployment target is intentional: PageBridge uses `TranslationSession(installedSource:target:)` so routine background translation never presents UI or silently begins a model download.

Translation work is prioritized for the active page. Pending native batches from a page that has already navigated away are discarded, preventing large shopping sites from delaying the next page.

## Build and run

1. Open `AutoEnglish.xcodeproj` in Xcode.
2. Select the **AutoEnglish** project, then set your Development Team for both the **AutoEnglish** and **AutoEnglishExtension** targets. Replace the example `com.example.PageBridge` identifiers with identifiers unique to your team, and update `ContentView.extensionIdentifier` to match the extension target.
3. Select the **AutoEnglish** scheme and **My Mac**, then press Run.
4. In the app, click **Download Languages** once. Approve Apple's Japanese and English language download if macOS asks.
5. Click **Open Safari Extension Settings**, enable **PageBridge**, and grant access to websites when Safari asks.
6. Visit a Japanese page. The default setting translates it automatically. Use the toolbar button for per-site behavior, **Translate Now**, or **Show Original**.

For local unsigned development, Safari may require **Develop > Allow Unsigned Extensions**. If the Develop menu is hidden, enable it in Safari Settings > Advanced.

## Tests

Run both suites from Terminal:

```sh
cd PageBridge
./test.sh
```

The JavaScript suite covers Japanese Unicode detection, normalization, DOM exclusion rules, and global/per-domain URL behavior. The Swift suite covers normalized lookup, disk persistence, and bounded least-recently-used cache eviction.

To compile the app and extension from Terminal when Xcode is not the active developer directory:

```sh
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer \
  xcodebuild -project AutoEnglish.xcodeproj -scheme AutoEnglish \
  -configuration Debug CODE_SIGNING_ALLOWED=NO build
```

## Design notes

- The content script changes only `Text.nodeValue`. It never replaces HTML or elements, preserving layout structure, controls, links, event listeners, and accessibility relationships.
- `script`, `style`, `code`, `pre`, editable fields, SVG, templates, canvas content, hidden ancestry, and already translated nodes are excluded. Text rendered inside images is never inspected. Non-editable submit/button labels and native select options are translated reversibly.
- DOM work runs in bounded idle slices. Visible mutations use a 50 ms leading-edge throttle while background mutations are coalesced for 300 ms, preventing busy shopping sites from starving visible updates. Repeated strings are deduplicated; viewport text uses small latency-focused batches and background work uses batches capped at 64 strings / roughly 12,000 characters.
- The native extension reuses one installed-language `TranslationSession` while its process is alive. A small in-memory hot cache avoids repeat native messages during the same Safari session, while the persistent disk cache handles later sessions.
- A local JSON cache in the native extension's sandbox stores up to 5,000 normalized source strings. The oldest entries are evicted.
- Settings use Safari extension-local storage. Automatic translation defaults on for normal websites, and disabling it stores only a per-domain opt-out.
- The only potential network activity is Apple's operating-system-managed download of Translation language models after the user approves it in the containing app.

## Known boundaries

- PageBridge translates DOM text, not text drawn into images, canvas, video, or closed shadow roots.
- It does not translate form values, placeholders, `aria-label` attributes, or other attributes because changing those can alter site behavior or accessibility semantics.
- “Show Original” lasts for the current page until **Translate Now**, a settings change that enables translation, or navigation/reload.

## License

PageBridge is available under the [MIT License](LICENSE).
