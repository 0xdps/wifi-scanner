export type Band = "2.4" | "5" | "6" | "unknown";

export type PlanPriority = "now" | "soon" | "later";

export interface AccessPoint {
  ssid: string;
  bssid?: string;
  rssi?: number;
  noise?: number;
  channel: number;
  band: Band;
  widthMHz?: number;
  phyMode?: string;
  security?: string;
  txRateMbps?: number;
  mcs?: number;
  isCurrent?: boolean;
  /** Always safe to render. Falls back to a synthesized name when macOS hides the SSID. */
  label?: string;
  /** macOS withheld the SSID, or the BSS does not broadcast one. */
  redacted?: boolean;
  /** Same channel, width, PHY, and security as the associated link. */
  matchesCurrentProfile?: boolean;
}

export interface CurrentLink extends AccessPoint {
  interfaceName: string;
  countryCode?: string;
  snr?: number;
}

/** How much of this scan macOS allowed us to see. */
export interface PrivacyState {
  ssidsRedacted: boolean;
  redactedNetworks: number;
  totalNetworks: number;
  currentSsidHidden: boolean;
  /** Which fallback recovered the associated SSID, when one did. */
  resolvedVia?: "env" | "networksetup" | "ipconfig" | "system_profiler";
}

export interface ChannelBucket {
  channel: number;
  band: Band;
  occupancy: number;
  networks: number;
  strongestRssi?: number;
}

export interface Finding {
  id: string;
  title: string;
  detail: string;
  severity: "critical" | "warn" | "ok";
}

export interface PlanStep {
  id: string;
  priority: PlanPriority;
  title: string;
  why: string;
  how: string;
  expectedGain: string;
}

export interface ScanResult {
  scannedAt: string;
  platform: "darwin" | "linux" | "other";
  source: "macos" | "linux" | "demo";
  sourceNote: string;
  current: CurrentLink | null;
  networks: AccessPoint[];
  scores: {
    overall: number;
    signal: number;
    congestion: number;
    efficiency: number;
  };
  findings: Finding[];
  plan: PlanStep[];
  channels24: ChannelBucket[];
  channels5: ChannelBucket[];
  recommendedChannel24?: number;
  recommendedChannel5?: number;
  privacy: PrivacyState;
}

export interface RawScan {
  platform: ScanResult["platform"];
  source: ScanResult["source"];
  sourceNote: string;
  current: CurrentLink | null;
  networks: AccessPoint[];
  resolvedVia?: PrivacyState["resolvedVia"];
}
