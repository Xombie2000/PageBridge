(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.AutoEnglishShared = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  // Hiragana, Katakana, half-width Katakana, CJK extensions A/B, and common
  // unified ideographs. Japanese punctuation alone is intentionally excluded.
  const japanesePattern = /[\u3040-\u30ff\uff66-\uff9f\u3400-\u4dbf\u4e00-\u9fff\u{20000}-\u{2fa1f}]/u;
  // TranslationSession may localize currency values instead of only translating
  // their labels. Keep price-bearing text verbatim so an amount such as
  // "￥42,999（税込）" never becomes a longer, layout-breaking USD value.
  const yenAmountPattern = /(?:[¥￥]\s*[\d０-９]|[\d０-９][\d０-９,，.．\s]*\s*円)/u;
  const priceQualifierPattern = /(?:税込|税抜|税別|送料込)/u;
  const shoppingTerms = Object.freeze([
    ["カートに入れる", "Add to Cart"],
    ["今すぐ買う", "Buy Now"],
    ["在庫状況", "Inventory status"],
    ["数量", "Quantity"],
    ["ホワイトウォッシュ", "whitewash"],
    ["チャコールグレー", "charcoal gray"],
    ["セミシングル", "semi-single"],
    ["セミダブル", "semi-double"],
    ["ライトグレー", "light gray"],
    ["ダークグレー", "dark gray"],
    ["ウォールナット", "walnut"],
    ["アイボリー", "ivory"],
    ["ナチュラル", "natural"],
    ["ファブリック", "fabric"],
    ["コンパクト", "compact"],
    ["マットレス", "mattress"],
    ["シングル", "single"],
    ["クイーン", "queen"],
    ["ブラウン", "brown"],
    ["ブラック", "black"],
    ["ホワイト", "white"],
    ["グリーン", "green"],
    ["オレンジ", "orange"],
    ["イエロー", "yellow"],
    ["ダブル", "double"],
    ["キング", "king"],
    ["ベージュ", "beige"],
    ["ネイビー", "navy"],
    ["ブルー", "blue"],
    ["グレー", "gray"],
    ["レッド", "red"],
    ["ピンク", "pink"],
    ["スチール", "steel"],
    ["レザー", "leather"],
    ["モダン", "modern"],
    ["フレーム", "frame"],
    ["スタイル", "style"],
    ["カラー", "color"],
    ["サイズ", "size"],
    ["セット", "set"],
    ["送料無料", "free shipping"],
    ["送料込", "shipping included"],
    ["税込", "tax included"],
    ["税抜", "tax excluded"],
    ["税別", "tax excluded"],
    ["価格", "price"]
  ]);
  const blockedTags = new Set([
    "SCRIPT", "STYLE", "CODE", "PRE", "TEXTAREA", "INPUT",
    "NOSCRIPT", "TEMPLATE", "CANVAS", "SVG"
  ]);

  function containsJapanese(value) {
    return typeof value === "string" && japanesePattern.test(value);
  }

  function normalizeSource(value) {
    return String(value || "")
      .normalize("NFKC")
      .trim()
      .replace(/\s+/gu, " ");
  }

  function containsProtectedPrice(value) {
    const text = String(value || "");
    return yenAmountPattern.test(text) || (/[\d０-９]/u.test(text) && priceQualifierPattern.test(text));
  }

  function shouldTranslateText(value) {
    return containsJapanese(value) && !containsProtectedPrice(value);
  }

  function applyLocalGlossary(value) {
    let result = String(value || "");
    const deliverySuffix = "にお届け";
    if (result.endsWith(deliverySuffix)) {
      const destination = result.slice(0, -deliverySuffix.length).trim();
      result = destination ? `Deliver to ${destination}` : "Deliver";
    }
    for (const [source, target] of shoppingTerms) {
      if (result.includes(source)) result = result.split(source).join(target);
    }
    return result;
  }

  function domainFromURL(value) {
    try {
      const parsed = new URL(value);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "";
      let hostname = parsed.hostname.toLowerCase().replace(/\.$/, "");
      if (hostname.startsWith("www.")) hostname = hostname.slice(4);
      return hostname;
    } catch (_) {
      return "";
    }
  }

  function shouldTranslateURL(settings, value) {
    const domain = domainFromURL(value);
    if (!domain) return false;
    const overrides = settings && settings.siteOverrides;
    if (overrides && typeof overrides[domain] === "boolean") return overrides[domain];
    return true;
  }

  function isEditable(element) {
    if (!element) return false;
    if (element.isContentEditable) return true;
    if (typeof element.getAttribute !== "function") return false;
    const attribute = element.getAttribute("contenteditable");
    return attribute !== null && attribute.toLowerCase() !== "false";
  }

  function isBlockedElement(element, getStyle) {
    for (let current = element; current; current = current.parentElement) {
      const tag = String(current.tagName || "").toUpperCase();
      if (blockedTags.has(tag)) return true;
      if (isEditable(current)) return true;
      if (current.hidden) return true;
      // aria-hidden controls the accessibility tree, not visual rendering.
      // Sites such as Amazon deliberately put it on visible duplicate labels.

      if (getStyle) {
        const style = getStyle(current);
        if (style && (
          style.display === "none" ||
          style.visibility === "hidden" ||
          style.visibility === "collapse" ||
          style.contentVisibility === "hidden"
        )) return true;
      }
    }
    return false;
  }

  return {
    blockedTags,
    applyLocalGlossary,
    containsJapanese,
    containsProtectedPrice,
    domainFromURL,
    isBlockedElement,
    isEditable,
    normalizeSource,
    shouldTranslateText,
    shouldTranslateURL
  };
});
