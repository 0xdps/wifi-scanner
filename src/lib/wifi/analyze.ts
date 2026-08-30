import {
  buildOccupancy,
  phyRank,
  quietestChannel,
} from "./channels";
import { decorateScan, sameNetworkName } from "./identity";
import type { CurrentLink, Finding, PlanStep, RawScan, ScanResult } from "./types";

function clamp(n: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Math.round(n)));
}

function signalScore(rssi?: number, snr?: number): number {
  let score = 40;
  if (rssi !== undefined) {
    if (rssi >= -50) score = 100;
    else if (rssi >= -60) score = 82;
    else if (rssi >= -67) score = 64;
    else if (rssi >= -75) score = 42;
    else score = 22;
  }
  if (snr !== undefined) {
    const snrScore = snr >= 35 ? 100 : snr >= 25 ? 80 : snr >= 15 ? 55 : 30;
    score = (score * 2 + snrScore) / 3;
  }
  return clamp(score);
}

function congestionScore(coChannel: number, adjacent: number, band: string): number {
  const penalty = coChannel * (band === "2.4" ? 14 : 10) + adjacent * 4;
  return clamp(100 - penalty);
}

// Approximate PHY ceiling for a 2-stream client (most MacBooks) at the top MCS.
function rateCeilingMbps(widthMHz: number, phy: number): number {
  const vht: Record<number, number> = { 20: 173, 40: 400, 80: 866, 160: 1733 };
  const he: Record<number, number> = { 20: 287, 40: 574, 80: 1201, 160: 2402 };
  const table = phy >= 6 ? he : vht;
  const widths = [160, 80, 40, 20];
  const key = widths.find((w) => widthMHz >= w) ?? 20;
  return table[key];
}

// Rough SNR needed to hold a given MCS index on a VHT/HE link.
const MCS_SNR_FLOOR = [5, 8, 11, 14, 18, 21, 23, 25, 29, 31, 34, 37];

function mcsFromSnr(snr: number): number {
  let best = 0;
  MCS_SNR_FLOOR.forEach((floor, idx) => {
    if (snr >= floor) best = idx;
  });
  return best;
}

function snrLimitedRate(snr: number, ceiling: number, phy: number): number {
  const topMcs = phy >= 6 ? 11 : 9;
  const usable = Math.min(mcsFromSnr(snr), topMcs);
  return Math.round((ceiling * (usable + 1)) / (topMcs + 1));
}

function efficiencyScore(cur: CurrentLink | null): number {
  if (!cur) return 35;
  const phy = phyRank(cur.phyMode);
  const phyScore = phy >= 7 ? 100 : phy === 6 ? 90 : phy === 5 ? 72 : phy === 4 ? 48 : 28;
  const bandScore = cur.band === "6" ? 100 : cur.band === "5" ? 86 : cur.band === "2.4" ? 40 : 50;
  const width = cur.widthMHz ?? (cur.band === "2.4" ? 20 : 40);
  const widthScore =
    cur.band === "2.4"
      ? width <= 20
        ? 80
        : 45
      : width >= 160
        ? 100
        : width >= 80
          ? 88
          : width >= 40
            ? 70
            : 55;
  const rateScore = cur.txRateMbps
    ? clamp(Math.min(100, (cur.txRateMbps / (cur.band === "2.4" ? 150 : 600)) * 100))
    : 60;
  return clamp(phyScore * 0.35 + bandScore * 0.3 + widthScore * 0.2 + rateScore * 0.15);
}

export function analyzeScan(raw: RawScan): ScanResult {
  const { current: cur, networks, privacy } = decorateScan(raw);

  const channels24 = buildOccupancy(networks, "2.4");
  const channels5 = buildOccupancy(networks, "5");
  const recommendedChannel24 = quietestChannel(channels24, [1, 6, 11]);
  const recommendedChannel5 = quietestChannel(channels5, []);

  const currentLabel = cur?.label ?? cur?.ssid ?? "this network";
  const sameChannel = networks.filter(
    (n) => cur && n.channel === cur.channel && n.band === cur.band && !n.isCurrent,
  );
  const adjacent24 =
    cur?.band === "2.4"
      ? networks.filter(
          (n) => n.band === "2.4" && n.channel !== cur.channel && Math.abs(n.channel - cur.channel) <= 4,
        ).length
      : 0;

  const findings: Finding[] = [];
  const plan: PlanStep[] = [];

  if (privacy.ssidsRedacted) {
    findings.push({
      id: "ssid-redacted",
      title:
        privacy.redactedNetworks > 0
          ? `macOS hid ${privacy.redactedNetworks} network name${privacy.redactedNetworks > 1 ? "s" : ""}`
          : "macOS hid the network name",
      detail:
        "Since macOS 15, SSIDs are location data: command-line tools get \"<redacted>\" unless the caller has a Location Services grant. Every radio measurement here (channel, width, RSSI, noise, PHY, security) is still exact, so the plan is unaffected. Names are shown as AP-<channel><letter>.",
      severity: "ok",
    });
  }

  if (!cur) {
    findings.push({
      id: "disconnected",
      title: "No active Wi-Fi link",
      detail: "The scanner did not see an associated network. Join a network and scan again.",
      severity: "critical",
    });
    plan.push({
      id: "join",
      priority: "now",
      title: "Connect the Mac to Wi-Fi, then rescan",
      why: "A plan needs the associated BSSID, RSSI, channel, and PHY mode.",
      how: "Join your usual SSID, keep this app running on the Mac, and click Scan.",
      expectedGain: "Unlocks a real improvement plan instead of a generic checklist.",
    });
  } else {
    if ((cur.rssi ?? -100) < -70) {
      findings.push({
        id: "weak-rssi",
        title: "Weak received signal",
        detail: `RSSI is ${cur.rssi} dBm. Below about -67 dBm, Macs drop MCS rates and latency spikes.`,
        severity: "critical",
      });
      plan.push({
        id: "move-ap",
        priority: "now",
        title: "Shorten the path between the Mac and the access point",
        why: "Airtime efficiency collapses when the radio retries at low MCS.",
        how: "Move the AP off the floor and away from metal, or sit the Mac in the same room. Avoid microwave ovens, baby monitors, and USB 3 hubs near the lid antennas.",
        expectedGain: "Often +1 to +2 MCS steps, which can double throughput on 2.4 GHz.",
      });
    } else if ((cur.rssi ?? -100) < -60) {
      findings.push({
        id: "fair-rssi",
        title: "Signal is only fair",
        detail: `RSSI ${cur.rssi} dBm is usable but leaves little fade margin.`,
        severity: "warn",
      });
      const phy = phyRank(cur.phyMode);
      const width = cur.widthMHz ?? 80;
      const ceiling = rateCeilingMbps(width, phy);
      const snr = cur.snr;
      const gainDb = Math.max(4, Math.round(32 - (snr ?? 32)));
      plan.push({
        id: "signal-headroom",
        priority: "now",
        title: `Raise signal by ~${gainDb} dB to unlock the rest of your ${width} MHz channel`,
        why:
          snr !== undefined
            ? `SNR ${snr} dB caps you near MCS ${mcsFromSnr(snr)}. A ${width} MHz ${cur.phyMode ?? "link"} can reach about ${ceiling} Mbps, but this SNR supports roughly ${snrLimitedRate(snr, ceiling, phy)} Mbps${cur.txRateMbps ? ` and you are negotiating ${cur.txRateMbps} Mbps` : ""}. Signal, not congestion, is the limit.`
            : `RSSI ${cur.rssi} dBm leaves the link well below the ~${ceiling} Mbps this channel width allows.`,
        how: "Reduce the number of walls between the Mac and the AP: raise the router to desk height or above, keep it out of cabinets and away from metal, mirrors, and TVs, and orient antennas vertically. If the AP cannot move, add a mesh node or wired access point in the room where you work.",
        expectedGain: `Each ~6 dB roughly doubles usable MCS headroom. Reaching -55 dBm typically lands ${Math.round(ceiling * 0.7)}–${ceiling} Mbps instead of ${cur.txRateMbps ?? "current"} Mbps.`,
      });
    } else {
      findings.push({
        id: "rssi-ok",
        title: "Signal strength is healthy",
        detail: `RSSI ${cur.rssi ?? "n/a"} dBm is strong enough for high MCS.`,
        severity: "ok",
      });
    }

    if (cur.snr !== undefined && cur.snr < 25) {
      findings.push({
        id: "low-snr",
        title: "Low signal-to-noise ratio",
        detail: `SNR is ${cur.snr} dB (noise ${cur.noise ?? "n/a"} dBm). Noise this high usually means co-channel contention, not distance.`,
        severity: cur.snr < 15 ? "critical" : "warn",
      });
    }

    if (cur.band === "2.4") {
      findings.push({
        id: "on-24",
        title: "Mac is on the 2.4 GHz band",
        detail: "2.4 GHz is slow, overlapping, and shared with Bluetooth. It is the usual reason a Mac feels “stuck” at tens of Mbps.",
        severity: "critical",
      });
      // Without a readable SSID, a same-name twin cannot be identified, so fall
      // back to the strongest 5 GHz BSS rather than claiming it is the user's.
      const fiveGhzHome = privacy.ssidsRedacted
        ? networks.filter((n) => n.band === "5" && (n.rssi ?? -100) > -75)
        : networks.filter(
            (n) =>
              n.band === "5" &&
              (sameNetworkName(n.ssid, cur.ssid) ||
                n.ssid.replace(/[-_ ]?(5g|5ghz|5|fast)$/i, "") ===
                  cur.ssid.replace(/[-_ ]?(2g|2ghz|2\.4|24g)?$/i, "")),
          );
      if (fiveGhzHome.length) {
        const twin = fiveGhzHome[0];
        plan.push({
          id: "prefer-5",
          priority: "now",
          title: privacy.ssidsRedacted
            ? `Move this Mac to the 5 GHz radio (${twin.label ?? "5 GHz AP"} on ch ${twin.channel})`
            : `Join ${twin.ssid} (5 GHz) instead of ${currentLabel}`,
          why: `A 5 GHz BSS is visible at ${twin.rssi ?? "unknown"} dBm with ${twin.phyMode ?? "modern"} PHY. Your Mac is still on 802.11n 2.4 GHz.`,
          how: "On the Mac: Wi-Fi menu → the 5 GHz SSID. On the router: enable band steering or give 2.4 and 5 GHz distinct names so you can pick. Disable “Auto” join on the 2.4 GHz name.",
          expectedGain: "Typical jump from ~70 Mbps PHY to several hundred Mbps, with lower latency.",
        });
      } else {
        plan.push({
          id: "enable-5",
          priority: "now",
          title: "Turn on a 5 GHz (or 6 GHz) SSID on the router",
          why: "No 5 GHz network with a related name was seen. The Mac cannot go faster than 2.4 GHz physics allow.",
          how: "In the router admin page, enable 5 GHz / Wi-Fi 6, set a clear SSID, WPA3 or WPA2, and 80 MHz width if neighbors are quiet.",
          expectedGain: "Largest single upgrade available on most home networks.",
        });
      }
    } else {
      findings.push({
        id: "band-ok",
        title: `Operating on ${cur.band} GHz`,
        detail: "This band has non-overlapping channels and much more airtime than 2.4 GHz.",
        severity: "ok",
      });
    }

    // Upper 5 GHz (UNII-3) attenuates noticeably more through walls than UNII-1.
    if (cur.band === "5" && cur.channel >= 149 && (cur.rssi ?? -100) < -60) {
      const lowerQuiet = quietestChannel(
        channels5.filter((b) => b.channel >= 36 && b.channel <= 48),
        [],
      );
      findings.push({
        id: "upper-unii",
        title: `Channel ${cur.channel} sits in the weakest-propagating part of 5 GHz`,
        detail: `At ~5.765 GHz, wall and floor loss is a few dB worse than the 5.18 GHz channels. With RSSI already at ${cur.rssi} dBm, that penalty is costing you MCS steps.`,
        severity: "warn",
      });
      if (lowerQuiet) {
        plan.push({
          id: "lower-unii",
          priority: "now",
          title: `Move the 5 GHz radio to channel ${lowerQuiet}`,
          why: `Lower 5 GHz channels punch through walls better than channel ${cur.channel}, and channel ${lowerQuiet} is the quietest slot in this scan. It is also non-DFS, so you avoid radar-triggered channel changes that drop the link.`,
          how: `Router admin → 5 GHz → Channel: ${lowerQuiet} (static, not Auto). Keep width at ${cur.widthMHz ?? 80} MHz. Rejoin from the Mac and rescan to compare RSSI.`,
          expectedGain: "Typically 2–4 dB more signal for free, which is often one full MCS step.",
        });
      }
    }

    // Wider channels lower SNR per subcarrier; widening a weak link makes it worse.
    if (cur.band !== "2.4" && (cur.snr ?? 40) < 25 && (cur.widthMHz ?? 20) >= 80) {
      plan.push({
        id: "hold-width",
        priority: "soon",
        title: `Do not widen past ${cur.widthMHz} MHz until signal improves`,
        why: `Doubling channel width adds about 3 dB of noise, and your SNR is only ${cur.snr} dB. Switching to 160 MHz now would very likely lower throughput, not raise it.`,
        how: "Leave width where it is. Fix signal first, rescan, and only then test a wider channel and compare actual transfer speed.",
        expectedGain: "Avoids a common change that quietly makes a weak link slower.",
      });
    }

    if (sameChannel.length >= 3) {
      findings.push({
        id: "cochannel",
        title: `Channel ${cur.channel} is crowded`,
        detail: `${sameChannel.length} other BSS share this channel: ${sameChannel
          .slice(0, 4)
          .map((n) => n.label ?? n.ssid)
          .join(", ")}${sameChannel.length > 4 ? "…" : ""}.`,
        severity: "warn",
      });
      const rec = cur.band === "2.4" ? recommendedChannel24 : recommendedChannel5;
      if (rec && rec !== cur.channel) {
        plan.push({
          id: "retune-channel",
          priority: "now",
          title: `Move the access point to channel ${rec}`,
          why: `Channel ${cur.channel} has the most overlapping networks. Channel ${rec} is the quietest option in this scan.`,
          how:
            cur.band === "2.4"
              ? "Set 2.4 GHz to 20 MHz width and a static channel (1, 6, or 11 only). Avoid “Auto” if it keeps landing on a busy channel."
              : "Set 5 GHz to a static channel. Prefer a UNI-II / DFS channel if your router supports it and occupancy is lower there.",
          expectedGain: "Fewer retries and more consistent latency; speed can rise 20–50% in apartments.",
        });
      }
    }

    if (cur.band === "2.4" && (cur.widthMHz ?? 20) > 20) {
      findings.push({
        id: "wide-24",
        title: "40 MHz on 2.4 GHz wastes airtime",
        detail: "A 40 MHz 2.4 GHz BSS overlaps almost the entire band and fights every neighbor.",
        severity: "warn",
      });
      plan.push({
        id: "narrow-24",
        priority: "soon",
        title: "Force 2.4 GHz channel width to 20 MHz",
        why: "Wider 2.4 GHz channels reduce everyone’s efficiency, including yours.",
        how: "Router wireless settings → 2.4 GHz → Channel width: 20 MHz. Keep IoT devices on this radio.",
        expectedGain: "More stable links for printers and sensors; less self-interference with 5 GHz clients.",
      });
    }

    const phy = phyRank(cur.phyMode);
    if (phy > 0 && phy < 6) {
      findings.push({
        id: "legacy-phy",
        title: `Link is ${cur.phyMode || "legacy"}`,
        detail: "Wi-Fi 6/6E (802.11ax) uses OFDMA and better scheduling. Older PHYs spend more airtime per byte.",
        severity: phy < 5 ? "critical" : "warn",
      });
      plan.push({
        id: "wifi6",
        priority: phy < 5 ? "now" : "soon",
        title: "Enable Wi-Fi 6 on the AP and let the Mac negotiate 802.11ax",
        why: "This Mac supports modern PHYs; the current association is down-negotiated.",
        how: "Update router firmware, enable 802.11ax, and disable 802.11b. Forget the network on the Mac (System Settings → Wi-Fi → Details → Forget) and rejoin.",
        expectedGain: "Higher MCS, lower latency under load, better multi-device efficiency.",
      });
    }

    const sec = (cur.security || "").toLowerCase();
    // WPA/WPA2 mixed mode can keep TKIP enabled, and 802.11n/ac forbid HT/VHT rates with TKIP.
    if (sec.includes("mixed") || (sec.includes("wpa") && sec.includes("wpa2") && !sec.includes("wpa3"))) {
      findings.push({
        id: "mixed-security",
        title: `Security is ${cur.security}`,
        detail: "Mixed WPA/WPA2 mode usually leaves TKIP enabled. The 802.11n and 802.11ac specs forbid high-throughput rates on a TKIP-capable BSS, so some APs silently cap the whole network to legacy speeds.",
        severity: "warn",
      });
      plan.push({
        id: "aes-only",
        priority: "now",
        title: "Switch the SSID to WPA2 AES-only (or WPA2/WPA3)",
        why: "Mixed mode is the single most common hidden throughput cap on otherwise healthy 802.11ac links. If TKIP is advertised, your Mac may be barred from VHT rates entirely.",
        how: "Router admin → Wireless Security → set WPA2-PSK with AES/CCMP only, or WPA2/WPA3 transition. Remove any “WPA/WPA2 mixed”, “TKIP”, or “TKIP+AES” option. Then forget and rejoin on the Mac.",
        expectedGain: "If TKIP was the cap, throughput can jump several times over with no hardware change.",
      });
    }
    if (sec.includes("open") || sec.includes("none") || sec.includes("wep")) {
      findings.push({
        id: "insecure",
        title: "Network security is too weak",
        detail: `${cur.security} also forces older rates on many APs.`,
        severity: "critical",
      });
      plan.push({
        id: "wpa3",
        priority: "now",
        title: "Switch the SSID to WPA3 Personal (or WPA2/WPA3 transition)",
        why: "Open/WEP networks are slow and unsafe. WPA3 PMF also cuts some spoofing that disrupts roaming.",
        how: "Router security mode → WPA3 or WPA2/WPA3. Rejoin from the Mac; do not use a separate open “guest” for your workstation.",
        expectedGain: "Removes a class of stalls and protects traffic on shared spectrum.",
      });
    }

    const openNeighbors = networks.filter((n) =>
      (n.security || "").toLowerCase().match(/open|none/),
    );
    if (openNeighbors.length) {
      findings.push({
        id: "open-neighbors",
        title: `${openNeighbors.length} open nearby network${openNeighbors.length > 1 ? "s" : ""}`,
        detail: openNeighbors.map((n) => n.label ?? n.ssid).join(", "),
        severity: "ok",
      });
    }
  }

  plan.push({
    id: "mac-stack",
    priority: "soon",
    title: "Clean the Mac Wi-Fi stack after a noisy scan",
    why: "Stale preferred-network order, private Wi-Fi address, and cached 2.4 GHz BSSIDs keep a Mac on a bad radio.",
    how: "System Settings → Wi-Fi → Details: turn off Auto-Join for the slow SSID, keep Private Wi-Fi Address on unless a captive portal breaks, then Forget and rejoin the fast SSID. Toggle Wi-Fi off/on once.",
    expectedGain: "Stops the Mac from silently falling back to 2.4 GHz after sleep.",
  });

  plan.push({
    id: "airtime",
    priority: "later",
    title: "Keep slow devices off the fast radio",
    why: "One 802.11g IoT gadget on the same BSS can cut AP efficiency in half.",
    how: "Put cameras, plugs, and printers on a 2.4 GHz IoT SSID. Leave laptops and phones on 5/6 GHz only. Disable legacy rates (1–11 Mbps) if the AP allows it.",
    expectedGain: "More airtime for the Mac during calls and large transfers.",
  });

  plan.push({
    id: "wired",
    priority: "later",
    title: "Use Ethernet or USB-C adapter for bulk transfers",
    why: "Even a perfect 5 GHz link shares airtime with every neighbor. Wired bypasses contention.",
    how: "Thunderbolt/USB-C gigabit adapter into the router or a switch. Keep Wi-Fi for mobility only.",
    expectedGain: "Sustained gigabit with zero radio retries.",
  });

  const sig = signalScore(cur?.rssi, cur?.snr);
  const cong = congestionScore(sameChannel.length, adjacent24, cur?.band ?? "2.4");
  const eff = efficiencyScore(cur);
  const overall = clamp(sig * 0.35 + cong * 0.35 + eff * 0.3);

  const order: Record<PlanStep["priority"], number> = { now: 0, soon: 1, later: 2 };
  plan.sort((a, b) => order[a.priority] - order[b.priority]);

  return {
    scannedAt: new Date().toISOString(),
    platform: raw.platform,
    source: raw.source,
    sourceNote: raw.sourceNote,
    current: cur,
    networks,
    scores: { overall, signal: sig, congestion: cong, efficiency: eff },
    findings,
    plan,
    channels24,
    channels5,
    recommendedChannel24,
    recommendedChannel5,
    privacy,
  };
}
