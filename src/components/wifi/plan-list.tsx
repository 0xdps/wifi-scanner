"use client";

import { Badge } from "@/components/ui/badge";
import type { PlanStep } from "@/lib/wifi/types";

const labels: Record<PlanStep["priority"], string> = {
  now: "Do now",
  soon: "This week",
  later: "If you still need more",
};

export function PlanList({ plan }: { plan: PlanStep[] }) {
  return (
    <ol className="space-y-4">
      {plan.map((step, i) => (
        <li
          key={step.id}
          className="rounded-xl border border-white/8 bg-white/3 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-cyan-400/15 text-xs font-semibold text-cyan-200">
              {i + 1}
            </span>
            <h3 className="text-sm font-semibold text-foreground">{step.title}</h3>
            <Badge variant={step.priority === "now" ? "default" : "secondary"} className="ml-auto">
              {labels[step.priority]}
            </Badge>
          </div>
          <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-[11px] uppercase tracking-wider text-muted-foreground">Why</dt>
              <dd className="mt-1 text-pretty text-cyan-50/85">{step.why}</dd>
            </div>
            <div>
              <dt className="text-[11px] uppercase tracking-wider text-muted-foreground">How</dt>
              <dd className="mt-1 text-pretty text-cyan-50/85">{step.how}</dd>
            </div>
            <div>
              <dt className="text-[11px] uppercase tracking-wider text-muted-foreground">Expected gain</dt>
              <dd className="mt-1 text-pretty text-cyan-50/85">{step.expectedGain}</dd>
            </div>
          </dl>
        </li>
      ))}
    </ol>
  );
}
