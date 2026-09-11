(function () {
  "use strict";

  const Shared = globalThis.AutoEnglishShared;
  const ext = globalThis.browser || globalThis.chrome;
  if (!Shared || !ext || !document.documentElement) return;

  const FOREGROUND_BATCH_ITEMS = 12;
  const BACKGROUND_BATCH_ITEMS = 64;
  const MAX_BATCH_CHARACTERS = 12000;
  const FOREGROUND_MARGIN_PX = 320;
  const FOREGROUND_MUTATION_DELAY_MS = 50;
  const MUTATION_DEBOUNCE_MS = 300;
  const pageID = (globalThis.crypto && crypto.randomUUID) ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;

  const stateByNode = new WeakMap();
  const stateByID = new Map();
  const queuedBySource = new Map();
  const dirtyRoots = new Set();
  const urgentRoots = new Set();
  let nextID = 1;
  let enabled = false;
  let showingOriginal = false;
  let flushTimer = 0;
  let flushRunning = false;
  let mutationTimer = 0;
  let urgentMutationTimer = 0;
  let scanGeneration = 0;

  function stableState(node) {
    let state = stateByNode.get(node);
    if (!state) {
      state = { id: `${pageID}:${nextID++}`, node, original: "", translated: null, pending: false, failures: 0 };
      stateByNode.set(node, state);
      stateByID.set(state.id, state);
    }
    return state;
  }

  function isNearViewport(rect, margin = FOREGROUND_MARGIN_PX) {
    return rect.bottom >= -margin &&
      rect.right >= -margin &&
      rect.top <= globalThis.innerHeight + margin &&
      rect.left <= globalThis.innerWidth + margin;
  }

  function visibilityForTextNode(node, scanCache) {
    const parent = node.parentElement;
    if (!parent || !node.nodeValue || !Shared.containsJapanese(node.nodeValue)) return null;

    const getStyle = (element) => {
      if (scanCache.styles.has(element)) return scanCache.styles.get(element);
      const style = getComputedStyle(element);
      scanCache.styles.set(element, style);
      return style;
    };
    let blocked = scanCache.blocked.get(parent);
    if (blocked === undefined) {
      blocked = Shared.isBlockedElement(parent, getStyle);
      scanCache.blocked.set(parent, blocked);
    }
    if (blocked) return null;

    // Native select menus render option text outside the normal DOM box tree,
    // so use the select's rectangle when deciding whether an option is visible.
    const select = parent.tagName === "OPTION" ? parent.closest("select") : null;
    let rect;
    if (select) {
      rect = select.getBoundingClientRect();
    } else {
      // Range rectangles avoid offsetParent false negatives for fixed/contents elements.
      const range = document.createRange();
      range.selectNodeContents(node);
      rect = range.getBoundingClientRect();
      range.detach();
    }
    if (rect.width <= 0 || rect.height <= 0) return null;
    return { foreground: isNearViewport(rect) };
  }

  function queueTarget(node, current, visibility) {
    if (!enabled || showingOriginal || !node.isConnected || !visibility) return;
    const state = stableState(node);
    if (state.translated !== null && current === state.translated) return;
    if (state.pending && current === state.original) return;
    if (state.translated === null && current === state.original && state.failures >= 2) return;

    // A site changed a previously translated Text node. Keep its stable ID but
    // treat the new Japanese content as a new source value.
    if (state.original !== current) state.failures = 0;
    state.original = current;
    state.translated = null;
    state.pending = true;

    const source = Shared.normalizeSource(current);
    if (!source || source.length > 12_000) {
      state.pending = false;
      return;
    }

    const localTranslation = Shared.applyLocalGlossary(source);
    if (localTranslation !== source && (!Shared.containsJapanese(localTranslation) || Shared.containsProtectedPrice(source))) {
      const leading = (state.original.match(/^\s*/u) || [""])[0];
      const trailing = (state.original.match(/\s*$/u) || [""])[0];
      state.pending = false;
      state.failures = 0;
      state.translated = `${leading}${localTranslation}${trailing}`;
      state.node.nodeValue = state.translated;
      return;
    }

    if (!Shared.shouldTranslateText(source)) {
      state.pending = false;
      return;
    }

    let bucket = queuedBySource.get(source);
    if (!bucket) {
      bucket = { source, ids: new Set(), attempt: 0, foreground: visibility.foreground };
      queuedBySource.set(source, bucket);
    } else if (visibility.foreground) {
      bucket.foreground = true;
    }
    bucket.ids.add(state.id);
    scheduleFlush();
  }

  function queueNode(node, scanCache) {
    if (!enabled || showingOriginal || !node.isConnected) return;
    queueTarget(node, node.nodeValue, visibilityForTextNode(node, scanCache));
  }

  function scheduleFlush() {
    if (flushTimer || flushRunning || !enabled || showingOriginal) return;
    flushTimer = setTimeout(flushBatches, 40);
  }

  function takeBatch() {
    const first = Array.from(queuedBySource.values()).find((candidate) => candidate.foreground)
      || queuedBySource.values().next().value;
    if (!first) return [];
    // A small second attempt isolates troublesome strings without turning a
    // transient failure into dozens of native-message calls.
    const maxItems = first.attempt > 0
      ? 4
      : (first.foreground ? FOREGROUND_BATCH_ITEMS : BACKGROUND_BATCH_ITEMS);
    const batch = [];
    let characters = 0;
    for (const [source, candidate] of queuedBySource) {
      if (candidate.attempt !== first.attempt) continue;
      if (candidate.foreground !== first.foreground) continue;
      if (batch.length && (batch.length >= maxItems || characters + candidate.source.length > MAX_BATCH_CHARACTERS)) break;
      queuedBySource.delete(source);
      batch.push(candidate);
      characters += candidate.source.length;
    }
    return batch;
  }

  function retryOrRelease(bucket) {
    const retryIDs = new Set();
    for (const id of bucket.ids) {
      const state = stateByID.get(id);
      if (!state) continue;
      state.failures += 1;
      if (bucket.attempt < 1 && state.node.isConnected && state.node.nodeValue === state.original) {
        retryIDs.add(id);
      } else {
        state.pending = false;
      }
    }
    if (retryIDs.size) {
      queuedBySource.set(bucket.source, {
        source: bucket.source,
        ids: retryIDs,
        attempt: bucket.attempt + 1,
        foreground: bucket.foreground
      });
    }
  }

  async function flushBatches() {
    flushTimer = 0;
    if (flushRunning || !enabled || showingOriginal || queuedBySource.size === 0) return;
    flushRunning = true;

    try {
      while (enabled && !showingOriginal && queuedBySource.size > 0) {
        const batchBuckets = takeBatch();
        if (!batchBuckets.length) break;
        const requestGeneration = scanGeneration;

        const items = batchBuckets.map((bucket) => ({
          id: Array.from(bucket.ids)[0],
          text: bucket.source
        }));

        try {
          const reply = await ext.runtime.sendMessage({ type: "translate", pageID, items });
          if (!reply || !reply.ok) throw new Error(reply && reply.error ? reply.error : "Translation failed");
          const translatedByID = new Map(reply.translations.map((item) => [item.id, item.text]));

          for (const bucket of batchBuckets) {
            const translation = translatedByID.get(Array.from(bucket.ids)[0]);
            if (typeof translation !== "string") {
              retryOrRelease(bucket);
              continue;
            }
            for (const id of bucket.ids) {
              const state = stateByID.get(id);
              if (!state) continue;
              state.pending = false;
              state.failures = 0;
              if (showingOriginal || requestGeneration !== scanGeneration || !state.node.isConnected || state.node.nodeValue !== state.original) continue;
              const leading = (state.original.match(/^\s*/u) || [""])[0];
              const trailing = (state.original.match(/\s*$/u) || [""])[0];
              const polished = Shared.applyLocalGlossary(translation.trim());
              state.translated = `${leading}${polished}${trailing}`;
              state.node.nodeValue = state.translated;
            }
          }
        } catch (_) {
          for (const bucket of batchBuckets) retryOrRelease(bucket);
        }
      }
    } finally {
      flushRunning = false;
      if (enabled && !showingOriginal && queuedBySource.size > 0) scheduleFlush();
      pruneDetachedStates();
    }
  }

  function textWalker(root) {
    if (root.nodeType === Node.TEXT_NODE) return null;
    return document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  }

  function scanRoot(root, generation) {
    if (!enabled || showingOriginal || generation !== scanGeneration || !root || !root.isConnected) return;
    const scanCache = { styles: new WeakMap(), blocked: new WeakMap() };
    if (root.nodeType === Node.TEXT_NODE) {
      queueNode(root, scanCache);
      return;
    }

    const walker = textWalker(root);
    const work = (deadline) => {
      if (!enabled || showingOriginal || generation !== scanGeneration) return;
      let count = 0;
      let node;
      while ((node = walker.nextNode())) {
        queueNode(node, scanCache);
        count += 1;
        if (count >= 500 || (deadline && deadline.timeRemaining() < 1.5)) {
          scheduleIdle(work);
          return;
        }
      }
    };
    scheduleIdle(work);
  }

  function scheduleIdle(callback) {
    if (typeof requestIdleCallback === "function") {
      requestIdleCallback(callback, { timeout: 100 });
    } else {
      setTimeout(() => callback(null), 16);
    }
  }

  function addHighestRoot(roots, root) {
    // Keep only the highest dirty roots so a large framework render doesn't
    // enqueue the same subtree hundreds of times.
    for (const existing of roots) {
      if (existing === root || (typeof existing.contains === "function" && existing.contains(root))) return;
      if (typeof root.contains === "function" && root.contains(existing)) roots.delete(existing);
    }
    roots.add(root);
  }

  function rootIsNearViewport(root) {
    const element = root.nodeType === Node.TEXT_NODE ? root.parentElement : root;
    if (!element || typeof element.getBoundingClientRect !== "function") return false;
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && isNearViewport(rect);
  }

  function flushRoots(roots) {
    const pendingRoots = Array.from(roots);
    roots.clear();
    const generation = scanGeneration;
    for (const candidate of pendingRoots) scanRoot(candidate, generation);
  }

  function scheduleScan(root) {
    if (!root) return;
    if (rootIsNearViewport(root)) {
      addHighestRoot(urgentRoots, root);
      // This is a leading-edge throttle: continuous Amazon mutations cannot
      // postpone visible translation forever by repeatedly resetting a timer.
      if (!urgentMutationTimer) {
        urgentMutationTimer = setTimeout(() => {
          urgentMutationTimer = 0;
          flushRoots(urgentRoots);
        }, FOREGROUND_MUTATION_DELAY_MS);
      }
      return;
    }

    addHighestRoot(dirtyRoots, root);
    clearTimeout(mutationTimer);
    mutationTimer = setTimeout(() => {
      mutationTimer = 0;
      flushRoots(dirtyRoots);
    }, MUTATION_DEBOUNCE_MS);
  }

  function pruneDetachedStates() {
    if (stateByID.size < 1000) return;
    for (const [id, state] of stateByID) {
      if (!state.node.isConnected) stateByID.delete(id);
    }
  }

  function showOriginal() {
    showingOriginal = true;
    scanGeneration += 1;
    queuedBySource.clear();
    clearTimeout(flushTimer);
    flushTimer = 0;
    clearTimeout(mutationTimer);
    clearTimeout(urgentMutationTimer);
    dirtyRoots.clear();
    urgentRoots.clear();
    mutationTimer = 0;
    urgentMutationTimer = 0;
    for (const state of stateByID.values()) {
      state.pending = false;
      if (state.node.isConnected && state.translated !== null && state.node.nodeValue === state.translated) {
        state.node.nodeValue = state.original;
      }
    }
  }

  function translateNow() {
    enabled = true;
    showingOriginal = false;
    scanGeneration += 1;
    scanRoot(document.body || document.documentElement, scanGeneration);
    return { ok: true };
  }

  async function refreshMode() {
    try {
      const reply = await ext.runtime.sendMessage({ type: "getPageState", url: location.href });
      enabled = Boolean(reply && reply.shouldTranslate);
      if (enabled) {
        showingOriginal = false;
        scanGeneration += 1;
        scanRoot(document.body || document.documentElement, scanGeneration);
      } else {
        showOriginal();
      }
    } catch (_) {
      enabled = false;
    }
  }

  const observer = new MutationObserver((mutations) => {
    if (!enabled || showingOriginal) return;
    for (const mutation of mutations) {
      if (mutation.type === "characterData") {
        const state = stateByNode.get(mutation.target);
        if (!state || mutation.target.nodeValue !== state.translated) scheduleScan(mutation.target);
      } else {
        for (const node of mutation.addedNodes) scheduleScan(node);
      }
    }
  });
  observer.observe(document.documentElement, {
    childList: true,
    characterData: true,
    subtree: true
  });

  ext.runtime.onMessage.addListener((message) => {
    if (!message) return undefined;
    if (message.type === "translateNow") return Promise.resolve(translateNow());
    if (message.type === "showOriginal") {
      showOriginal();
      return Promise.resolve({ ok: true });
    }
    if (message.type === "settingsChanged") return refreshMode().then(() => ({ ok: true }));
    return undefined;
  });

  refreshMode();
})();
