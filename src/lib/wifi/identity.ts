import type { AccessPoint, CurrentLink, PrivacyState, RawScan } from "./types";

/**
 * macOS 15+ returns this literal string instead of an SSID unless the calling
 * binary holds a Location Services grant, so it must never be treated as a name.
 */
const REDACTED = /redacted/i;
const PLACEHOLDER = /^\s*(\(hidden\)|unknown|n\/?a)\s*$/i;

export function isHiddenName(value?: string | null): boolean {
  if (value === undefined || value === null) return true;
  const text = value.trim();
  if (!text) return true;
  return REDACTED.test(text) || PLACEHOLDER.test(text);
}

/** Letters first so a handful of APs read as AP-153a / AP-153b, then fall back to numbers. */
function suffixFor(index: number): string {
  return index < 26 ? String.fromCharCode(97 + index) : String(index + 1);
}

/**
 * PHY is deliberately excluded: a beacon advertises a list ("802.11a/n/ac")
 * while the associated link reports the negotiated mode ("802.11ac"), so
 * comparing them would never match the user's own second radio.
 */
function profileKey(ap: AccessPoint): string {
  return [ap.band, ap.channel, ap.widthMHz ?? "?", ap.security ?? "?"].join("|");
}

/**
 * Builds a per-channel label so hidden networks stay tellable apart across a
 * rescan: strongest BSS on a channel keeps the same letter as long as the
 * ordering holds, and the BSSID is used verbatim when macOS exposes it.
 */
function labelForHidden(ap: AccessPoint, indexOnChannel: number): string {
  if (ap.bssid) return `AP ${ap.bssid.slice(-5)}`;
  const channel = ap.channel || 0;
  return `AP-${channel}${suffixFor(indexOnChannel)}`;
}

export interface DecoratedScan {
  current: CurrentLink | null;
  networks: AccessPoint[];
  privacy: PrivacyState;
}

/**
 * Normalizes every access point into something renderable: a `label` that is
 * never "<redacted>", plus flags the UI uses to explain what macOS withheld.
 */
export function decorateScan(raw: RawScan): DecoratedScan {
  const currentHidden = raw.current ? isHiddenName(raw.current.ssid) : false;

  const current: CurrentLink | null = raw.current
    ? {
        ...raw.current,
        redacted: currentHidden,
        label: currentHidden ? "This Mac's network" : raw.current.ssid,
      }
    : null;

  const currentProfile = current ? profileKey(current) : null;

  // Rank hidden APs within their own channel so labels are stable and meaningful.
  const seenPerChannel = new Map<string, number>();
  const networks = [...raw.networks]
    .sort((a, b) => (b.rssi ?? -120) - (a.rssi ?? -120))
    .map((ap) => {
      const hidden = isHiddenName(ap.ssid);
      let label = ap.ssid;
      if (hidden) {
        if (ap.isCurrent && current) {
          label = current.label ?? "This Mac's network";
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
        matchesCurrentProfile:
          !ap.isCurrent && currentProfile !== null && profileKey(ap) === currentProfile,
      };
    });

  const redactedNetworks = networks.filter((n) => n.redacted).length;

  return {
    current,
    networks,
    privacy: {
      ssidsRedacted: redactedNetworks > 0 || currentHidden,
      redactedNetworks,
      totalNetworks: networks.length,
      currentSsidHidden: currentHidden,
      resolvedVia: raw.resolvedVia,
    },
  };
}

/** Display helper for callers that only hold an AccessPoint. */
export function displayName(ap: AccessPoint): string {
  return ap.label ?? (isHiddenName(ap.ssid) ? "Unnamed network" : ap.ssid);
}

/**
 * True when two BSS plausibly belong to the same SSID. Redacted names must not
 * compare equal, otherwise every hidden AP looks like the user's own network.
 */
export function sameNetworkName(a?: string, b?: string): boolean {
  if (isHiddenName(a) || isHiddenName(b)) return false;
  return a === b;
}
