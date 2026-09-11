(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.AutoEnglishNativeQueue = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const cancelledReply = Object.freeze({
    ok: false,
    cancelled: true,
    error: "The page changed before translation started."
  });

  function createLatestPageQueue(worker) {
    if (typeof worker !== "function") throw new TypeError("A queue worker is required.");

    const pending = [];
    const latestPageBySlot = new Map();
    let running = false;

    function isStale(job) {
      return job.slot !== null && job.page && latestPageBySlot.get(job.slot) !== job.page;
    }

    function cancelStalePending(slot) {
      for (let index = pending.length - 1; index >= 0; index -= 1) {
        const job = pending[index];
        if (job.slot === slot && isStale(job)) {
          pending.splice(index, 1);
          job.resolve(cancelledReply);
        }
      }
    }

    async function pump() {
      if (running) return;
      running = true;
      try {
        while (pending.length) {
          const job = pending.shift();
          if (isStale(job)) {
            job.resolve(cancelledReply);
            continue;
          }
          try {
            job.resolve(await worker(job.value, job.context));
          } catch (error) {
            job.reject(error);
          }
        }
      } finally {
        running = false;
        if (pending.length) void pump();
      }
    }

    function enqueue(value, context = {}) {
      const slot = context.slot === undefined || context.slot === null ? null : String(context.slot);
      const page = typeof context.page === "string" ? context.page : "";
      if (slot !== null && page && latestPageBySlot.get(slot) !== page) {
        latestPageBySlot.set(slot, page);
        cancelStalePending(slot);
      }

      return new Promise((resolve, reject) => {
        const job = { value, context, slot, page, resolve, reject };
        // The newest active page gets the next available native translation
        // slot. Background tabs retain FIFO order behind active work.
        if (context.active === false) pending.push(job);
        else pending.unshift(job);
        void pump();
      });
    }

    return {
      enqueue,
      get pendingCount() { return pending.length; }
    };
  }

  return { createLatestPageQueue };
});
