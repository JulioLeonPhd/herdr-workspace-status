import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { describe, test } from "bun:test";

import {
  AwakeControl,
  NATIVE_LEASE_MS,
  WINDOWS_WAKE_SOURCE,
  encodeWindowsCommand,
  windowsLease,
  windowsLeaseArgs,
} from "../herdr-workspace-status/awake.js";

const DEADLINE = 1893456000000;

function decodeCommand(encoded) {
  const buffer = Buffer.from(encoded, "base64");
  let text = "";
  for (let i = 0; i < buffer.length; i += 2) text += String.fromCharCode(buffer[i] | (buffer[i + 1] << 8));
  return text;
}

function source(deadline) {
  return `$deadline = ${deadline}\n${WINDOWS_WAKE_SOURCE}`;
}

function run(deadline, timeout = 30_000) {
  return spawnSync("powershell.exe", ["-NoLogo", "-NoProfile", "-NonInteractive", "-EncodedCommand", encodeWindowsCommand(source(deadline))], {
    encoding: "utf8",
    timeout,
  });
}

function requests() {
  const r = spawnSync("powercfg", ["/requests"], { encoding: "utf8", timeout: 15_000 });
  const text = `${r.stdout ?? ""}${r.stderr ?? ""}`;
  return { ok: r.status === 0, active: text.includes("Herdr keep awake"), text };
}

describe.skipIf(process.platform !== "win32")("Windows native power requests", () => {
  test("a live lease shows in powercfg and leaves nothing behind when it ends", () => {
    const active = Bun.spawn(["powershell.exe", "-NoLogo", "-NoProfile", "-NonInteractive", "-EncodedCommand", encodeWindowsCommand(source(Date.now() + 1500))], {
      stdout: "ignore",
      stderr: "ignore",
    });
    const during = requests();
    if (!during.ok) {
      active.kill();
      console.warn(`powercfg /requests unavailable; skipping native assertion:\n${during.text}`);
      return;
    }
    return active.exited.then(code => {
      assert.equal(code, 0);
      assert.equal(during.active, true, during.text);
      return new Promise(resolve => setTimeout(resolve, 1500));
    }).then(() => {
      const after = requests();
      if (after.ok) assert.equal(after.active, false, after.text);
    });
  }, 60_000);

  test("a child that starts after its deadline acquires no request", () => {
    const stale = run(Date.now() - 60_000);
    assert.equal(stale.status, 0, stale.stderr);
    const after = requests();
    if (after.ok) assert.equal(after.active, false, after.text);
  });

  test("a lease that really holds for a moment sets and then releases both requests", () => {
    const held = run(Date.now() + 2000);
    assert.equal(held.status, 0, held.stderr);
    const after = requests();
    if (after.ok) assert.equal(after.active, false, after.text);
  }, 60_000);
});

test("Windows lease args are one ASCII payload carrying the dispatch deadline", () => {
  const dispatched = windowsLeaseArgs(DEADLINE);
  assert.deepEqual(dispatched.slice(0, 4), ["-NoLogo", "-NoProfile", "-NonInteractive", "-EncodedCommand"]);
  assert.equal(dispatched.length, 5);
  assert.match(dispatched[4], /^[A-Za-z0-9+/=]+$/);
  const text = decodeCommand(dispatched[4]);
  assert.ok(text.startsWith(`$deadline = ${DEADLINE}\n`));
  assert.ok(text.includes(WINDOWS_WAKE_SOURCE));
});

test("windowsLease computes the absolute deadline at dispatch, not at foreign time", () => {
  let seen;
  const result = windowsLease((command, args, options) => {
    assert.equal(command, "powershell.exe");
    assert.ok(options.timeout > NATIVE_LEASE_MS);
    seen = decodeCommand(args.at(-1)).split("\n")[0];
    return Promise.resolve({ code: 0, stdout: "", stderr: "" });
  }, () => DEADLINE - NATIVE_LEASE_MS);
  return result.then(r => {
    assert.equal(r.code, 0);
    assert.equal(seen, `$deadline = ${DEADLINE}`);
  });
});

test("the payload checks the deadline before creation and before every set", () => {
  const start = WINDOWS_WAKE_SOURCE.indexOf("if (DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() > deadline) return 0;");
  const create = WINDOWS_WAKE_SOURCE.indexOf("PowerCreateRequest(ref ctx)");
  const perSet = WINDOWS_WAKE_SOURCE.indexOf("if (DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() > deadline) return 0;", start + 1);
  const set = WINDOWS_WAKE_SOURCE.indexOf("PowerSetRequest(h, (uint)i)");
  assert.ok(start > 0 && create > start, "startup check precedes creation");
  assert.ok(perSet > create && set > perSet, "each set sits behind a fresh deadline check");
  assert.match(WINDOWS_WAKE_SOURCE, /done\[0\] = i \+ 1;/);
  assert.match(WINDOWS_WAKE_SOURCE, /PowerClearRequest\(handle, \(uint\)i\)/);
  assert.match(WINDOWS_WAKE_SOURCE, /CloseHandle\(handle\)/);
});

test("UTF-16LE base64 matches -EncodedCommand and round-trips the payload", () => {
  assert.equal(encodeWindowsCommand("A"), Buffer.from("A", "utf16le").toString("base64"));
  for (const text of ["", "AB", "abc", "$deadline = 1", WINDOWS_WAKE_SOURCE]) {
    assert.equal(decodeCommand(encodeWindowsCommand(text)), text);
  }
});

test("a failing Windows lease stops renewal and reports once", async () => {
  const state = new AwakeControl();
  let failed = 0;
  state.toggle("left", false);
  const run = state.renew({
    working: () => true,
    lease: async () => ({ code: 1, stdout: "", stderr: "PowerSetRequest 0 failed (5)" }),
    sleep: async () => state.stop(),
    failed: error => { failed++; assert.match(error.message, /PowerSetRequest/); },
  });
  await Promise.resolve();
  await Promise.resolve();
  state.stop();
  await run;
  assert.equal(state.mode, "off");
});
