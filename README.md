# Herdr Workspace Status

A [Herdr](https://herdr.dev/) desktop mod that adds a CPU sparkline, a RAM meter, and a keep-awake cup to the workspace status bar. Your branch, agent counts, and command palette stay where they are.

**Tested with Herdr desktop 0.1.16 on macOS 27.2.1 and Windows 11 ARM64.** Not for the Herdr TUI or Sheprd.

![Herdr status bar showing the CPU sparkline, RAM meter, keep-awake cup, and command hint](preview.png)

- **See CPU and RAM at a glance.** The meters read the machine running the Herdr window, even in a remote workspace.
- **Keep your machine awake while agents work.** Right-click the cup to prevent idle sleep until the last working agent stops. Left-click to turn keep-awake on or off manually.

## Installation

Paste this into a coding agent running on the machine that runs Herdr:

```text
Read `~/.config/herdr-app/AGENTS.md`, then add this mod: https://github.com/JulioLeonPhD/herdr-workspace-status
```

Your agent can use the [installation guide](docs/install.md) to add the mod to a cloned layout without changing your original. Prefer to do it yourself? Follow the [macOS](docs/install.md#macos) or [Windows](docs/install.md#windows) steps. Windows uses its own manifest.

## Contributing

Report bugs or suggest changes in [GitHub Issues](https://github.com/JulioLeonPhD/herdr-workspace-status/issues). See the [development guide](docs/development.md) for testing and the [mod recipe](RECIPE.md) for how it works.

[Apache License 2.0](LICENSE) · [Attribution](ATTRIBUTION.md)
