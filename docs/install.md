# Install and roll back

Use the **Herdr desktop app**, not the Herdr TUI or Sheprd. The mod was tested with Herdr desktop 0.1.16 on macOS 27.2.1 and Windows 11 ARM64 (build 26200.9974).

Run the commands from the repository root. If you don't already have a checkout:

```text
git clone https://github.com/JulioLeonPhD/herdr-workspace-status.git
cd herdr-workspace-status
```

Start Herdr on the machine where you're installing the mod. Before cloning a layout, note the active layout (`herdr-app status`, or the Windows equivalent below) so you can switch back to it. These steps clone the stock `main` layout and change only the clone. Leave `main.json`, personal layouts, `layouts/.state/`, Herdr's bundled `workspace-status` mod, and any `workspace-resource-status` prototype untouched.

- [macOS](#macos)
- [Windows](#windows)

## macOS

Use a zsh or Bash terminal with `herdr-app` on `PATH`. The commands use `HERDR_APP_HOME` if set, then `$XDG_CONFIG_HOME/herdr-app` if set, otherwise `~/.config/herdr-app`. Use the same config directory as the running app.

1. Copy the five runtime files and check the initial render:

   ```sh
   config="${HERDR_APP_HOME:-${XDG_CONFIG_HOME:-$HOME/.config}/herdr-app}"
   mod_dir="$config/mods/herdr-workspace-status"
   mkdir "$mod_dir" &&
     cp herdr-workspace-status/{mod.json,main.js,awake.js,sample.js,coffee.svg} "$mod_dir/" &&
     herdr-app check "$mod_dir"
   ```

   `mkdir` refuses an existing destination and nothing is copied. Don't copy over an existing installation. Continue only if the check succeeds.

2. Clone `main` under a fresh name. Herdr refuses an existing name and switches to the clone on success:

   ```sh
   herdr-app do layout.clone '{"name":"main","as":"workspace-status-demo"}'
   ```

3. Open `"$config/layouts/workspace-status-demo.json"`. In the block with `"id": "status"`, change only `content.mod` from `workspace-status` to `herdr-workspace-status`. Save; Herdr reloads the layout. Run `herdr-app status` to confirm the clone is active and check for errors.

### Roll back on macOS

Switch back to the layout that was active before cloning (`main` here; replace it if needed):

```sh
herdr-app do layout.switch '{"name":"main"}'
herdr-app status
pmset -g assertions
```

Switch away in every window using the clone; merely hiding the block doesn't disable the mod. To keep the clone, restore its `status` block's `content.mod` to `workspace-status`. If you don't want the clone or any changes you made to it, delete only `"$config/layouts/workspace-status-demo.json"`. Once no layout references the mod, remove only `"$config/mods/herdr-workspace-status"`.

## Windows

Use PowerShell in an **interactive Windows desktop session**. Herdr's initial-render check can report `cannot open windows while headless` over SSH. If Herdr was installed somewhere other than the location below, set `$herdr` to the actual executable path. Use the same config directory as the running app.

1. Copy the Windows manifest as `mod.json`, along with the four shared runtime files, and check the initial render:

   ```powershell
   $herdr = Join-Path $env:LOCALAPPDATA 'Programs\herdr-app\herdr-app.exe'
   $config = if ($env:HERDR_APP_HOME) { $env:HERDR_APP_HOME }
             elseif ($env:XDG_CONFIG_HOME) { Join-Path $env:XDG_CONFIG_HOME 'herdr-app' }
             else { Join-Path $HOME '.config\herdr-app' }
   & $herdr status
   $modDir = Join-Path $config 'mods\herdr-workspace-status'
   New-Item -ItemType Directory -Path $modDir -ErrorAction Stop | ForEach-Object {
       Copy-Item windows\mod.json,herdr-workspace-status\main.js,herdr-workspace-status\awake.js,herdr-workspace-status\sample.js,herdr-workspace-status\coffee.svg -Destination $_.FullName -ErrorAction Stop
       & $herdr check $_.FullName
   }
   ```

   `New-Item` refuses an existing destination. Don't copy over an existing installation, and don't substitute the macOS manifest. Continue only if the check succeeds.

2. Clone `main` under a fresh name. Herdr refuses an existing name and switches to the clone on success:

   ```powershell
   if ((& $herdr do layout.clone --name main --as workspace-status-windows | Out-String | ConvertFrom-Json).ok) {
       $layout = Join-Path $config 'layouts\workspace-status-windows.json'
       notepad $layout
   } else {
       throw 'Layout clone failed. Leave the existing layout untouched.'
   }
   ```

3. In the clone only, find the block with `"id": "status"` and change `content.mod` from `workspace-status` to `herdr-workspace-status`. Save; Herdr reloads the layout. Run `& $herdr status` to confirm the clone is active and check for errors.

### Roll back on Windows

Switch back to the layout that was active before cloning (`main` here; replace it if needed):

```powershell
& $herdr do layout.switch --name main
& $herdr status
```

Switch away in every window using the clone; merely hiding the block doesn't disable the mod. To keep the clone, restore its `status` block's `content.mod` to `workspace-status`. If you don't want the clone or any changes you made to it, delete only the clone created above:

```powershell
Remove-Item -LiteralPath $layout -Confirm
```

Once no layout references the mod, remove only the mod installation:

```powershell
Remove-Item -LiteralPath $modDir -Recurse -Confirm
```

If you're rolling back in a new terminal, first set `$herdr`, `$config`, and `$modDir` as in the install step and set `$layout` to the exact clone path you created.

For live checks after installation or rollback, see [Development and verification](development.md).
