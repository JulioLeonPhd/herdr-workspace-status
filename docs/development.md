# Development and verification

Run unit tests from the checkout and live checks with the installed mod in a cloned layout. See the [installation guide](install.md) to set up the clone and the [mod recipe](../RECIPE.md) for behavior and implementation details.

## Automated checks

From the repository root:

```sh
bun test tests/awake.test.mjs
bun test tests/windows-awake.test.mjs
bun test tests/windows-meters.test.mjs
```

These focused tests cover the keep-awake state machine, Windows lease command/deadline handling and errors, and Windows meter parsing. Herdr's `check` command from the install guide checks initial rendering and runs the sampler parser self-checks; it does not replace live testing.

## macOS live verification

With the packaged mod's cloned layout active, confirm the original status indicators, changing CPU/RAM readings, and cup beside RAM. Exercise physical left- and right-clicks as well as the palette commands. In a separate terminal, run `pmset -g assertions` before, during, and after each scenario. Track the mod's `caffeinate` owner of `PreventUserIdleDisplaySleep`, not just the global assertion count: unrelated processes (including a separately enabled prototype) can have their own assertions.

1. With no agent working, right-click from off: the cup stays dim and no mod assertion appears. Left-click: manual mode lights the cup and starts an assertion even without agents. Left-click again: the assertion expires.
2. Start an agent working and enable manual mode, then right-click: the tooltip changes to working-agent mode. Right-click to turn it off; check that no manual assertion keeps renewing. Re-enable working-agent mode, then stop the last working agent. Record the time from Herdr reporting no agents working until the last mod-owned display assertion disappears.
3. Enable manual mode again and follow [the macOS rollback procedure](install.md#macos). Confirm the original status bar returns and the packaged mod's assertion expires and does not renew.

### Recorded macOS results

The packaged mod loaded in a clean clone. Manual testing confirmed that both physical cup clicks activate keep-awake. In a separate rollback test, the display assertion cleared within **3.2 seconds** of switching back to the original layout with manual mode active. The Bun test covers the last-agent transition, but live assertion release time after the last working agent stops has **not** been measured.

## Windows live verification

With the packaged mod's cloned layout active, check the same states using `powercfg /requests`; look for `Herdr keep awake` under DISPLAY and SYSTEM:

```powershell
powercfg.exe /requests
```

Test physical cup clicks, agent-mode transitions, and switching to another layout. Force-killing Herdr can also check that the OS releases the bounded request when its PowerShell child exits.

To check meter layout, use a disposable mod copy and force CPU, RAM, and all CPU history samples to 100%. Verify both percentage labels stay on one line without touching their graphs. Include Geist at 125% Windows display scaling and 100% Herdr zoom.

### Recorded Windows results

On the Windows 11 ARM64 UTM guest, three standalone meter samples took **0.63–0.64 seconds each** elapsed, including PowerShell startup. The sampler waits five seconds after each completed sample; two observed intervals between sampler starts in Herdr were **6.7 and 6.9 seconds**. Interrupting a sample displayed `—` for both meters; the next successful refresh restored the readings.

With the packaged mod in the clone, a physical left-click made the request appear and it remained present 12 seconds later (renewal working); a second click released it in **0.5 seconds**. Right-click with one working agent held the request and released it **2.4 seconds** after that agent was killed; right-click with no working agent added nothing. Switching layouts released it in **0.8 seconds**, and force-killing `herdr-app` released it in **1.1 seconds**. These observed releases are within one **3.8-second lease** plus process teardown; slower guests can approach that bound. These are historical measurements, not guarantees.
