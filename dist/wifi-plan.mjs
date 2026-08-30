// src/lib/wifi/scan.ts
import { execFile as execFile2 } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify as promisify2 } from "node:util";

// src/lib/wifi/channels.ts
var CHANNELS_24 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
var CHANNELS_5 = [
  36,
  40,
  44,
  48,
  52,
  56,
  60,
  64,
  100,
  104,
  108,
  112,
  116,
  120,
  124,
  128,
  132,
  136,
  140,
  144,
  149,
  153,
  157,
  161,
  165
];
function parseChannelField(raw) {
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return { channel: raw, band: bandFromChannel(raw) };
  }
  if (!raw) return { channel: 0, band: "unknown" };
  const text = String(raw);
  const channelMatch = text.match(/(\d+)/);
  const channel = channelMatch ? Number(channelMatch[1]) : 0;
  let band = "unknown";
  if (/6\s*ghz|6ghz/i.test(text)) band = "6";
  else if (/5\s*ghz|5ghz/i.test(text)) band = "5";
  else if (/2(\.4)?\s*ghz|2ghz/i.test(text)) band = "2.4";
  else band = bandFromChannel(channel);
  const widthMatch = text.match(/(\d+)\s*mhz/i);
  const widthMHz = widthMatch ? Number(widthMatch[1]) : void 0;
  return { channel, band, widthMHz };
}
function bandFromChannel(channel) {
  if (channel >= 1 && channel <= 14) return "2.4";
  if (channel >= 32 && channel <= 177) return "5";
  if (channel >= 1 && channel <= 233 && channel > 177) return "6";
  return "unknown";
}
function overlaps24(center, other, widthMHz = 20) {
  const half = Math.max(2, Math.round(widthMHz / 10));
  return Math.abs(center - other) <= half;
}
function occupied5Channels(center, widthMHz = 20) {
  const count = Math.max(1, Math.round(widthMHz / 20));
  const idx = CHANNELS_5.indexOf(center);
  if (idx === -1) return [center];
  return CHANNELS_5.slice(idx, idx + count);
}
function buildOccupancy(networks, band) {
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
    const strongest = hitting.reduce((best, n) => {
      if (n.rssi === void 0) return best;
      return best === void 0 ? n.rssi : Math.max(best, n.rssi);
    }, void 0);
    return {
      channel,
      band,
      occupancy: Math.round(occupancy * 10) / 10,
      networks: hitting.length,
      strongestRssi: strongest
    };
  });
}
function quietestChannel(buckets, preferred) {
  const pool = preferred.length ? buckets.filter((b) => preferred.includes(b.channel)) : buckets;
  if (!pool.length) return void 0;
  return [...pool].sort((a, b) => a.occupancy - b.occupancy || a.channel - b.channel)[0]?.channel;
}
function phyRank(phy) {
  const p = (phy ?? "").toLowerCase();
  if (p.includes("be") || p.includes("wifi 7") || p.includes("wi-fi 7")) return 7;
  if (p.includes("ax") || p.includes("wifi 6") || p.includes("wi-fi 6")) return 6;
  if (p.includes("ac") || p.includes("wifi 5")) return 5;
  if (p.includes("n") || p.includes("wifi 4")) return 4;
  if (p.includes("g") || p.includes("a")) return 3;
  if (p.includes("b")) return 2;
  return 0;
}

// src/lib/wifi/identity.ts
var REDACTED = /redacted/i;
var PLACEHOLDER = /^\s*(\(hidden\)|unknown|n\/?a)\s*$/i;
function isHiddenName(value) {
  if (value === void 0 || value === null) return true;
  const text = value.trim();
  if (!text) return true;
  return REDACTED.test(text) || PLACEHOLDER.test(text);
}
function suffixFor(index) {
  return index < 26 ? String.fromCharCode(97 + index) : String(index + 1);
}
function profileKey(ap) {
  return [ap.band, ap.channel, ap.widthMHz ?? "?", ap.security ?? "?"].join("|");
}
function labelForHidden(ap, indexOnChannel) {
  if (ap.bssid) return `AP ${ap.bssid.slice(-5)}`;
  const channel = ap.channel || 0;
  return `AP-${channel}${suffixFor(indexOnChannel)}`;
}
function decorateScan(raw) {
  const currentHidden = raw.current ? isHiddenName(raw.current.ssid) : false;
  const current2 = raw.current ? {
    ...raw.current,
    redacted: currentHidden,
    label: currentHidden ? "This Mac's network" : raw.current.ssid
  } : null;
  const currentProfile = current2 ? profileKey(current2) : null;
  const seenPerChannel = /* @__PURE__ */ new Map();
  const networks = [...raw.networks].sort((a, b) => (b.rssi ?? -120) - (a.rssi ?? -120)).map((ap) => {
    const hidden = isHiddenName(ap.ssid);
    let label = ap.ssid;
    if (hidden) {
      if (ap.isCurrent && current2) {
        label = current2.label ?? "This Mac's network";
      } else {
        const key = `${ap.band}-${ap.channel}`;
        const index = seenPerChannel.get(key) ?? 0;
        seenPerChannel.set(key, index + 1);
        label = labelForHidden(ap, index);
      }
    }
    return {
      ...ap,
      redacted: hidden,
      label,
      matchesCurrentProfile: !ap.isCurrent && currentProfile !== null && profileKey(ap) === currentProfile
    };
  });
  const redactedNetworks = networks.filter((n) => n.redacted).length;
  return {
    current: current2,
    networks,
    privacy: {
      ssidsRedacted: redactedNetworks > 0 || currentHidden,
      redactedNetworks,
      totalNetworks: networks.length,
      currentSsidHidden: currentHidden,
      resolvedVia: raw.resolvedVia
    }
  };
}
function sameNetworkName(a, b) {
  if (isHiddenName(a) || isHiddenName(b)) return false;
  return a === b;
}

// src/lib/wifi/analyze.ts
function clamp(n, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Math.round(n)));
}
function signalScore(rssi, snr) {
  let score = 40;
  if (rssi !== void 0) {
    if (rssi >= -50) score = 100;
    else if (rssi >= -60) score = 82;
    else if (rssi >= -67) score = 64;
    else if (rssi >= -75) score = 42;
    else score = 22;
  }
  if (snr !== void 0) {
    const snrScore = snr >= 35 ? 100 : snr >= 25 ? 80 : snr >= 15 ? 55 : 30;
    score = (score * 2 + snrScore) / 3;
  }
  return clamp(score);
}
function congestionScore(coChannel, adjacent, band) {
  const penalty = coChannel * (band === "2.4" ? 14 : 10) + adjacent * 4;
  return clamp(100 - penalty);
}
function rateCeilingMbps(widthMHz, phy) {
  const vht = { 20: 173, 40: 400, 80: 866, 160: 1733 };
  const he = { 20: 287, 40: 574, 80: 1201, 160: 2402 };
  const table = phy >= 6 ? he : vht;
  const widths = [160, 80, 40, 20];
  const key = widths.find((w) => widthMHz >= w) ?? 20;
  return table[key];
}
var MCS_SNR_FLOOR = [5, 8, 11, 14, 18, 21, 23, 25, 29, 31, 34, 37];
function mcsFromSnr(snr) {
  let best = 0;
  MCS_SNR_FLOOR.forEach((floor, idx) => {
    if (snr >= floor) best = idx;
  });
  return best;
}
function snrLimitedRate(snr, ceiling, phy) {
  const topMcs = phy >= 6 ? 11 : 9;
  const usable = Math.min(mcsFromSnr(snr), topMcs);
  return Math.round(ceiling * (usable + 1) / (topMcs + 1));
}
function efficiencyScore(cur) {
  if (!cur) return 35;
  const phy = phyRank(cur.phyMode);
  const phyScore = phy >= 7 ? 100 : phy === 6 ? 90 : phy === 5 ? 72 : phy === 4 ? 48 : 28;
  const bandScore = cur.band === "6" ? 100 : cur.band === "5" ? 86 : cur.band === "2.4" ? 40 : 50;
  const width = cur.widthMHz ?? (cur.band === "2.4" ? 20 : 40);
  const widthScore = cur.band === "2.4" ? width <= 20 ? 80 : 45 : width >= 160 ? 100 : width >= 80 ? 88 : width >= 40 ? 70 : 55;
  const rateScore = cur.txRateMbps ? clamp(Math.min(100, cur.txRateMbps / (cur.band === "2.4" ? 150 : 600) * 100)) : 60;
  return clamp(phyScore * 0.35 + bandScore * 0.3 + widthScore * 0.2 + rateScore * 0.15);
}
function analyzeScan(raw) {
  const { current: cur, networks, privacy } = decorateScan(raw);
  const channels24 = buildOccupancy(networks, "2.4");
  const channels5 = buildOccupancy(networks, "5");
  const recommendedChannel24 = quietestChannel(channels24, [1, 6, 11]);
  const recommendedChannel5 = quietestChannel(channels5, []);
  const currentLabel = cur?.label ?? cur?.ssid ?? "this network";
  const sameChannel = networks.filter(
    (n) => cur && n.channel === cur.channel && n.band === cur.band && !n.isCurrent
  );
  const adjacent24 = cur?.band === "2.4" ? networks.filter(
    (n) => n.band === "2.4" && n.channel !== cur.channel && Math.abs(n.channel - cur.channel) <= 4
  ).length : 0;
  const findings = [];
  const plan = [];
  if (privacy.ssidsRedacted) {
    findings.push({
      id: "ssid-redacted",
      title: privacy.redactedNetworks > 0 ? `macOS hid ${privacy.redactedNetworks} network name${privacy.redactedNetworks > 1 ? "s" : ""}` : "macOS hid the network name",
      detail: 'Since macOS 15, SSIDs are location data: command-line tools get "<redacted>" unless the caller has a Location Services grant. Every radio measurement here (channel, width, RSSI, noise, PHY, security) is still exact, so the plan is unaffected. Names are shown as AP-<channel><letter>.',
      severity: "ok"
    });
  }
  if (!cur) {
    findings.push({
      id: "disconnected",
      title: "No active Wi-Fi link",
      detail: "The scanner did not see an associated network. Join a network and scan again.",
      severity: "critical"
    });
    plan.push({
      id: "join",
      priority: "now",
      title: "Connect the Mac to Wi-Fi, then rescan",
      why: "A plan needs the associated BSSID, RSSI, channel, and PHY mode.",
      how: "Join your usual SSID, keep this app running on the Mac, and click Scan.",
      expectedGain: "Unlocks a real improvement plan instead of a generic checklist."
    });
  } else {
    if ((cur.rssi ?? -100) < -70) {
      findings.push({
        id: "weak-rssi",
        title: "Weak received signal",
        detail: `RSSI is ${cur.rssi} dBm. Below about -67 dBm, Macs drop MCS rates and latency spikes.`,
        severity: "critical"
      });
      plan.push({
        id: "move-ap",
        priority: "now",
        title: "Shorten the path between the Mac and the access point",
        why: "Airtime efficiency collapses when the radio retries at low MCS.",
        how: "Move the AP off the floor and away from metal, or sit the Mac in the same room. Avoid microwave ovens, baby monitors, and USB 3 hubs near the lid antennas.",
        expectedGain: "Often +1 to +2 MCS steps, which can double throughput on 2.4 GHz."
      });
    } else if ((cur.rssi ?? -100) < -60) {
      findings.push({
        id: "fair-rssi",
        title: "Signal is only fair",
        detail: `RSSI ${cur.rssi} dBm is usable but leaves little fade margin.`,
        severity: "warn"
      });
      const phy2 = phyRank(cur.phyMode);
      const width = cur.widthMHz ?? 80;
      const ceiling = rateCeilingMbps(width, phy2);
      const snr = cur.snr;
      const gainDb = Math.max(4, Math.round(32 - (snr ?? 32)));
      plan.push({
        id: "signal-headroom",
        priority: "now",
        title: `Raise signal by ~${gainDb} dB to unlock the rest of your ${width} MHz channel`,
        why: snr !== void 0 ? `SNR ${snr} dB caps you near MCS ${mcsFromSnr(snr)}. A ${width} MHz ${cur.phyMode ?? "link"} can reach about ${ceiling} Mbps, but this SNR supports roughly ${snrLimitedRate(snr, ceiling, phy2)} Mbps${cur.txRateMbps ? ` and you are negotiating ${cur.txRateMbps} Mbps` : ""}. Signal, not congestion, is the limit.` : `RSSI ${cur.rssi} dBm leaves the link well below the ~${ceiling} Mbps this channel width allows.`,
        how: "Reduce the number of walls between the Mac and the AP: raise the router to desk height or above, keep it out of cabinets and away from metal, mirrors, and TVs, and orient antennas vertically. If the AP cannot move, add a mesh node or wired access point in the room where you work.",
        expectedGain: `Each ~6 dB roughly doubles usable MCS headroom. Reaching -55 dBm typically lands ${Math.round(ceiling * 0.7)}\u2013${ceiling} Mbps instead of ${cur.txRateMbps ?? "current"} Mbps.`
      });
    } else {
      findings.push({
        id: "rssi-ok",
        title: "Signal strength is healthy",
        detail: `RSSI ${cur.rssi ?? "n/a"} dBm is strong enough for high MCS.`,
        severity: "ok"
      });
    }
    if (cur.snr !== void 0 && cur.snr < 25) {
      findings.push({
        id: "low-snr",
        title: "Low signal-to-noise ratio",
        detail: `SNR is ${cur.snr} dB (noise ${cur.noise ?? "n/a"} dBm). Noise this high usually means co-channel contention, not distance.`,
        severity: cur.snr < 15 ? "critical" : "warn"
      });
    }
    if (cur.band === "2.4") {
      findings.push({
        id: "on-24",
        title: "Mac is on the 2.4 GHz band",
        detail: "2.4 GHz is slow, overlapping, and shared with Bluetooth. It is the usual reason a Mac feels \u201Cstuck\u201D at tens of Mbps.",
        severity: "critical"
      });
      const fiveGhzHome = privacy.ssidsRedacted ? networks.filter((n) => n.band === "5" && (n.rssi ?? -100) > -75) : networks.filter(
        (n) => n.band === "5" && (sameNetworkName(n.ssid, cur.ssid) || n.ssid.replace(/[-_ ]?(5g|5ghz|5|fast)$/i, "") === cur.ssid.replace(/[-_ ]?(2g|2ghz|2\.4|24g)?$/i, ""))
      );
      if (fiveGhzHome.length) {
        const twin = fiveGhzHome[0];
        plan.push({
          id: "prefer-5",
          priority: "now",
          title: privacy.ssidsRedacted ? `Move this Mac to the 5 GHz radio (${twin.label ?? "5 GHz AP"} on ch ${twin.channel})` : `Join ${twin.ssid} (5 GHz) instead of ${currentLabel}`,
          why: `A 5 GHz BSS is visible at ${twin.rssi ?? "unknown"} dBm with ${twin.phyMode ?? "modern"} PHY. Your Mac is still on 802.11n 2.4 GHz.`,
          how: "On the Mac: Wi-Fi menu \u2192 the 5 GHz SSID. On the router: enable band steering or give 2.4 and 5 GHz distinct names so you can pick. Disable \u201CAuto\u201D join on the 2.4 GHz name.",
          expectedGain: "Typical jump from ~70 Mbps PHY to several hundred Mbps, with lower latency."
        });
      } else {
        plan.push({
          id: "enable-5",
          priority: "now",
          title: "Turn on a 5 GHz (or 6 GHz) SSID on the router",
          why: "No 5 GHz network with a related name was seen. The Mac cannot go faster than 2.4 GHz physics allow.",
          how: "In the router admin page, enable 5 GHz / Wi-Fi 6, set a clear SSID, WPA3 or WPA2, and 80 MHz width if neighbors are quiet.",
          expectedGain: "Largest single upgrade available on most home networks."
        });
      }
    } else {
      findings.push({
        id: "band-ok",
        title: `Operating on ${cur.band} GHz`,
        detail: "This band has non-overlapping channels and much more airtime than 2.4 GHz.",
        severity: "ok"
      });
    }
    if (cur.band === "5" && cur.channel >= 149 && (cur.rssi ?? -100) < -60) {
      const lowerQuiet = quietestChannel(
        channels5.filter((b) => b.channel >= 36 && b.channel <= 48),
        []
      );
      findings.push({
        id: "upper-unii",
        title: `Channel ${cur.channel} sits in the weakest-propagating part of 5 GHz`,
        detail: `At ~5.765 GHz, wall and floor loss is a few dB worse than the 5.18 GHz channels. With RSSI already at ${cur.rssi} dBm, that penalty is costing you MCS steps.`,
        severity: "warn"
      });
      if (lowerQuiet) {
        plan.push({
          id: "lower-unii",
          priority: "now",
          title: `Move the 5 GHz radio to channel ${lowerQuiet}`,
          why: `Lower 5 GHz channels punch through walls better than channel ${cur.channel}, and channel ${lowerQuiet} is the quietest slot in this scan. It is also non-DFS, so you avoid radar-triggered channel changes that drop the link.`,
          how: `Router admin \u2192 5 GHz \u2192 Channel: ${lowerQuiet} (static, not Auto). Keep width at ${cur.widthMHz ?? 80} MHz. Rejoin from the Mac and rescan to compare RSSI.`,
          expectedGain: "Typically 2\u20134 dB more signal for free, which is often one full MCS step."
        });
      }
    }
    if (cur.band !== "2.4" && (cur.snr ?? 40) < 25 && (cur.widthMHz ?? 20) >= 80) {
      plan.push({
        id: "hold-width",
        priority: "soon",
        title: `Do not widen past ${cur.widthMHz} MHz until signal improves`,
        why: `Doubling channel width adds about 3 dB of noise, and your SNR is only ${cur.snr} dB. Switching to 160 MHz now would very likely lower throughput, not raise it.`,
        how: "Leave width where it is. Fix signal first, rescan, and only then test a wider channel and compare actual transfer speed.",
        expectedGain: "Avoids a common change that quietly makes a weak link slower."
      });
    }
    if (sameChannel.length >= 3) {
      findings.push({
        id: "cochannel",
        title: `Channel ${cur.channel} is crowded`,
        detail: `${sameChannel.length} other BSS share this channel: ${sameChannel.slice(0, 4).map((n) => n.label ?? n.ssid).join(", ")}${sameChannel.length > 4 ? "\u2026" : ""}.`,
        severity: "warn"
      });
      const rec = cur.band === "2.4" ? recommendedChannel24 : recommendedChannel5;
      if (rec && rec !== cur.channel) {
        plan.push({
          id: "retune-channel",
          priority: "now",
          title: `Move the access point to channel ${rec}`,
          why: `Channel ${cur.channel} has the most overlapping networks. Channel ${rec} is the quietest option in this scan.`,
          how: cur.band === "2.4" ? "Set 2.4 GHz to 20 MHz width and a static channel (1, 6, or 11 only). Avoid \u201CAuto\u201D if it keeps landing on a busy channel." : "Set 5 GHz to a static channel. Prefer a UNI-II / DFS channel if your router supports it and occupancy is lower there.",
          expectedGain: "Fewer retries and more consistent latency; speed can rise 20\u201350% in apartments."
        });
      }
    }
    if (cur.band === "2.4" && (cur.widthMHz ?? 20) > 20) {
      findings.push({
        id: "wide-24",
        title: "40 MHz on 2.4 GHz wastes airtime",
        detail: "A 40 MHz 2.4 GHz BSS overlaps almost the entire band and fights every neighbor.",
        severity: "warn"
      });
      plan.push({
        id: "narrow-24",
        priority: "soon",
        title: "Force 2.4 GHz channel width to 20 MHz",
        why: "Wider 2.4 GHz channels reduce everyone\u2019s efficiency, including yours.",
        how: "Router wireless settings \u2192 2.4 GHz \u2192 Channel width: 20 MHz. Keep IoT devices on this radio.",
        expectedGain: "More stable links for printers and sensors; less self-interference with 5 GHz clients."
      });
    }
    const phy = phyRank(cur.phyMode);
    if (phy > 0 && phy < 6) {
      findings.push({
        id: "legacy-phy",
        title: `Link is ${cur.phyMode || "legacy"}`,
        detail: "Wi-Fi 6/6E (802.11ax) uses OFDMA and better scheduling. Older PHYs spend more airtime per byte.",
        severity: phy < 5 ? "critical" : "warn"
      });
      plan.push({
        id: "wifi6",
        priority: phy < 5 ? "now" : "soon",
        title: "Enable Wi-Fi 6 on the AP and let the Mac negotiate 802.11ax",
        why: "This Mac supports modern PHYs; the current association is down-negotiated.",
        how: "Update router firmware, enable 802.11ax, and disable 802.11b. Forget the network on the Mac (System Settings \u2192 Wi-Fi \u2192 Details \u2192 Forget) and rejoin.",
        expectedGain: "Higher MCS, lower latency under load, better multi-device efficiency."
      });
    }
    const sec = (cur.security || "").toLowerCase();
    if (sec.includes("mixed") || sec.includes("wpa") && sec.includes("wpa2") && !sec.includes("wpa3")) {
      findings.push({
        id: "mixed-security",
        title: `Security is ${cur.security}`,
        detail: "Mixed WPA/WPA2 mode usually leaves TKIP enabled. The 802.11n and 802.11ac specs forbid high-throughput rates on a TKIP-capable BSS, so some APs silently cap the whole network to legacy speeds.",
        severity: "warn"
      });
      plan.push({
        id: "aes-only",
        priority: "now",
        title: "Switch the SSID to WPA2 AES-only (or WPA2/WPA3)",
        why: "Mixed mode is the single most common hidden throughput cap on otherwise healthy 802.11ac links. If TKIP is advertised, your Mac may be barred from VHT rates entirely.",
        how: "Router admin \u2192 Wireless Security \u2192 set WPA2-PSK with AES/CCMP only, or WPA2/WPA3 transition. Remove any \u201CWPA/WPA2 mixed\u201D, \u201CTKIP\u201D, or \u201CTKIP+AES\u201D option. Then forget and rejoin on the Mac.",
        expectedGain: "If TKIP was the cap, throughput can jump several times over with no hardware change."
      });
    }
    if (sec.includes("open") || sec.includes("none") || sec.includes("wep")) {
      findings.push({
        id: "insecure",
        title: "Network security is too weak",
        detail: `${cur.security} also forces older rates on many APs.`,
        severity: "critical"
      });
      plan.push({
        id: "wpa3",
        priority: "now",
        title: "Switch the SSID to WPA3 Personal (or WPA2/WPA3 transition)",
        why: "Open/WEP networks are slow and unsafe. WPA3 PMF also cuts some spoofing that disrupts roaming.",
        how: "Router security mode \u2192 WPA3 or WPA2/WPA3. Rejoin from the Mac; do not use a separate open \u201Cguest\u201D for your workstation.",
        expectedGain: "Removes a class of stalls and protects traffic on shared spectrum."
      });
    }
    const openNeighbors = networks.filter(
      (n) => (n.security || "").toLowerCase().match(/open|none/)
    );
    if (openNeighbors.length) {
      findings.push({
        id: "open-neighbors",
        title: `${openNeighbors.length} open nearby network${openNeighbors.length > 1 ? "s" : ""}`,
        detail: openNeighbors.map((n) => n.label ?? n.ssid).join(", "),
        severity: "ok"
      });
    }
  }
  plan.push({
    id: "mac-stack",
    priority: "soon",
    title: "Clean the Mac Wi-Fi stack after a noisy scan",
    why: "Stale preferred-network order, private Wi-Fi address, and cached 2.4 GHz BSSIDs keep a Mac on a bad radio.",
    how: "System Settings \u2192 Wi-Fi \u2192 Details: turn off Auto-Join for the slow SSID, keep Private Wi-Fi Address on unless a captive portal breaks, then Forget and rejoin the fast SSID. Toggle Wi-Fi off/on once.",
    expectedGain: "Stops the Mac from silently falling back to 2.4 GHz after sleep."
  });
  plan.push({
    id: "airtime",
    priority: "later",
    title: "Keep slow devices off the fast radio",
    why: "One 802.11g IoT gadget on the same BSS can cut AP efficiency in half.",
    how: "Put cameras, plugs, and printers on a 2.4 GHz IoT SSID. Leave laptops and phones on 5/6 GHz only. Disable legacy rates (1\u201311 Mbps) if the AP allows it.",
    expectedGain: "More airtime for the Mac during calls and large transfers."
  });
  plan.push({
    id: "wired",
    priority: "later",
    title: "Use Ethernet or USB-C adapter for bulk transfers",
    why: "Even a perfect 5 GHz link shares airtime with every neighbor. Wired bypasses contention.",
    how: "Thunderbolt/USB-C gigabit adapter into the router or a switch. Keep Wi-Fi for mobility only.",
    expectedGain: "Sustained gigabit with zero radio retries."
  });
  const sig = signalScore(cur?.rssi, cur?.snr);
  const cong = congestionScore(sameChannel.length, adjacent24, cur?.band ?? "2.4");
  const eff = efficiencyScore(cur);
  const overall = clamp(sig * 0.35 + cong * 0.35 + eff * 0.3);
  const order = { now: 0, soon: 1, later: 2 };
  plan.sort((a, b) => order[a.priority] - order[b.priority]);
  return {
    scannedAt: (/* @__PURE__ */ new Date()).toISOString(),
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
    privacy
  };
}

// src/lib/wifi/demo.ts
var current = {
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
  isCurrent: true
};
var neighbors = [
  {
    ssid: "HomeOffice-5G",
    rssi: -54,
    channel: 36,
    band: "5",
    widthMHz: 80,
    phyMode: "802.11ax",
    security: "WPA3 Personal"
  },
  {
    ssid: "HomeOffice",
    rssi: -67,
    channel: 6,
    band: "2.4",
    widthMHz: 20,
    phyMode: "802.11n",
    security: "WPA2 Personal",
    isCurrent: true
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
  { ssid: "Hidden", rssi: -78, channel: 44, band: "5", widthMHz: 20, phyMode: "802.11n", security: "WPA2 Personal" }
];
function demoScan() {
  return {
    platform: "other",
    source: "demo",
    sourceNote: "This environment is not a Mac with Wi-Fi radios. Showing a typical congested apartment scan so you can review the plan. Run this app on your Mac for a live capture.",
    current,
    networks: neighbors
  };
}

// src/lib/wifi/parse-linux.ts
function parseNmcliDevWifi(text) {
  const lines = text.split("\n").map((l) => l.trimEnd()).filter(Boolean);
  if (!lines.length) return null;
  const networks = [];
  let current2 = null;
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
      parts.slice(6).join(" ")
    ];
    const channel = Number(chan) || 0;
    const signalPct = Number(signal);
    const rssi = Number.isFinite(signalPct) ? Math.round(signalPct / 2 - 100) : void 0;
    const ap = {
      ssid: ssid || "(hidden)",
      bssid,
      rssi,
      channel,
      band: bandFromChannel(channel),
      phyMode: mode,
      security: security || void 0,
      txRateMbps: Number.parseInt(rate, 10) || void 0,
      isCurrent: active
    };
    networks.push(ap);
    if (active) {
      current2 = { ...ap, interfaceName: "wlan0" };
    }
  }
  if (!networks.length) return null;
  return {
    platform: "linux",
    source: "linux",
    sourceNote: "Live capture from NetworkManager (nmcli).",
    current: current2,
    networks
  };
}

// src/lib/wifi/parse-macos.ts
function humanSecurity(raw) {
  if (!raw) return void 0;
  return raw.replace(/^spairport_security_mode_/i, "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
function parseRssiNoise(n) {
  if (typeof n.spairport_network_rssi === "number") {
    return { rssi: n.spairport_network_rssi, noise: n.spairport_network_noise };
  }
  const combo = n.spairport_signal_noise;
  if (!combo) return {};
  const match = combo.match(/(-?\d+)\s*.*?(-?\d+)/);
  if (!match) return {};
  return { rssi: Number(match[1]), noise: Number(match[2]) };
}
function toAccessPoint(n, isCurrent = false) {
  const ch = parseChannelField(n.spairport_network_channel);
  const { rssi, noise } = parseRssiNoise(n);
  const name = n._name ?? "";
  const bssid = n.spairport_network_bssid;
  return {
    ssid: name,
    bssid: isHiddenName(bssid) ? void 0 : bssid,
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
    isCurrent
  };
}
function parseMacProfilerJson(jsonText) {
  let parsed;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return null;
  }
  const airport = parsed.SPAirPortDataType?.[0];
  const iface = airport?.spairport_airport_interfaces?.find(
    (i) => Boolean(i.spairport_current_network_information)
  ) ?? airport?.spairport_airport_interfaces?.[0];
  if (!iface) return null;
  const currentNet = iface.spairport_current_network_information;
  const currentAp = currentNet ? toAccessPoint(currentNet, true) : null;
  const current2 = currentAp ? {
    ...currentAp,
    interfaceName: iface._name || "en0",
    countryCode: currentNet?.spairport_network_country_code,
    snr: currentAp.rssi !== void 0 && currentAp.noise !== void 0 ? currentAp.rssi - currentAp.noise : void 0
  } : null;
  const others = [
    ...iface.spairport_airport_other_local_wireless_networks ?? [],
    ...iface.spairport_airport_local_wireless_networks ?? []
  ];
  const networks = others.map((n) => toAccessPoint(n));
  if (currentAp) {
    const duplicate = currentAp.bssid ? networks.findIndex((n) => n.bssid && n.bssid === currentAp.bssid) : networks.findIndex(
      (n) => !n.redacted && !currentAp.redacted && n.ssid === currentAp.ssid && n.channel === currentAp.channel
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
    current: current2,
    networks
  };
}

// src/lib/wifi/ssid-recovery.ts
import { execFile } from "node:child_process";
import { promisify } from "node:util";
var execFileAsync = promisify(execFile);
async function run(cmd, args) {
  try {
    const { stdout } = await execFileAsync(cmd, args, { timeout: 8e3 });
    return stdout;
  } catch {
    return null;
  }
}
async function viaNetworksetup(iface) {
  const out = await run("networksetup", ["-getairportnetwork", iface]);
  const match = out?.match(/Current Wi-Fi Network:\s*(.+)/i);
  return match ? match[1].trim() : null;
}
async function viaIpconfig(iface) {
  const out = await run("ipconfig", ["getsummary", iface]);
  const match = out?.match(/^\s*SSID\s*:\s*(.+)$/im);
  return match ? match[1].trim() : null;
}
async function recoverCurrentSsid(iface) {
  const override = process.env.WIFI_SSID?.trim();
  if (override) return { ssid: override, via: "env" };
  if (process.platform !== "darwin") return null;
  const attempts = [
    ["networksetup", viaNetworksetup(iface)],
    ["ipconfig", viaIpconfig(iface)]
  ];
  for (const [via, promise] of attempts) {
    const value = await promise;
    if (value && !isHiddenName(value)) return { ssid: value, via };
  }
  return null;
}

// src/lib/wifi/scan.ts
var execFileAsync2 = promisify2(execFile2);
async function tryMacScan() {
  try {
    const { stdout } = await execFileAsync2(
      "system_profiler",
      ["SPAirPortDataType", "-json"],
      { timeout: 45e3, maxBuffer: 20 * 1024 * 1024 }
    );
    return parseMacProfilerJson(stdout);
  } catch {
    return null;
  }
}
async function tryLinuxScan() {
  try {
    const { stdout } = await execFileAsync2(
      "nmcli",
      [
        "-t",
        "-f",
        "IN-USE,SSID,BSSID,MODE,CHAN,RATE,SIGNAL,SECURITY",
        "dev",
        "wifi",
        "list"
      ],
      { timeout: 2e4 }
    );
    return parseNmcliDevWifi(stdout);
  } catch {
    return null;
  }
}
async function trySavedDump(path) {
  try {
    const text = await readFile(path, "utf8");
    const parsed = parseMacProfilerJson(text);
    if (!parsed) return null;
    return {
      ...parsed,
      sourceNote: `Saved macOS capture from ${path}.`
    };
  } catch {
    return null;
  }
}
async function withRecoveredSsid(raw) {
  if (!raw.current || !isHiddenName(raw.current.ssid)) return raw;
  const recovered = await recoverCurrentSsid(raw.current.interfaceName);
  if (!recovered) return raw;
  return {
    ...raw,
    current: { ...raw.current, ssid: recovered.ssid, redacted: false },
    resolvedVia: recovered.via
  };
}
async function runWifiScan() {
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

// scripts/scan.ts
var bold = (s) => `\x1B[1m${s}\x1B[0m`;
var dim = (s) => `\x1B[2m${s}\x1B[0m`;
var red = (s) => `\x1B[31m${s}\x1B[0m`;
var yellow = (s) => `\x1B[33m${s}\x1B[0m`;
var green = (s) => `\x1B[32m${s}\x1B[0m`;
var cyan = (s) => `\x1B[36m${s}\x1B[0m`;
function bar(value, width = 24) {
  const filled = Math.round(value / 100 * width);
  const tone = value >= 75 ? green : value >= 50 ? yellow : red;
  return tone("\u2588".repeat(filled)) + dim("\u2591".repeat(width - filled));
}
function printReport(scan) {
  const cur = scan.current;
  console.log();
  console.log(bold("  Mac Wi-Fi scan"));
  console.log(dim(`  ${new Date(scan.scannedAt).toLocaleString()}`));
  if (scan.source === "demo") {
    console.log(yellow(`  ${scan.sourceNote}`));
  } else {
    console.log(dim(`  ${scan.sourceNote}`));
  }
  console.log();
  if (scan.privacy.ssidsRedacted) {
    console.log(
      yellow(
        `  macOS hid ${scan.privacy.redactedNetworks}/${scan.privacy.totalNetworks} network names (SSIDs need a Location Services grant).`
      )
    );
    console.log(dim('  Radio measurements are unaffected. Set WIFI_SSID="YourNetwork" to label your own link.'));
    console.log();
  } else if (scan.privacy.resolvedVia && scan.privacy.resolvedVia !== "system_profiler") {
    console.log(dim(`  SSID recovered via ${scan.privacy.resolvedVia}.`));
    console.log();
  }
  if (cur) {
    console.log(`  ${bold(cur.label ?? cur.ssid)}  ${dim(`(${cur.interfaceName})`)}`);
    console.log(
      `  ${cur.band} GHz \xB7 ch ${cur.channel}${cur.widthMHz ? ` @ ${cur.widthMHz} MHz` : ""} \xB7 ${cur.phyMode ?? "unknown PHY"} \xB7 ${cur.security ?? "security n/a"}`
    );
    console.log(
      `  RSSI ${cur.rssi ?? "\u2014"} dBm \xB7 noise ${cur.noise ?? "\u2014"} dBm \xB7 SNR ${cur.snr ?? "\u2014"} dB \xB7 TX ${cur.txRateMbps ?? "\u2014"} Mbps`
    );
  } else {
    console.log(red("  Not associated to any network."));
  }
  console.log();
  console.log(`  Overall      ${bar(scan.scores.overall)} ${scan.scores.overall}`);
  console.log(`  Signal       ${bar(scan.scores.signal)} ${scan.scores.signal}`);
  console.log(`  Congestion   ${bar(scan.scores.congestion)} ${scan.scores.congestion}`);
  console.log(`  Efficiency   ${bar(scan.scores.efficiency)} ${scan.scores.efficiency}`);
  console.log();
  console.log(bold("  Findings"));
  for (const f of scan.findings) {
    const mark = f.severity === "critical" ? red("\u2717") : f.severity === "warn" ? yellow("!") : green("\u2713");
    console.log(`  ${mark} ${f.title}`);
    console.log(`    ${dim(f.detail)}`);
  }
  console.log();
  console.log(bold("  Channel occupancy"));
  const quiet24 = scan.recommendedChannel24;
  const quiet5 = scan.recommendedChannel5;
  for (const [label, buckets, quiet] of [
    ["2.4 GHz", scan.channels24, quiet24],
    ["5 GHz", scan.channels5, quiet5]
  ]) {
    const busy = [...buckets].sort((a, b) => b.occupancy - a.occupancy).slice(0, 3).filter((b) => b.occupancy > 0).map((b) => `ch ${b.channel} (${b.networks} BSS)`);
    console.log(
      `  ${label}: busiest ${busy.length ? busy.join(", ") : "clear"} \xB7 quietest ${cyan(String(quiet ?? "\u2014"))}`
    );
  }
  console.log();
  console.log(bold("  Heard networks"));
  for (const n of scan.networks.slice(0, 10)) {
    const name = (n.label ?? n.ssid).padEnd(18);
    const marker = n.isCurrent ? cyan("\u2192") : " ";
    console.log(
      `  ${marker} ${name} ${dim(
        `${n.band} GHz ch ${String(n.channel).padEnd(3)} ${String(n.widthMHz ?? "\u2014").padStart(3)} MHz  ${String(n.rssi ?? "\u2014").padStart(4)} dBm  ${n.phyMode ?? "\u2014"}`
      )}`
    );
  }
  if (scan.networks.length > 10) {
    console.log(dim(`  \u2026 ${scan.networks.length - 10} more`));
  }
  console.log();
  console.log(bold("  Plan"));
  scan.plan.forEach((step, i) => {
    const tag = step.priority === "now" ? red("[now]") : step.priority === "soon" ? yellow("[soon]") : dim("[later]");
    console.log(`  ${i + 1}. ${tag} ${bold(step.title)}`);
    console.log(`     why:  ${step.why}`);
    console.log(`     how:  ${step.how}`);
    console.log(`     gain: ${dim(step.expectedGain)}`);
  });
  console.log();
}
async function main() {
  const scan = await runWifiScan();
  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(scan, null, 2));
  } else {
    printReport(scan);
  }
}
main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
