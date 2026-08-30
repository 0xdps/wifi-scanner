import type { AccessPoint, CurrentLink, RawScan } from "./types";

const current: CurrentLink = {
  interfaceName: "en0",
  ssid: "HomeOffice",
  bssid: "a4:83:e7:12:9c:10",
  rssi: -67,
  noise: -88,
  snr: 21,
  channel: 6,
  band: "2.4",
  widthMHz: 20,
  phyMode: "802.11n",
  security: "WPA2 Personal",
  txRateMbps: 72,
  mcs: 7,
  isCurrent: true,
};

const neighbors: AccessPoint[] = [
  {
    ssid: "HomeOffice-5G",
    rssi: -54,
    channel: 36,
    band: "5",
    widthMHz: 80,
    phyMode: "802.11ax",
    security: "WPA3 Personal",
  },
  {
    ssid: "HomeOffice",
    rssi: -67,
    channel: 6,
    band: "2.4",
    widthMHz: 20,
    phyMode: "802.11n",
    security: "WPA2 Personal",
    isCurrent: true,
  },
  { ssid: "NETGEAR-Guest", rssi: -58, channel: 6, band: "2.4", widthMHz: 40, phyMode: "802.11n", security: "WPA2 Personal" },
  { ssid: "xfinitywifi", rssi: -62, channel: 1, band: "2.4", widthMHz: 20, phyMode: "802.11n", security: "Open" },
  { ssid: "APT-4B", rssi: -71, channel: 6, band: "2.4", widthMHz: 20, phyMode: "802.11g", security: "WPA2 Personal" },
  { ssid: "CafeDownstairs", rssi: -74, channel: 11, band: "2.4", widthMHz: 20, phyMode: "802.11n", security: "WPA2 Personal" },
  { ssid: "PrinterSetup", rssi: -69, channel: 6, band: "2.4", widthMHz: 20, phyMode: "802.11n", security: "Open" },
  { ssid: "IoT-Mesh", rssi: -61, channel: 1, band: "2.4", widthMHz: 20, phyMode: "802.11n", security: "WPA2 Personal" },
  { ssid: "Neighbor-5G", rssi: -63, channel: 36, band: "5", widthMHz: 80, phyMode: "802.11ac", security: "WPA2 Personal" },
  { ssid: "OfficeTower", rssi: -70, channel: 40, band: "5", widthMHz: 40, phyMode: "802.11ac", security: "WPA2 Enterprise" },
  { ssid: "Spectrum-149", rssi: -72, channel: 149, band: "5", widthMHz: 80, phyMode: "802.11ax", security: "WPA3 Personal" },
  { ssid: "Hidden", rssi: -78, channel: 44, band: "5", widthMHz: 20, phyMode: "802.11n", security: "WPA2 Personal" },
];

export function demoScan(): RawScan {
  return {
    platform: "other",
    source: "demo",
    sourceNote:
      "This environment is not a Mac with Wi-Fi radios. Showing a typical congested apartment scan so you can review the plan. Run this app on your Mac for a live capture.",
    current,
    networks: neighbors,
  };
}
