export function cpuPercent(text) {
  const lines = text.trim().split(/\r?\n/);
  const row = /^\d+(?:\.\d+)?\s+\d+(?:\.\d+)?\s+(\d+(?:\.\d+)?)\s+\d+(?:\.\d+)?\s+\d+(?:\.\d+)?\s+\d+(?:\.\d+)?$/;
  // The first row is since boot; the second covers the one-second interval.
  if (!row.test(lines.at(-2)?.trim() ?? "")) return null;
  const idle = Number(row.exec(lines.at(-1).trim())?.[1]);
  return idle <= 100 ? 100 - idle : null;
}

export function ramPercent(vm, memsize) {
  const bytes = text => /^\d+$/.test(text) && Number.isSafeInteger(Number(text)) ? Number(text) : null;
  const total = bytes(memsize.trim());
  const pageSize = bytes(vm.match(/^Mach Virtual Memory Statistics: \(page size of (\d+) bytes\)\s*$/m)?.[1]);
  if (!total || !pageSize) return null;

  let pages = 0;
  for (const field of ["Pages active", "Pages wired down", "Pages occupied by compressor", "Pages speculative"]) {
    const count = bytes(vm.match(new RegExp(`^${field}:[ \\t]*(\\d+)\\.?[ \\t]*\\r?$`, "m"))?.[1]);
    if (count === null) return null;
    pages += count;
  }
  return Math.min(100, (pages * pageSize) / total * 100);
}

export function windowsMetrics(text) {
  try {
    const value = JSON.parse(text);
    const percent = number => typeof number === "number" && Number.isFinite(number) && number >= 0 && number <= 100 ? number : null;
    return [percent(value.cpu), percent(value.ram)];
  } catch {
    return [null, null];
  }
}

export function selfCheck() {
  const check = (condition, message) => { if (!condition) throw new Error(`resource parser: ${message}`); };
  check(cpuPercent("us sy id 1m 5m 15m\n10 5 80 0.1 0.2 0.3\n20 10 55 0.1 0.2 0.3") === 45, "second iostat sample");
  const vm = "Mach Virtual Memory Statistics: (page size of 4096 bytes)\nPages active: 10.\nPages wired down: 20.\nPages occupied by compressor: 30.\nPages speculative: 40.";
  check(ramPercent(vm, "4096000") === 10, "four vm_stat page counters");
  check(cpuPercent("malformed") === null && ramPercent(vm, "0") === null, "unavailable input");
  check(ramPercent(vm, "100") === 100, "RAM percentage ceiling");
}
