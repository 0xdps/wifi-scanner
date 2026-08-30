import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { isHiddenName } from "./identity";
import type { PrivacyState } from "./types";

const execFileAsync = promisify(execFile);

export interface RecoveredSsid {
  ssid: string;
  via: NonNullable<PrivacyState["resolvedVia"]>;
}

async function run(cmd: string, args: string[]): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync(cmd, args, { timeout: 8_000 });
    return stdout;
  } catch {
    return null;
  }
}

/** `Current Wi-Fi Network: name` — still works on macOS 13 and 14. */
async function viaNetworksetup(iface: string): Promise<string | null> {
  const out = await run("networksetup", ["-getairportnetwork", iface]);
  const match = out?.match(/Current Wi-Fi Network:\s*(.+)/i);
  return match ? match[1].trim() : null;
}

/** `SSID : name` in the DHCP summary; unredacted when Location Services is granted. */
async function viaIpconfig(iface: string): Promise<string | null> {
  const out = await run("ipconfig", ["getsummary", iface]);
  const match = out?.match(/^\s*SSID\s*:\s*(.+)$/im);
  return match ? match[1].trim() : null;
}

/**
 * macOS withholds the SSID from unsigned CLI callers, so try the remaining
 * interfaces that sometimes answer before falling back to a synthesized label.
 * `WIFI_SSID` lets the user state the name outright.
 */
export async function recoverCurrentSsid(iface: string): Promise<RecoveredSsid | null> {
  const override = process.env.WIFI_SSID?.trim();
  if (override) return { ssid: override, via: "env" };

  if (process.platform !== "darwin") return null;

  const attempts: Array<[NonNullable<PrivacyState["resolvedVia"]>, Promise<string | null>]> = [
    ["networksetup", viaNetworksetup(iface)],
    ["ipconfig", viaIpconfig(iface)],
  ];

  for (const [via, promise] of attempts) {
    const value = await promise;
    if (value && !isHiddenName(value)) return { ssid: value, via };
  }
  return null;
}
