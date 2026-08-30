"use client";

import { cn } from "@/lib/utils";

export function ScoreRing({
  label,
  value,
  hint,
}: {
  label: string;
  value: number;
  hint?: string;
}) {
  const r = 34;
  const c = 2 * Math.PI * r;
  const dash = (value / 100) * c;
  const tone =
    value >= 75 ? "text-emerald-300" : value >= 50 ? "text-amber-300" : "text-rose-300";
  return (
    <div className="flex items-center gap-3">
      <svg width="84" height="84" viewBox="0 0 84 84" className="-rotate-90">
        <circle cx="42" cy="42" r={r} fill="none" stroke="currentColor" className="text-white/10" strokeWidth="7" />
        <circle
          cx="42"
          cy="42"
          r={r}
          fill="none"
          stroke="currentColor"
          className={tone}
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c}`}
        />
      </svg>
      <div>
        <p className={cn("text-2xl font-semibold tabular-nums", tone)}>{value}</p>
        <p className="text-sm text-foreground">{label}</p>
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      </div>
    </div>
  );
}
