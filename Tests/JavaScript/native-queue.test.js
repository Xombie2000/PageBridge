"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createLatestPageQueue } = require("../../AutoEnglishExtension/Resources/native-queue.js");

test("new active pages cancel stale queued work and jump ahead", async () => {
  const calls = [];
  let releaseFirst;
  let firstStarted;
  const started = new Promise((resolve) => { firstStarted = resolve; });
  const firstGate = new Promise((resolve) => { releaseFirst = resolve; });

  const queue = createLatestPageQueue(async (value) => {
    calls.push(value);
    if (value === "in-flight") {
      firstStarted();
      await firstGate;
    }
    return { ok: true, value };
  });

  const inFlight = queue.enqueue("in-flight", { slot: "tab:1", page: "page-a", active: true });
  await started;
  const stale = queue.enqueue("stale", { slot: "tab:2", page: "old-page", active: false });
  const background = queue.enqueue("background", { slot: "tab:3", page: "page-c", active: false });
  const current = queue.enqueue("current", { slot: "tab:2", page: "new-page", active: true });

  assert.deepEqual(await stale, {
    ok: false,
    cancelled: true,
    error: "The page changed before translation started."
  });

  releaseFirst();
  await Promise.all([inFlight, current, background]);
  assert.deepEqual(calls, ["in-flight", "current", "background"]);
});

test("worker errors reject only their own queued request", async () => {
  const queue = createLatestPageQueue(async (value) => {
    if (value === "bad") throw new Error("failed");
    return value;
  });

  await assert.rejects(queue.enqueue("bad", { slot: "tab:1", page: "one" }), /failed/);
  assert.equal(await queue.enqueue("good", { slot: "tab:1", page: "one" }), "good");
});
