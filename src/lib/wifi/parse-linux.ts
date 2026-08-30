import { bandFromChannel } from "./channels";
import type { AccessPoint, CurrentLink, RawScan } from "./types";

export function parseNmcliDevWifi(text: string): RawScan | null {
  const lines = text
    .split("\n")
    .map((l) => l.trimEnd())
    .filter(Boolean);
  if (!lines.length) return null;

  const networks: AccessPoint[] = [];
  let current: CurrentLink | null = null;

  for (const line of lines) {
    const active = line.startsWith("*");
    const rest = line.replace(/^\*\s*/, "");
    const parts = rest.split(":").map((p) => p.replace(/\\:/g, ":"));
    if (parts.length < 5) continue;
    const [ssid, bssid, mode, chan, rate, signal, security] = [
      parts[0],
      parts[1],
      parts[2],
      parts[3],
      parts[4],
      parts[5],
      parts.slice(6).join(" "),
    ];
    const channel = Number(chan) || 0;
    const signalPct = Number(signal);
    const rssi = Number.isFinite(signalPct) ? Math.round(signalPct / 2 - 100) : undefined;
    const ap: AccessPoint = {
      ssid: ssid || "(hidden)",
      bssid,
      rssi,
      channel,
      band: bandFromChannel(channel),
      phyMode: mode,
      security: security || undefined,
      txRateMbps: Number.parseInt(rate, 10) || undefined,
      isCurrent: active,
    };
    networks.push(ap);
    if (active) {
      current = { ...ap, interfaceName: "wlan0" };
    }
  }

  if (!networks.length) return null;
  return {
    platform: "linux",
    source: "linux",
    sourceNote: "Live capture from NetworkManager (nmcli).",
    current,
    networks,
  };
}
