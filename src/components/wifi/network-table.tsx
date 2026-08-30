"use client";

import { useMemo, useState } from "react";
import { EyeOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { AccessPoint } from "@/lib/wifi/types";

type BandFilter = "all" | "2.4" | "5";
type SortKey = "signal" | "channel";

/** -30 dBm is effectively touching the AP, -90 is unusable. */
function signalPercent(rssi?: number): number {
  if (rssi === undefined) return 0;
  return Math.max(0, Math.min(100, Math.round(((rssi + 90) / 60) * 100)));
}

function signalTone(rssi?: number): string {
  if (rssi === undefined) return "bg-white/20";
  if (rssi >= -60) return "bg-emerald-400";
  if (rssi >= -70) return "bg-amber-400";
  return "bg-rose-400";
}

function SignalCell({ rssi }: { rssi?: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-white/10">
        <div className={cn("h-full rounded-full", signalTone(rssi))} style={{ width: `${signalPercent(rssi)}%` }} />
      </div>
      <span className="tabular-nums text-muted-foreground">{rssi ?? "—"}</span>
    </div>
  );
}

export function NetworkTable({ networks }: { networks: AccessPoint[] }) {
  const [band, setBand] = useState<BandFilter>("all");
  const [sort, setSort] = useState<SortKey>("signal");

  const counts = useMemo(
    () => ({
      all: networks.length,
      "2.4": networks.filter((n) => n.band === "2.4").length,
      "5": networks.filter((n) => n.band === "5").length,
    }),
    [networks],
  );

  const rows = useMemo(() => {
    const filtered = band === "all" ? networks : networks.filter((n) => n.band === band);
    return [...filtered].sort((a, b) =>
      sort === "signal"
        ? (b.rssi ?? -120) - (a.rssi ?? -120)
        : a.band.localeCompare(b.band) || a.channel - b.channel,
    );
  }, [networks, band, sort]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border border-white/10 bg-white/3 p-0.5">
          {(["all", "2.4", "5"] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setBand(option)}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                band === option
                  ? "bg-cyan-400/20 text-cyan-100"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {option === "all" ? "All" : `${option} GHz`}
              <span className="ml-1.5 tabular-nums opacity-60">{counts[option]}</span>
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
          <label htmlFor="sort-networks">Sort</label>
          <select
            id="sort-networks"
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs text-foreground outline-none focus:border-cyan-400/50"
          >
            <option value="signal">Strongest signal</option>
            <option value="channel">Band and channel</option>
          </select>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="pb-2 pr-3 font-medium">Network</th>
              <th className="pb-2 pr-3 font-medium">Band</th>
              <th className="pb-2 pr-3 font-medium">Ch</th>
              <th className="pb-2 pr-3 font-medium">Width</th>
              <th className="pb-2 pr-3 font-medium">Signal (dBm)</th>
              <th className="pb-2 pr-3 font-medium">PHY</th>
              <th className="pb-2 font-medium">Security</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((n, i) => (
              <tr
                key={`${n.label ?? n.ssid}-${n.band}-${n.channel}-${i}`}
                className={cn(
                  "border-t border-white/8",
                  n.isCurrent && "bg-cyan-400/8",
                )}
              >
                <td className="py-2 pr-3">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className={cn("font-medium", n.redacted && "font-mono text-cyan-100/80")}>
                      {n.label ?? n.ssid}
                    </span>
                    {n.redacted ? (
                      <span title="Name hidden by macOS" className="inline-flex">
                        <EyeOff className="size-3 text-muted-foreground" aria-label="Name hidden by macOS" />
                      </span>
                    ) : null}
                    {n.isCurrent ? (
                      <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                        associated
                      </Badge>
                    ) : null}
                    {n.matchesCurrentProfile ? (
                      <Badge
                        variant="secondary"
                        className="h-5 px-1.5 text-[10px] text-amber-100"
                        title="Same channel, width, and security as your link — possibly your own router's other BSS"
                      >
                        same profile
                      </Badge>
                    ) : null}
                  </div>
                  {n.bssid ? (
                    <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">{n.bssid}</p>
                  ) : null}
                </td>
                <td className="py-2 pr-3 tabular-nums">{n.band} GHz</td>
                <td className="py-2 pr-3 tabular-nums">{n.channel || "—"}</td>
                <td className="py-2 pr-3 tabular-nums">{n.widthMHz ? `${n.widthMHz} MHz` : "—"}</td>
                <td className="py-2 pr-3">
                  <SignalCell rssi={n.rssi} />
                </td>
                <td className="py-2 pr-3">{n.phyMode ?? "—"}</td>
                <td className="py-2">{n.security ?? "—"}</td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr className="border-t border-white/8">
                <td colSpan={7} className="py-6 text-center text-sm text-muted-foreground">
                  No networks heard on this band.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
