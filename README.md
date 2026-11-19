# Herdr Workspace Status

A JavaScript/GPUI mod for the Herdr desktop app. It preserves the workspace status bar (machine, branch when available, agent counts, and command palette) and adds a local CPU sparkline and a physical RAM meter on macOS and Windows. The keep-awake cup and its palette commands are macOS-only.

Tested with **Herdr desktop 0.1.16** on **macOS 27.2.1** and **Windows 11 ARM64, build 26200.9974**. This mod is not for the Herdr TUI or Sheprd.

![Herdr status bar showing the CPU sparkline, RAM meter, keep-awake cup, and command hint](docs/status-bar.png)

## Install into a cloned layout on macOS

Start Herdr, open a terminal with `herdr-app` on `PATH`, and run the following from the repository root. The app uses `~/.config/herdr-app` by default. The separate runtime directory leaves both Herdr’s built-in `workspace-status` and any installed `workspace-resource-status` prototype untouched.

1. Copy the five runtime files and run Herdr’s initial-render check:

   ```sh
   mod_dir="$HOME/.config/herdr-app/mods/herdr-workspace-status"
   mkdir "$mod_dir" &&
     cp herdr-workspace-status/{mod.json,main.js,awake.js,sample.js,coffee.svg} "$mod_dir/" &&
     herdr-app check "$mod_dir"
   ```

   If the destination already exists, `mkdir` refuses it and nothing is copied. Do not copy over an existing installation. Continue only if the check succeeds.

2. Clone the stock `main` layout under a fresh name. The command refuses a name that already exists and switches to the clone on success:

   ```sh
   herdr-app do layout.clone '{"name":"main","as":"workspace-status-demo"}'
   ```

3. In `~/.config/herdr-app/layouts/workspace-status-demo.json`, find the block with `"id": "status"` and change only `content.mod` from `workspace-status` to `herdr-workspace-status`. Save the file; Herdr reloads it. Run `herdr-app status` to check the active layout and look for errors. Leave `main.json`, any personal layout, and `layouts/.state/` alone.

## Install into a cloned layout on Windows

Run these commands from the repository root in a PowerShell terminal on the Windows desktop. Herdr’s initial-render check needs an interactive session; it may report “cannot open windows while headless” over SSH.

```powershell
$herdr = Join-Path $env:LOCALAPPDATA 'Programs\herdr-app\herdr-app.exe'
$config = if ($env:HERDR_APP_HOME) { $env:HERDR_APP_HOME } else { Join-Path $HOME '.config\herdr-app' }
$modDir = Join-Path $config 'mods\herdr-workspace-status'
New-Item -ItemType Directory -Path $modDir -ErrorAction Stop | ForEach-Object {
    Copy-Item herdr-workspace-status\mod.json,herdr-workspace-status\main.js,herdr-workspace-status\awake.js,herdr-workspace-status\sample.js,herdr-workspace-status\coffee.svg -Destination $_.FullName -ErrorAction Stop
    & $herdr check $_.FullName
}
```

`New-Item` fails if the destination exists; do not overwrite an existing installation. Continue only if `check` succeeds. Clone `main` to a fresh layout name; this leaves `main` intact:

```powershell
& $herdr do layout.clone --name main --as workspace-status-windows
$layout = Join-Path $config 'layouts\workspace-status-windows.json'
notepad $layout
```

In the clone only, find the block with `"id": "status"` and change `content.mod` from `workspace-status` to `herdr-workspace-status`. Save; Herdr reloads the layout. Then verify the active layout:

```powershell
& $herdr status
```

### Windows meters

- **CPU:** Guest-local activity from `Win32_PerfFormattedData_PerfOS_Processor` (`_Total.PercentProcessorTime`), with up to 24 recent readings in the sparkline.
- **RAM:** Guest-local physical-memory usage from `Win32_OperatingSystem.TotalVisibleMemorySize` and `FreePhysicalMemory`.
- These are guest-local readings even when viewing a remote workspace. A failed or unavailable sample is shown as `—`, not zero.
- The keep-awake cup is macOS-only. This Windows mod reports meters without making any power requests.

In the ARM64 UTM guest, three standalone samples took 0.63–0.64 seconds each (elapsed time, including PowerShell startup). The mod waits five seconds after each completed sample; two observed intervals between sampler starts in Herdr were 6.7 and 6.9 seconds. Interrupting one sample displayed `—` for both meters; the next successful refresh restored the readings.

### Roll back on Windows

Switch back to the layout that was active before cloning (`main` here) before removing the mod:

```powershell
& $herdr do layout.switch --name main
& $herdr status
```

Switching away disables the mod in that window. If the clone is active in another Herdr window, switch that window too. To keep the clone but disable the mod, restore its `status` block to `"mod": "workspace-status"`. Once no layouts reference the mod, remove only this installation and, if desired, the clone:

```powershell
if (Test-Path $modDir) { Remove-Item $modDir -Recurse }
if (Test-Path $layout) { Remove-Item $layout }
```

Do not remove `main.json`, another layout, Herdr’s bundled status mod, or the original layout.

## Read and use the bar on macOS

- **CPU:** Local CPU busy percentage from a one-second `iostat` sample, with up to 24 recent readings in the sparkline.
- **RAM:** An estimate of active, wired, compressed, and speculative pages as a percentage of local physical memory, using `vm_stat` and `sysctl`. The bar shows `—` if a metric is unavailable. Samples refresh about every six seconds during normal operation. In a remote workspace these are still local readings, marked **Local**.
- **Cup:** Dim means off; the accent color and hover tooltip indicate the active mode. Left-click from off to start **manual** mode, which does not depend on agents. Left-click when active to turn it off. Right-click with at least one working agent to start **working-agent** mode, replacing manual mode if it was active; right-click again to turn that mode off. With no working agents, right-click does not activate working-agent mode and leaves an existing manual mode unchanged. From working-agent mode, left-click once to turn it off and again to start manual mode.

The palette exposes **Toggle keep awake manually** and **Keep awake while agents work**. The equivalent commands for the visible mod are:

```sh
herdr-app do herdr-workspace-status.awake-left
herdr-app do herdr-workspace-status.awake-right
```

The mod runs `/usr/bin/caffeinate -di -t 4` to prevent idle display and system sleep, renewing every 2.8 seconds while eligible. Once Herdr reports no agents working, the next renewal check stops working-agent mode. Allow **up to about 7 seconds** from that status change under normal scheduling (2.8 seconds to reconcile plus a four-second lease, rounded up). Once manually disabled or removed from the active layout, renewal stops and an already-issued lease can take up to four seconds to expire under normal scheduling. These are conservative estimates from the implementation, not measured release times or guarantees under OS scheduling delays. The app’s `exec` timeout is six seconds per lease; the `caffeinate` assertion itself is requested for four.

## Verify the packaged copy

From the repository root, run the focused state test with Bun:

```sh
bun test tests/awake.test.mjs
```

The test exercises working-agent activation, switching, stopping, and in-flight lease behavior. `herdr-app check` in the install procedure checks initial rendering and runs the sampler parser self-checks; it does not replace live testing.

On macOS, with the clone active, verify the original status indicators, changing CPU/RAM readings, and the cup beside RAM. Use physical left and right clicks as well as the commands. In a separate terminal, use `pmset -g assertions` before, during, and after each scenario. Track the mod’s `caffeinate` owner of `PreventUserIdleDisplaySleep`, not just the global assertion count: unrelated processes (including a separately enabled prototype) can hold their own assertions.

1. With no agent working, right-click from off: the cup stays dim and no mod assertion appears. Left-click: manual mode lights the cup and starts an assertion even without agents. Left-click again: the assertion expires.
2. Start an agent working and enable manual mode, then right-click: the tooltip changes to working-agent mode. Turn it off with a right-click and check that no manual assertion keeps renewing. Re-enable working-agent mode, then stop the last working agent; record the time from Herdr reporting no agents working until the last mod-owned display assertion disappears.
3. Enable manual mode again and follow the rollback below while a lease is active. Confirm the original status bar returns and that the packaged mod’s assertion expires and does not renew.

On macOS, the packaged mod loaded in a clean clone. Manual testing confirmed that both physical cup clicks activate keep-awake. In a separate rollback test, the display assertion cleared within 3.2 seconds of switching back to the original layout with manual mode active. The Bun test covers the last-agent transition, but the live assertion release time after the last working agent stops has not been measured.

## Roll back or uninstall on macOS

Switch to the original layout before removing anything (replace `main` if your original layout has another name):

```sh
herdr-app do layout.switch '{"name":"main"}'
herdr-app status
pmset -g assertions
```

Switching away disables the mod in that window; merely hiding the block is not enough. If the cloned layout is active in another Herdr window, switch that window too. To keep the cloned layout but disable the mod, restore the clone’s `status` block to `"mod": "workspace-status"` instead. Once no layouts reference it, you can remove `~/.config/herdr-app/mods/herdr-workspace-status/`. If you no longer want the clone, remove only `~/.config/herdr-app/layouts/workspace-status-demo.json`. Do not remove your original layout, Herdr’s bundled status mod, or the prototype.

## License and attribution

[Apache License 2.0](LICENSE). See [ATTRIBUTION.md](ATTRIBUTION.md) for the upstream Herdr workspace-status source and the Sheprd design credit. Include the license and applicable notices with redistributions.
