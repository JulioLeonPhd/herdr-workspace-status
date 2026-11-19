export const RENEW_MS = 2800;
// On macOS each caffeinate -t 4 covers one renewal step; Windows mirrors that
// with an absolute deadline per child so a request is never set once stale.
export const NATIVE_LEASE_MS = 3800;

export class AwakeControl {
  mode = "off";
  generation = 0;
  stop() {
    this.generation++;
    this.mode = "off";
  }

  reconcile(working) {
    if (this.mode === "agents" && !working) this.stop();
  }

  toggle(button, working) {
    if (button !== "left") this.reconcile(working);
    if (button === "left") {
      if (this.mode === "off") this.mode = "manual";
      else this.stop();
    } else if (this.mode === "agents") {
      this.stop();
    } else if (working) {
      this.mode = "agents";
    } else {
      return false;
    }
    return true;
  }

  async renew({ working, lease, sleep, failed }) {
    const generation = this.generation;
    const eligible = () => {
      if (generation !== this.generation || this.mode === "off") return false;
      this.reconcile(working());
      return this.mode !== "off";
    };
    const onFailure = error => {
      if (!eligible()) return;
      this.stop();
      failed(error);
    };
    while (eligible()) {
      // Start by the next refresh, not after the process behind each lease exits.
      void (async () => {
        try {
          const result = await lease();
          if (result.code === 0) return;
          throw new Error(result.stderr.trim() || `keep awake lease exited ${result.code}`);
        } catch (error) {
          onFailure(error);
        }
      })();
      await sleep(RENEW_MS);
    }
  }
}

// Windows has no caffeinate: each renewal is one short child that holds native
// Display+System power requests until an absolute deadline, then exits. Windows
// releases the requests when that process dies, so unload and host termination
// are bounded even though a started exec survives the mod's close().
export const WINDOWS_WAKE_SOURCE = String.raw`
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using Microsoft.Win32.SafeHandles;

public static class KeepAwake
{
  [StructLayout(LayoutKind.Sequential)]
  struct REASON_CONTEXT
  {
    public uint Version;
    public uint Flags;
    public IntPtr SimpleReasonString;
  }

  const uint POWER_REQUEST_CONTEXT_VERSION = 0;
  const uint POWER_REQUEST_CONTEXT_SIMPLE_STRING = 0x00000001;

  sealed class Request : SafeHandleZeroOrMinusOneIsInvalid
  {
    readonly int[] done;
    public Request(IntPtr handle, int[] done) : base(true) { SetHandle(handle); this.done = done; }
    protected override bool ReleaseHandle()
    {
      for (int i = 0; i < done[0]; i++) PowerClearRequest(handle, (uint)i);
      return CloseHandle(handle);
    }
  }

  [DllImport("kernel32.dll", SetLastError = true)]
  static extern IntPtr PowerCreateRequest(ref REASON_CONTEXT Context);
  [DllImport("kernel32.dll", SetLastError = true)]
  static extern bool PowerSetRequest(SafeHandle PowerRequest, uint RequestType);
  [DllImport("kernel32.dll", SetLastError = true)]
  static extern bool PowerClearRequest(IntPtr PowerRequest, uint RequestType);
  [DllImport("kernel32.dll", SetLastError = true)]
  static extern bool CloseHandle(IntPtr hObject);

  public static int Run(long deadline)
  {
    // A child that starts after its deadline never acquires a request.
    if (DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() > deadline) return 0;
    int[] done = { 0 };
    IntPtr reason = Marshal.StringToHGlobalUni("Herdr keep awake");
    try
    {
      REASON_CONTEXT ctx = new REASON_CONTEXT();
      ctx.Version = POWER_REQUEST_CONTEXT_VERSION;
      ctx.Flags = POWER_REQUEST_CONTEXT_SIMPLE_STRING;
      ctx.SimpleReasonString = reason;
      IntPtr raw = PowerCreateRequest(ref ctx);
      if (raw == new IntPtr(-1)) return 0;
      using (Request h = new Request(raw, done))
      {
        // Checked per request: normal startup plus Add-Type can pass the
        // deadline, and nothing may be held once it has.
        for (int i = 0; i < 2; i++)
        {
          if (DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() > deadline) return 0;
          if (!PowerSetRequest(h, (uint)i)) throw new Exception(
            "PowerSetRequest " + i + " failed (" + Marshal.GetLastWin32Error() + ")");
          done[0] = i + 1;
        }
        while (true)
        {
          long remaining = deadline - DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
          if (remaining <= 0) return 0;
          System.Threading.Thread.Sleep((int)Math.Min(remaining, 1000));
        }
      }
    }
    finally
    {
      Marshal.FreeHGlobal(reason);
    }
  }
}
'@
if ([KeepAwake]::Run($deadline) -ne 0) { exit 1 }
`;

const BASE64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

// -EncodedCommand needs UTF-16LE base64. Doing it here keeps the exec argv plain
// ASCII: no quoting, newlines or metacharacters reach PowerShell's parser.
export function encodeWindowsCommand(source) {
  const bytes = [];
  for (let i = 0; i < source.length; i++) {
    const code = source.charCodeAt(i);
    bytes.push(code & 0xff, code >> 8);
  }
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const [a, b = 0, c = 0] = bytes.slice(i, i + 3);
    const n = (a << 16) | (b << 8) | c;
    out += BASE64[(n >> 18) & 63] + BASE64[(n >> 12) & 63];
    out += i + 1 < bytes.length ? BASE64[(n >> 6) & 63] : "=";
    out += i + 2 < bytes.length ? BASE64[n & 63] : "=";
  }
  return out;
}

// Absolute epoch-ms deadline is computed where the lease is dispatched.
export function windowsLeaseArgs(deadline) {
  return [
    "-NoLogo", "-NoProfile", "-NonInteractive", "-EncodedCommand",
    encodeWindowsCommand(`$deadline = ${deadline}\n${WINDOWS_WAKE_SOURCE}`),
  ];
}

export function windowsLease(exec, now = Date.now) {
  const timeout = NATIVE_LEASE_MS + 3200;
  return exec("powershell.exe", windowsLeaseArgs(now() + NATIVE_LEASE_MS), { timeout });
}
