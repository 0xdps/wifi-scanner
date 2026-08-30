import { analyzeScan } from "../src/lib/wifi/analyze";
import type { RawScan } from "../src/lib/wifi/types";

// Reproduces a real reported capture: 5 GHz ch 153, 80 MHz, 802.11ac, WPA2 mixed,
// clear spectrum but RSSI -67 dBm and only 175 Mbps negotiated.
const fixture: RawScan = {
  platform: "darwin",
  source: "macos",
  sourceNote: "fixture",
  current: {
    interfaceName: "en0",
    ssid: "HomeAP",
    rssi: -67,
    noise: -90,
    snr: 23,
    channel: 153,
    band: "5",
    widthMHz: 80,
    phyMode: "802.11ac",
    security: "Wpa2 Personal Mixed",
    txRateMbps: 175,
    isCurrent: true,
  },
  networks: [
    { ssid: "HomeAP", rssi: -67, channel: 153, band: "5", widthMHz: 80, phyMode: "802.11ac", security: "Wpa2 Personal Mixed", isCurrent: true },
    { ssid: "Neighbor-A", rssi: -80, channel: 157, band: "5", widthMHz: 80, phyMode: "802.11ac", security: "WPA2 Personal" },
    { ssid: "IoT-24", rssi: -70, channel: 9, band: "2.4", widthMHz: 20, phyMode: "802.11n", security: "WPA2 Personal" },
    { ssid: "Neighbor-B", rssi: -76, channel: 10, band: "2.4", widthMHz: 20, phyMode: "802.11n", security: "WPA2 Personal" },
    { ssid: "Neighbor-C", rssi: -78, channel: 11, band: "2.4", widthMHz: 20, phyMode: "802.11n", security: "WPA2 Personal" },
  ],
};

const result = analyzeScan(fixture);
console.log("scores:", result.scores);
console.log("\nfindings:");
for (const f of result.findings) console.log(`  [${f.severity}] ${f.title}`);
console.log("\nplan order:");
result.plan.forEach((s, i) => console.log(`  ${i + 1}. [${s.priority}] ${s.title}`));
console.log("\nquietest 5 GHz:", result.recommendedChannel5);
