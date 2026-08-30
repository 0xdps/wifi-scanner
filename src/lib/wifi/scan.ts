import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import { analyzeScan } from "./analyze";
import { demoScan } from "./demo";
import { isHiddenName } from "./identity";
import { parseNmcliDevWifi } from "./parse-linux";
import { parseMacProfilerJson } from "./parse-macos";
import { recoverCurrentSsid } from "./ssid-recovery";
import type { RawScan, ScanResult } from "./types";

const execFileAsync = promisify(execFile);

async function tryMacScan(): Promise<RawScan | null> {
  try {
    const { stdout } = await execFileAsync(
      "system_profiler",
      ["SPAirPortDataType", "-json"],
      { timeout: 45_000, maxBuffer: 20 * 1024 * 1024 },
    );
    return parseMacProfilerJson(stdout);
  } catch {
    return null;
  }
}

async function tryLinuxScan(): Promise<RawScan | null> {
  try {
    const { stdout } = await execFileAsync(
      "nmcli",
      [
        "-t",
        "-f",
        "IN-USE,SSID,BSSID,MODE,CHAN,RATE,SIGNAL,SECURITY",
        "dev",
        "wifi",
        "list",
      ],
      { timeout: 20_000 },
    );
    return parseNmcliDevWifi(stdout);
  } catch {
    return null;
  }
}

async function trySavedDump(path: string): Promise<RawScan | null> {
  try {
    const text = await readFile(path, "utf8");
    const parsed = parseMacProfilerJson(text);
    if (!parsed) return null;
    return {
      ...parsed,
      sourceNote: `Saved macOS capture from ${path}.`,
    };
  } catch {
    return null;
  }
}

/**
 * System Profiler hides the SSID unless the caller holds a Location Services
 * grant, so ask the other macOS interfaces before giving up on the name.
 */
async function withRecoveredSsid(raw: RawScan): Promise<RawScan> {
  if (!raw.current || !isHiddenName(raw.current.ssid)) return raw;
  const recovered = await recoverCurrentSsid(raw.current.interfaceName);
  if (!recovered) return raw;
  return {
    ...raw,
    current: { ...raw.current, ssid: recovered.ssid, redacted: false },
    resolvedVia: recovered.via,
  };
}

export async function runWifiScan(): Promise<ScanResult> {
  const savedPath = process.env.WIFI_SCAN_FILE;
  if (savedPath) {
    const saved = await trySavedDump(savedPath);
    if (saved) return analyzeScan(await withRecoveredSsid(saved));
  }
  if (process.platform === "darwin") {
    const live = await tryMacScan();
    if (live) return analyzeScan(await withRecoveredSsid(live));
  }
  if (process.platform === "linux") {
    const live = await tryLinuxScan();
    if (live) return analyzeScan(live);
  }
  return analyzeScan(demoScan());
}
