"use strict";

importScripts("shared.js", "native-queue.js");
const Shared = globalThis.AutoEnglishShared;
const NativeQueue = globalThis.AutoEnglishNativeQueue;
const ext = globalThis.browser || globalThis.chrome;
const NATIVE_APP_ID = "com.example.PageBridge"; // Safari ignores this value for a containing app.
const DEFAULT_SETTINGS = Object.freeze({ siteOverrides: {} });
const HOT_CACHE_LIMIT = 2_000;
let lastStatusSignature = "";
const hotCache = new Map();

async function readSettings() {
  const stored = await ext.storage.local.get("siteOverrides");
  return {
    siteOverrides: stored.siteOverrides && typeof stored.siteOverrides === "object"
      ? stored.siteOverrides
      : DEFAULT_SETTINGS.siteOverrides
  };
}

async function writeLastStatus(status) {
  const signature = JSON.stringify([Boolean(status.ok), Boolean(status.needsSetup), String(status.error || "")]);
  if (signature === lastStatusSignature) return;
  lastStatusSignature = signature;
  await ext.storage.local.set({ lastNativeStatus: { ...status, time: Date.now() } });
}

function rememberTranslation(source, translation) {
  const key = Shared.normalizeSource(source);
  if (!key) return;
  hotCache.delete(key);
  hotCache.set(key, translation);
  while (hotCache.size > HOT_CACHE_LIMIT) hotCache.delete(hotCache.keys().next().value);
}

function hotTranslation(source) {
  const key = Shared.normalizeSource(source);
  if (!hotCache.has(key)) return undefined;
  const value = hotCache.get(key);
  hotCache.delete(key);
  hotCache.set(key, value);
  return value;
}

const nativeQueue = NativeQueue.createLatestPageQueue(async (items) => {
    try {
      const reply = await ext.runtime.sendNativeMessage(NATIVE_APP_ID, { type: "translate", items });
      if (!reply || !reply.ok) {
        const status = {
          ok: false,
          needsSetup: Boolean(reply && reply.needsSetup),
          error: reply && reply.error ? reply.error : "The native translator did not reply."
        };
        await writeLastStatus(status);
        return status;
      }
      await writeLastStatus({ ok: true, needsSetup: false, error: "" });
      return reply;
    } catch (error) {
      const status = { ok: false, needsSetup: false, error: String(error && error.message ? error.message : error) };
      await writeLastStatus(status);
      return status;
    }
});

function sendNative(items, context) {
  return nativeQueue.enqueue(items, context);
}

async function translate(items, context) {
  const cached = [];
  const missing = [];
  for (const item of items) {
    const translation = hotTranslation(item.text);
    if (translation === undefined) missing.push(item);
    else cached.push({ id: item.id, text: translation });
  }
  if (!missing.length) return { ok: true, translations: cached };

  const reply = await sendNative(missing, context);
  if (!reply || !reply.ok) return reply;
  const sourceByID = new Map(missing.map((item) => [item.id, item.text]));
  for (const item of reply.translations || []) {
    const source = sourceByID.get(item.id);
    if (source !== undefined && typeof item.text === "string") rememberTranslation(source, item.text);
  }
  return { ...reply, translations: cached.concat(reply.translations || []) };
}

ext.runtime.onInstalled.addListener(async () => {
  const current = await ext.storage.local.get("siteOverrides");
  if (!current.siteOverrides || typeof current.siteOverrides !== "object") {
    await ext.storage.local.set({ siteOverrides: {} });
  }
});

ext.runtime.onMessage.addListener((message, sender) => {
  if (!message || typeof message.type !== "string") return undefined;

  if (message.type === "translate") {
    const items = Array.isArray(message.items)
      ? message.items.filter((item) => item && typeof item.id === "string" && typeof item.text === "string").slice(0, 64)
      : [];
    const tabID = sender && sender.tab && sender.tab.id !== undefined ? sender.tab.id : null;
    const pageID = typeof message.pageID === "string" ? message.pageID : "";
    return items.length ? translate(items, {
      slot: tabID === null ? null : `tab:${tabID}`,
      page: pageID,
      active: !sender || !sender.tab || sender.tab.active !== false
    }) : Promise.resolve({ ok: true, translations: [] });
  }

  if (message.type === "getPageState") {
    return readSettings().then((settings) => ({
      settings,
      domain: Shared.domainFromURL(message.url),
      shouldTranslate: Shared.shouldTranslateURL(settings, message.url)
    }));
  }

  if (message.type === "getSettings") {
    return Promise.all([readSettings(), ext.storage.local.get("lastNativeStatus")]).then(([settings, status]) => ({
      settings,
      lastNativeStatus: status.lastNativeStatus || null
    }));
  }

  if (message.type === "setSiteTranslation") {
    return readSettings().then(async (settings) => {
      const domain = Shared.domainFromURL(message.url);
      if (!domain) return settings;
      const siteOverrides = { ...settings.siteOverrides };
      if (message.value) delete siteOverrides[domain];
      else siteOverrides[domain] = false;
      await ext.storage.local.set({ siteOverrides });
      return { siteOverrides };
    });
  }

  return undefined;
});
