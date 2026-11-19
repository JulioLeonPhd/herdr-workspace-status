import assert from "node:assert/strict";
import { test } from "bun:test";

import { windowsMetrics } from "../herdr-workspace-status/sample.js";

test("Windows output keeps independent valid percentages and rejects bad fields", () => {
  for (const [text, expected] of [
    ['{"cpu":0,"ram":100}', [0, 100]],
    ['{"cpu":null,"ram":42.5}', [null, 42.5]],
    ['{"cpu":55,"ram":null}', [55, null]],
    ['{"ram":50}', [null, 50]],
    ['{"cpu":101,"ram":-1}', [null, null]],
    ['{"cpu":1e400,"ram":"20"}', [null, null]],
    ['{"cpu":false,"ram":true}', [null, null]],
    ["malformed", [null, null]],
    ['{"cpu":23,"ram":48}', [23, 48]],
  ]) assert.deepEqual(windowsMetrics(text), expected);
});

