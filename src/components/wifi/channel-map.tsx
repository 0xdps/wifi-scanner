"use client";

import { cn } from "@/lib/utils";
import type { ChannelBucket } from "@/lib/wifi/types";

export function ChannelMap({
  title,
  buckets,
  currentChannel,
  recommended,
}: {
  title: string;
  buckets: ChannelBucket[];
  currentChannel?: number;
  recommended?: number;
}) {
  const max = Math.max(1, ...buckets.map((b) => b.occupancy));
  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-medium tracking-wide text-cyan-100/90">{title}</h3>
        <p className="text-xs text-muted-foreground">
          Current {currentChannel ?? "—"} · Quietest {recommended ?? "—"}
        </p>
      </div>
      <div className="flex items-end gap-[3px] overflow-x-auto pb-1">
        {buckets.map((b) => {
          const h = Math.max(8, (b.occupancy / max) * 88);
          const isCurrent = b.channel === currentChannel;
          const isRec = b.channel === recommended && recommended !== currentChannel;
          return (
            <div key={`${b.band}-${b.channel}`} className="flex min-w-[18px] flex-col items-center gap-1">
              <div
                className={cn(
                  "w-full rounded-sm transition-colors",
                  isCurrent && "bg-amber-400",
                  isRec && "bg-cyan-400",
                  !isCurrent && !isRec && "bg-cyan-700/70",
                )}
                style={{ height: h }}
                title={`Ch ${b.channel}: ${b.networks} BSS, occupancy ${b.occupancy}`}
              />
              <span
                className={cn(
                  "text-[10px] tabular-nums",
                  isCurrent ? "text-amber-300" : isRec ? "text-cyan-300" : "text-muted-foreground",
                )}
              >
                {b.channel}
              </span>
            </div>
          );
        })}
      </div>
      <p className="text-[11px] text-muted-foreground">
        Amber is the associated channel. Cyan is the quietest alternative in this scan.
      </p>
    </div>
  );
}
