import type { AccessPoint, Band, ChannelBucket } from "./types";

const CHANNELS_24 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const CHANNELS_5 = [
  36, 40, 44, 48, 52, 56, 60, 64, 100, 104, 108, 112, 116, 120, 124, 128, 132,
  136, 140, 144, 149, 153, 157, 161, 165,
];

export function parseChannelField(raw?: string | number): {
  channel: number;
  band: Band;
  widthMHz?: number;
} {
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return { channel: raw, band: bandFromChannel(raw) };
  }
  if (!raw) return { channel: 0, band: "unknown" };
  const text = String(raw);
  const channelMatch = text.match(/(\d+)/);
  const channel = channelMatch ? Number(channelMatch[1]) : 0;
  let band: Band = "unknown";
  if (/6\s*ghz|6ghz/i.test(text)) band = "6";
  else if (/5\s*ghz|5ghz/i.test(text)) band = "5";
  else if (/2(\.4)?\s*ghz|2ghz/i.test(text)) band = "2.4";
  else band = bandFromChannel(channel);
  const widthMatch = text.match(/(\d+)\s*mhz/i);
  const widthMHz = widthMatch ? Number(widthMatch[1]) : undefined;
  return { channel, band, widthMHz };
}

export function bandFromChannel(channel: number): Band {
  if (channel >= 1 && channel <= 14) return "2.4";
  if (channel >= 32 && channel <= 177) return "5";
  if (channel >= 1 && channel <= 233 && channel > 177) return "6";
  return "unknown";
}

export function overlaps24(center: number, other: number, widthMHz = 20): boolean {
  const half = Math.max(2, Math.round(widthMHz / 10));
  return Math.abs(center - other) <= half;
}

export function occupied5Channels(center: number, widthMHz = 20): number[] {
  const count = Math.max(1, Math.round(widthMHz / 20));
  const idx = CHANNELS_5.indexOf(center);
  if (idx === -1) return [center];
  return CHANNELS_5.slice(idx, idx + count);
}

export function buildOccupancy(
  networks: AccessPoint[],
  band: "2.4" | "5",
): ChannelBucket[] {
  const channels = band === "2.4" ? CHANNELS_24 : CHANNELS_5;
  return channels.map((channel) => {
    const hitting = networks.filter((n) => {
      if (n.band !== band) return false;
      if (band === "2.4") return overlaps24(n.channel, channel, n.widthMHz ?? 20);
      return occupied5Channels(n.channel, n.widthMHz ?? 20).includes(channel);
    });
    const occupancy = hitting.reduce((sum, n) => {
      const rssi = n.rssi ?? -80;
      const weight = Math.max(0.15, Math.min(1, (rssi + 90) / 50));
      return sum + weight;
    }, 0);
    const strongest = hitting.reduce<number | undefined>((best, n) => {
      if (n.rssi === undefined) return best;
      return best === undefined ? n.rssi : Math.max(best, n.rssi);
    }, undefined);
    return {
      channel,
      band,
      occupancy: Math.round(occupancy * 10) / 10,
      networks: hitting.length,
      strongestRssi: strongest,
    };
  });
}

export function quietestChannel(
  buckets: ChannelBucket[],
  preferred: number[],
): number | undefined {
  const pool = preferred.length
    ? buckets.filter((b) => preferred.includes(b.channel))
    : buckets;
  if (!pool.length) return undefined;
  return [...pool].sort((a, b) => a.occupancy - b.occupancy || a.channel - b.channel)[0]
    ?.channel;
}

export function phyRank(phy?: string): number {
  const p = (phy ?? "").toLowerCase();
  if (p.includes("be") || p.includes("wifi 7") || p.includes("wi-fi 7")) return 7;
  if (p.includes("ax") || p.includes("wifi 6") || p.includes("wi-fi 6")) return 6;
  if (p.includes("ac") || p.includes("wifi 5")) return 5;
  if (p.includes("n") || p.includes("wifi 4")) return 4;
  if (p.includes("g") || p.includes("a")) return 3;
  if (p.includes("b")) return 2;
  return 0;
}
