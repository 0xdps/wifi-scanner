"use client";

import { EyeOff, ShieldCheck } from "lucide-react";
import type { PrivacyState } from "@/lib/wifi/types";

export function PrivacyNotice({ privacy }: { privacy: PrivacyState }) {
  if (!privacy.ssidsRedacted) {
    if (!privacy.resolvedVia || privacy.resolvedVia === "system_profiler") return null;
    return (
      <div className="flex items-start gap-3 rounded-xl border border-emerald-400/25 bg-emerald-400/8 px-4 py-3 text-sm text-emerald-100">
        <ShieldCheck className="mt-0.5 size-4 shrink-0" />
        <p>
          Network name recovered via <code className="font-mono text-emerald-200">{privacy.resolvedVia}</code>.
          System Profiler had it redacted.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-sky-400/25 bg-sky-400/8 px-4 py-3.5 text-sm text-sky-50">
      <div className="flex items-start gap-3">
        <EyeOff className="mt-0.5 size-4 shrink-0 text-sky-300" />
        <div className="space-y-2">
          <p className="font-medium">
            macOS is hiding Wi-Fi names
            {privacy.redactedNetworks > 0 ? ` (${privacy.redactedNetworks} of ${privacy.totalNetworks})` : ""}
          </p>
          <p className="text-sky-100/85">
            Since macOS 15, an SSID counts as location data. Command-line tools receive the literal
            string <code className="font-mono text-sky-200">&lt;redacted&gt;</code> unless the calling
            program holds a Location Services grant. Nothing is wrong with the scan: channel, width,
            RSSI, noise, PHY mode, and security are all measured exactly, so the plan below is
            unaffected. Hidden networks are labelled{" "}
            <code className="font-mono text-sky-200">AP-&lt;channel&gt;&lt;letter&gt;</code>, ordered by
            signal, so you can still tell them apart.
          </p>
          <details className="group">
            <summary className="cursor-pointer text-xs font-medium text-sky-200 underline-offset-4 hover:underline">
              How to reveal the real names
            </summary>
            <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-xs/5 text-sky-100/85">
              <li>
                Open System Settings → Privacy &amp; Security → Location Services and enable it for the
                app that launched this scan (Terminal, iTerm, or your editor), then restart that app.
              </li>
              <li>
                Rescan. If names still show as hidden, macOS is enforcing the stricter rule that only a
                signed, notarized app may read SSIDs.
              </li>
              <li>
                In that case, name your own network yourself with the field on the link card, or start
                the app with{" "}
                <code className="font-mono text-sky-200">WIFI_SSID=&quot;YourNetwork&quot; npm run dev</code>.
              </li>
            </ol>
          </details>
        </div>
      </div>
    </div>
  );
}
