import { parseChannelField } from "./channels";
import { isHiddenName } from "./identity";
import type { AccessPoint, CurrentLink, RawScan } from "./types";

interface ProfilerNetwork {
  _name?: string;
  spairport_network_channel?: string | number;
  spairport_network_phymode?: string;
  spairport_network_mcs?: number;
  spairport_network_rssi?: number;
  spairport_signal_noise?: string;
  spairport_network_noise?: number;
  spairport_network_rate?: number;
  spairport_security_mode?: string;
  spairport_network_bssid?: string;
  spairport_network_country_code?: string;
}

interface ProfilerInterface {
  _name?: string;
  spairport_status_information?: string;
  spairport_current_network_information?: ProfilerNetwork;
  spairport_airport_other_local_wireless_networks?: ProfilerNetwork[];
  spairport_airport_local_wireless_networks?: ProfilerNetwork[];
}

interface ProfilerAirport {
  spairport_airport_interfaces?: ProfilerInterface[];
  spairport_software_wlan_translations_version?: string;
}

function humanSecurity(raw?: string): string | undefined {
  if (!raw) return undefined;
  return raw
    .replace(/^spairport_security_mode_/i, "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function parseRssiNoise(n: ProfilerNetwork): { rssi?: number; noise?: number } {
  if (typeof n.spairport_network_rssi === "number") {
    return { rssi: n.spairport_network_rssi, noise: n.spairport_network_noise };
  }
  const combo = n.spairport_signal_noise;
  if (!combo) return {};
  const match = combo.match(/(-?\d+)\s*.*?(-?\d+)/);
  if (!match) return {};
  return { rssi: Number(match[1]), noise: Number(match[2]) };
}

function toAccessPoint(n: ProfilerNetwork, isCurrent = false): AccessPoint {
  const ch = parseChannelField(n.spairport_network_channel);
  const { rssi, noise } = parseRssiNoise(n);
  const name = n._name ?? "";
  const bssid = n.spairport_network_bssid;
  return {
    ssid: name,
    bssid: isHiddenName(bssid) ? undefined : bssid,
    redacted: isHiddenName(name),
    rssi,
    noise,
    channel: ch.channel,
    band: ch.band,
    widthMHz: ch.widthMHz,
    phyMode: n.spairport_network_phymode,
    security: humanSecurity(n.spairport_security_mode),
    txRateMbps: n.spairport_network_rate,
    mcs: n.spairport_network_mcs,
    isCurrent,
  };
}

export function parseMacProfilerJson(jsonText: string): RawScan | null {
  let parsed: { SPAirPortDataType?: ProfilerAirport[] };
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return null;
  }
  const airport = parsed.SPAirPortDataType?.[0];
  const iface =
    airport?.spairport_airport_interfaces?.find((i) =>
      Boolean(i.spairport_current_network_information),
    ) ?? airport?.spairport_airport_interfaces?.[0];
  if (!iface) return null;

  const currentNet = iface.spairport_current_network_information;
  const currentAp = currentNet ? toAccessPoint(currentNet, true) : null;
  const current: CurrentLink | null = currentAp
    ? {
        ...currentAp,
        interfaceName: iface._name || "en0",
        countryCode: currentNet?.spairport_network_country_code,
        snr:
          currentAp.rssi !== undefined && currentAp.noise !== undefined
            ? currentAp.rssi - currentAp.noise
            : undefined,
      }
    : null;

  const others = [
    ...(iface.spairport_airport_other_local_wireless_networks ?? []),
    ...(iface.spairport_airport_local_wireless_networks ?? []),
  ];
  const networks = others.map((n) => toAccessPoint(n));
  if (currentAp) {
    // Only a BSSID proves two entries are the same radio. Comparing SSIDs would
    // match every hidden network against each other and drop the current link.
    const duplicate = currentAp.bssid
      ? networks.findIndex((n) => n.bssid && n.bssid === currentAp.bssid)
      : networks.findIndex(
          (n) =>
            !n.redacted &&
            !currentAp.redacted &&
            n.ssid === currentAp.ssid &&
            n.channel === currentAp.channel,
        );
    if (duplicate >= 0) {
      networks[duplicate] = { ...networks[duplicate], isCurrent: true };
    } else {
      networks.unshift(currentAp);
    }
  }

  return {
    platform: "darwin",
    source: "macos",
    sourceNote: "Live capture from macOS System Profiler (SPAirPortDataType).",
    current,
    networks,
  };
}
