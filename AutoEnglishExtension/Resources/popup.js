(async function () {
  "use strict";
  const ext = globalThis.browser || globalThis.chrome;
  const Shared = globalThis.AutoEnglishShared;
  const site = document.getElementById("site");
  const status = document.getElementById("status");
  const [tab] = await ext.tabs.query({ active: true, currentWindow: true });
  const url = tab && tab.url ? tab.url : "";
  const domain = Shared.domainFromURL(url);

  function setStatus(text) { status.textContent = text || ""; }
  async function notifyPage(type) {
    if (!tab || !tab.id) return;
    try { await ext.tabs.sendMessage(tab.id, { type }); } catch (_) { /* Safari internal pages have no content script. */ }
  }

  const state = await ext.runtime.sendMessage({ type: "getSettings" });
  site.checked = Boolean(domain && Shared.shouldTranslateURL(state.settings, url));
  site.disabled = !domain;
  if (state.lastNativeStatus && state.lastNativeStatus.needsSetup) {
    setStatus("Open PageBridge once to download Japanese and English.");
  }

  site.addEventListener("change", async () => {
    await ext.runtime.sendMessage({ type: "setSiteTranslation", url, value: site.checked });
    await notifyPage("settingsChanged");
  });

  document.getElementById("translate").addEventListener("click", async () => {
    setStatus("");
    await notifyPage("translateNow");
    window.close();
  });

  document.getElementById("original").addEventListener("click", async () => {
    await notifyPage("showOriginal");
    window.close();
  });
})();
