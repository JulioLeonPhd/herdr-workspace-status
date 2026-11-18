import assert from "node:assert/strict";
import { test } from "bun:test";
import { AwakeControl } from "../herdr-workspace-status/awake.js";

test("clicks select or clear a mode, and agent mode ends with the last working agent", () => {
  const state = new AwakeControl();
  assert.equal(state.toggle("right", false), false);
  assert.equal(state.mode, "off");
  assert.equal(state.toggle("left", false), true);
  assert.equal(state.mode, "manual");
  assert.equal(state.toggle("right", true), true);
  assert.equal(state.mode, "agents");
  state.reconcile(false);
  assert.equal(state.mode, "off");
  assert.equal(state.toggle("right", true), true);
  assert.equal(state.toggle("right", true), true);
  assert.equal(state.mode, "off");
  assert.equal(state.toggle("left", true), true);
  assert.equal(state.toggle("left", true), true);
  assert.equal(state.mode, "off");
});

test("left-click turns off agent mode even if the last agent just stopped", () => {
  const state = new AwakeControl();
  state.toggle("right", true);
  assert.equal(state.toggle("left", false), true);
  assert.equal(state.mode, "off");
});

test("stopping keep-awake ignores a late failure from an in-flight assertion", async () => {
  let resolveLease;
  let failed = 0;
  const state = new AwakeControl();
  state.toggle("left", false);
  await state.renew({
    working: () => false,
    lease: () => new Promise(resolve => { resolveLease = resolve; }),
    sleep: async () => state.stop(),
    failed: () => failed++,
  });
  resolveLease({ code: 1, stderr: "canceled failure" });
  await Promise.resolve();
  assert.equal(failed, 0);
  assert.equal(state.mode, "off");
});
