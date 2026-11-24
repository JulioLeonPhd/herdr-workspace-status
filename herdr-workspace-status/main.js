// MODIFIED SOURCE: Adapted from Herdr’s Workspace Status mod (Apache-2.0).
// Upstream: https://github.com/herdrdev/herdr-app/blob/afbf57cdae894579ed0bd34470c96289da063dea/defaults/mods/workspace-status/main.js
// See ATTRIBUTION.md for licensing and source details.

import { View, div, svg } from "gpui-kit";
import { h_flex } from "gpui-base";
import { spaces, agents, theme, run, window, keys, exec, checking, nextCommand, notify } from "herdr";
import { cpuPercent, ramPercent, selfCheck, windowsMetrics } from "./sample.js";
import { AwakeControl, windowsLease } from "./awake.js";

const CPU_COMMAND = "LC_ALL=C /usr/sbin/iostat -n 0 -c 2 -w 1";
const MEMORY_COMMAND = "LC_ALL=C pages=$(/usr/bin/vm_stat) && total=$(/usr/sbin/sysctl -n hw.memsize) && printf '%s\\n---MEMSIZE---\\n%s' \"$pages\" \"$total\"";
const WINDOWS_SCRIPT = `\$c=\$null;\$r=\$null;
try {
  foreach (\$v in ([wmisearcher]'select PercentProcessorTime from Win32_PerfFormattedData_PerfOS_Processor where Name=''_Total''').Get()) {
    if (\$null -ne \$v.PercentProcessorTime) { \$c=[double]\$v.PercentProcessorTime }
  }
} catch {}
try {
  foreach (\$v in ([wmisearcher]'select FreePhysicalMemory,TotalVisibleMemorySize from Win32_OperatingSystem').Get()) {
    \$t=\$v.TotalVisibleMemorySize;\$f=\$v.FreePhysicalMemory;
    if (\$null -ne \$t -and \$null -ne \$f -and \$t -gt 0) { \$r=100*(\$t-\$f)/\$t }
  }
} catch {}
[Console]::OutputEncoding=[Text.UTF8Encoding]::new();
[pscustomobject]@{cpu=\$c;ram=\$r}|ConvertTo-Json -Compress`;
const WINDOWS_ARGS = ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", WINDOWS_SCRIPT];
const HISTORY = 24;
const AWAKE_PLATFORM = platform => platform === "macos" || platform === "windows";
const awakeLease = platform => platform === "windows"
  ? () => windowsLease(exec)
  : () => exec("/usr/bin/caffeinate", ["-di", "-t", "4"], { timeout: 6000 });
function sampleWindows() {
  return exec("powershell.exe", WINDOWS_ARGS, { timeout: 8000 })
    .then(result => result.code === 0 ? windowsMetrics(result.stdout) : [null, null], () => [null, null]);
}

function parseMemory(stdout) {
  const [vm, total] = stdout.split("\n---MEMSIZE---\n");
  return total === undefined ? null : ramPercent(vm, total);
}

function sampleMac() {
  return Promise.all([
    exec("/bin/sh", ["-c", CPU_COMMAND], { timeout: 4000 })
      .then(result => result.code === 0 ? cpuPercent(result.stdout) : null, () => null),
    exec("/bin/sh", ["-c", MEMORY_COMMAND], { timeout: 4000 })
      .then(result => result.code === 0 ? parseMemory(result.stdout) : null, () => null),
  ]);
}
function sparkline(values, color) {
  return h_flex().w(47).h(12).gap(1).justify_end().items_end()
    .children(values.map(value => div().w(1).h(Math.max(1, value * 0.12)).bg(color)));
}

function meter(value, t) {
  return div().w(32).h(5).rounded(3).bg(t.border)
    .child(div().w(32 * value / 100).h(5).rounded(3).bg(t.muted));
}

function workingAgents() {
  return agents().some(a => a.status === "working");
}

function coffee(control, t, toggle) {
  const active = control.mode !== "off";
  const title = control.mode === "manual" ? "Keep awake manually (click to turn off)"
    : control.mode === "agents" ? "Keep awake while agents work (right-click to turn off)"
      : "Keep awake off (click for manual; right-click for working agents)";
  const icon = svg("mods/herdr-workspace-status/coffee.svg").size(17);
  return div().id("coffee-awake").tooltip(title).text_color(active ? t.accent : t.dim)
    .cursor_pointer().on_mouse_down("left", (_event, cx) => toggle("left", cx))
    .on_mouse_down("right", (_event, cx) => toggle("right", cx)).child(icon);
}

export default class WorkspaceStatus extends View {
  init(_props, cx) {
    if (checking()) selfCheck();
    this.cpu = null;
    this.memory = null;
    this.history = [];
    this.awake = new AwakeControl();
    if (!checking()) {
      cx.spawn(async cx => {
        for (;;) {
          const command = await nextCommand();
          if (command === "awake-left") this.toggleAwake("left", cx);
          else if (command === "awake-right") this.toggleAwake("right", cx);
        }
      });
      cx.spawn(async cx => {
        while (true) {
          // window() is null during early init, so resolve the platform per pass.
          const platform = window()?.platform;
          if (platform === "macos" || platform === "windows") {
            [this.cpu, this.memory] = platform === "windows" ? await sampleWindows() : await sampleMac();
            if (this.cpu !== null) this.history = [...this.history, this.cpu].slice(-HISTORY);
            cx.notify();
          }
          await cx.sleep(5000);
        }
      });
    }
  }

  toggleAwake(button, cx) {
    if (!this.awake.toggle(button, workingAgents())) {
      notify({ title: "Keep awake", body: "No working agents to follow.", level: "info", timeout: 2500 });
    }
    cx.notify();
    if (!this.awakeRenewing && this.awake.mode !== "off") cx.spawn(cx => this.startAwakeRenewal(cx));
  }

  startAwakeRenewal(cx) {
    if (this.awakeRenewing || this.awake.mode === "off") return;
    this.awakeRenewing = true;
    return this.awake.renew({
      working: workingAgents,
      lease: awakeLease(window()?.platform),
      sleep: ms => cx.sleep(ms),
      failed: error => notify({ title: "Keep awake failed", body: String(error), level: "error" }),
    }).finally(() => {
      this.awakeRenewing = false;
      cx.notify();
      if (this.awake.mode !== "off") return this.startAwakeRenewal(cx);
    });
  }

  async close() {
    this.awake?.stop();
  }

  // The palette key as actually bound, not a hardcoded one; without a
  // binding the hint stays useful ("commands") instead of lying.
  hint(t) {
    const mac = window()?.platform === "macos";
    const mod = { cmd: mac ? "⌘" : "Ctrl+", ctrl: mac ? "⌃" : "Ctrl+", shift: mac ? "⇧" : "Shift+", alt: mac ? "⌥" : "Alt+", option: mac ? "⌥" : "Alt+" };
    const b = keys().find((k) => k.section === "global" && k.action === "app.palette");
    const parts = b && b.keys.endsWith("--") ? [...b.keys.slice(0, -2).split("-"), "-"] : b?.keys.split("-");
    const key = parts && parts.map((p) => mod[p.toLowerCase()] ?? p.toUpperCase()).join("");
    return key ? `${key}  commands` : "commands";
  }

  render() {
    const t = theme();
    const space = spaces().find(s => s.active);
    const list = agents();
    const needs = list.filter(a => a.status === "blocked").length;
    const label = (icon, value) => h_flex().gap(6).items_center().child(svg(`mods/workspace-chrome/${icon}.svg`).size(13)).child(value);
    const metric = (name, value, graph) => h_flex().gap(5).items_center()
      .child(div().text_color(t.muted).child(name))
      .child(graph)
      .child(div().w(36).flex_shrink_0().whitespace_nowrap().text_color(t.foreground).child(value === null ? "—" : `${Math.round(value)}%`));
    const cpu = metric("CPU", this.cpu, sparkline(this.cpu === null ? [] : this.history, t.muted));
    const ram = metric("RAM", this.memory, meter(this.memory ?? 0, t));
    return h_flex().size_full().px(14).gap(16).items_center().bg(t.chrome).border_t(1).border_color(t.border).text_size(11.8).text_color(t.muted)
      .child(label(space?.machine ? "server" : "monitor", space?.machine ?? "This computer"))
      .when(Boolean(space?.branch), el => el.child(label("branch", space.branch)))
      .child(h_flex().gap(6).items_center().child(div().size(6).rounded(3).bg(t.dim)).child(`${list.length} agents`)
        .when(needs > 0, el => el.child(div().text_color(t.blocked).child(`· ${needs} needs you`))))
      .child(div().flex_1())
      .child(h_flex().gap(8).items_center()
        .when(Boolean(space?.machine), el => el.child("Local")).child(cpu).child(ram)
        .when(AWAKE_PLATFORM(window()?.platform), el => el.child(coffee(this.awake, t, (button, cx) => this.toggleAwake(button, cx)))))
      .child(div().id("palette").text_color(t.dim).on_click(() => run("app.palette")).child(this.hint(t)));
  }
}
