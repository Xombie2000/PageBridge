"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Shared = require("../../AutoEnglishExtension/Resources/shared.js");

function element(tagName, options = {}, parentElement = null) {
  const attributes = options.attributes || {};
  return {
    tagName,
    parentElement,
    hidden: Boolean(options.hidden),
    isContentEditable: Boolean(options.isContentEditable),
    getAttribute(name) { return Object.hasOwn(attributes, name) ? attributes[name] : null; },
    styleForTest: options.style || {}
  };
}

test("Japanese detection covers kana, kanji, and supplementary ideographs", () => {
  assert.equal(Shared.containsJapanese("おすすめ商品"), true);
  assert.equal(Shared.containsJapanese("カメラ 123"), true);
  assert.equal(Shared.containsJapanese("ﾆﾄﾘ"), true);
  assert.equal(Shared.containsJapanese("English only 123"), false);
  assert.equal(Shared.containsJapanese("？！"), false);
});

test("source normalization is deterministic for cache keys", () => {
  assert.equal(Shared.normalizeSource("  商品\n  価格  "), "商品 価格");
  assert.equal(Shared.normalizeSource("Ａｍａｚｏｎ"), "Amazon");
});

test("price-bearing text is preserved instead of currency-converted", () => {
  assert.equal(Shared.containsProtectedPrice("￥42,999（税込）"), true);
  assert.equal(Shared.containsProtectedPrice("価格 42,999円"), true);
  assert.equal(Shared.containsProtectedPrice("2,980 税別"), true);
  assert.equal(Shared.shouldTranslateText("￥42,999（税込）"), false);
  assert.equal(Shared.shouldTranslateText("サイズ: ダブル"), true);
  assert.equal(Shared.shouldTranslateText("組立時間は2時間です"), true);
});

test("local shopping glossary resolves isolated katakana options", () => {
  assert.equal(Shared.applyLocalGlossary("シングル"), "single");
  assert.equal(Shared.applyLocalGlossary("セミダブル"), "semi-double");
  assert.equal(Shared.applyLocalGlossary("ダブル"), "double");
  assert.equal(
    Shared.applyLocalGlossary("チャコールグレー×ブラック USD279.92"),
    "charcoal gray×black USD279.92"
  );
  assert.equal(
    Shared.applyLocalGlossary("価格 ￥42,999（税込）"),
    "price ￥42,999（tax included）"
  );
  assert.equal(Shared.applyLocalGlossary("カートに入れる"), "Add to Cart");
  assert.equal(Shared.applyLocalGlossary("今すぐ買う"), "Buy Now");
  assert.equal(Shared.applyLocalGlossary("数量: 1"), "Quantity: 1");
  assert.equal(Shared.applyLocalGlossary("Customer - 100-0001 にお届け"), "Deliver to Customer - 100-0001");
});

test("DOM filtering rejects blocked, editable, SVG, and hidden ancestry", () => {
  const body = element("BODY");
  assert.equal(Shared.isBlockedElement(element("SPAN", {}, element("CODE", {}, body))), true);
  assert.equal(Shared.isBlockedElement(element("SPAN", {}, element("SVG", {}, body))), true);
  assert.equal(Shared.isBlockedElement(element("SPAN", {}, element("DIV", { isContentEditable: true }, body))), true);
  // aria-hidden only removes content from the accessibility tree; it does not
  // mean the element is visually hidden (Amazon uses it on visible labels).
  assert.equal(Shared.isBlockedElement(element("SPAN", {}, element("DIV", { attributes: { "aria-hidden": "true" } }, body))), false);
  assert.equal(Shared.isBlockedElement(element("SPAN", {}, element("DIV", { style: { display: "none" } }, body)), (node) => node.styleForTest), true);
  assert.equal(Shared.isBlockedElement(element("SPAN", {}, body), (node) => node.styleForTest), false);
  assert.equal(Shared.isBlockedElement(element("OPTION", {}, element("SELECT", {}, body))), false);
  assert.equal(Shared.isBlockedElement(element("SPAN", {}, element("INPUT", {}, body))), true);
});

test("domain rules translate by default and honor per-site opt-outs", () => {
  assert.equal(Shared.domainFromURL("https://WWW.Amazon.co.jp/gp/product/1"), "amazon.co.jp");
  assert.equal(Shared.shouldTranslateURL({ siteOverrides: {} }, "https://example.com"), true);
  assert.equal(Shared.shouldTranslateURL({ siteOverrides: { "amazon.co.jp": false } }, "https://www.amazon.co.jp/x"), false);
  assert.equal(Shared.shouldTranslateURL({ siteOverrides: { "amazon.co.jp": false } }, "https://yodobashi.com/x"), true);
  assert.equal(Shared.shouldTranslateURL({ siteOverrides: {} }, "safari-extension://popup"), false);
});
