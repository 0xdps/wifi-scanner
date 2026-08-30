"use client";

import { useCallback, useMemo, useState } from "react";
import { Check, Pencil, Radio, RefreshCw, Wifi, WifiOff, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import type { AccessPoint, ScanResult } from "@/lib/wifi/types";
import { ChannelMap } from "./channel-map";
import { NetworkTable } from "./network-table";
import { PlanList } from "./plan-list";
import { PrivacyNotice } from "./privacy-notice";
import { ScoreRing } from "./score-ring";
import { useNickname } from "./use-nickname";

const severityClass = {
  critical: "border-rose-500/40 bg-rose-500/10 text-rose-100",
  warn: "border-amber-500/40 bg-amber-500/10 text-amber-100",
  ok: "border-emerald-500/30 bg-emerald-500/10 text-emerald-100",
};

export function WifiDashboard({ initial }: { initial: ScanResult }) {
  const [scan, setScan] = useState<ScanResult | null>(initial);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [nickname, saveNickname] = useNickname();

  const runScan = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/scan", { cache: "no-store" });
      if (!res.ok) throw new Error(`Scan failed (${res.status})`);
      setScan((await res.json()) as ScanResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Scan failed");
    } finally {
      setLoading(false);
    }
  }, []);

  const current = scan?.current;
  const currentName = nickname || current?.label || current?.ssid;

  // A nickname is a local label for the associated BSS, so apply it everywhere.
  const networks: AccessPoint[] = useMemo(() => {
    if (!scan) return [];
    if (!nickname) return scan.networks;
    return scan.networks.map((n) => (n.isCurrent ? { ...n, label: nickname } : n));
  }, [scan, nickname]);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-cyan-300/80">
            Mac radio planner
          </p>
          <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
            Scan Wi-Fi, then spend airtime on the right channel.
          </h1>
          <p className="max-w-2xl text-sm text-pretty text-muted-foreground sm:text-base">
            This dashboard reads the Mac Wi-Fi interface when you run it on macOS, scores signal,
            congestion, and PHY efficiency, and turns that into a sequenced speed plan.
          </p>
        </div>
        <Button onClick={() => void runScan()} disabled={loading} size="lg" className="shrink-0">
          <RefreshCw className={loading ? "animate-spin" : ""} />
          {loading ? "Scanning…" : "Scan again"}
        </Button>
      </header>

      {scan?.source === "demo" ? (
        <div className="rounded-xl border border-amber-400/30 bg-amber-400/8 px-4 py-3 text-sm text-amber-100">
          {scan.sourceNote}
        </div>
      ) : null}

      {scan ? <PrivacyNotice privacy={scan.privacy} /> : null}

      {error ? (
        <Card className="border-rose-500/40">
          <CardHeader>
            <CardTitle>Scan failed</CardTitle>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      {loading && !scan ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Radio className="animate-pulse" /> Listening for beacons
            </CardTitle>
            <CardDescription>Querying the Wi-Fi interface and building a channel map.</CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      {scan ? (
        <>
          <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card className="md:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                  {current ? <Wifi className="size-4" /> : <WifiOff className="size-4" />}
                  {current ? currentName : "Not associated"}
                  {current?.redacted && !nickname ? (
                    <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                      name hidden
                    </Badge>
                  ) : null}
                </CardTitle>
                <CardDescription>
                  {current
                    ? `${current.band} GHz · ch ${current.channel}${current.widthMHz ? ` @ ${current.widthMHz} MHz` : ""} · ${current.phyMode ?? "unknown PHY"} · ${current.security ?? "security n/a"}`
                    : "Join a network on this Mac and scan again."}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                  <Metric label="RSSI" value={current?.rssi != null ? `${current.rssi} dBm` : "—"} />
                  <Metric label="Noise" value={current?.noise != null ? `${current.noise} dBm` : "—"} />
                  <Metric label="SNR" value={current?.snr != null ? `${current.snr} dB` : "—"} />
                  <Metric
                    label="TX rate"
                    value={current?.txRateMbps != null ? `${current.txRateMbps} Mbps` : "—"}
                  />
                  <Metric label="MCS" value={current?.mcs != null ? String(current.mcs) : "—"} />
                  <Metric label="Interface" value={current?.interfaceName ?? "—"} />
                  <Metric label="Country" value={current?.countryCode ?? "—"} />
                  <Metric label="Neighbors" value={String(scan.networks.length)} />
                </div>
                {current ? <NicknameField value={nickname} onSave={saveNickname} /> : null}
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <ScoreRing label="Overall" value={scan.scores.overall} hint="Weighted score" />
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex flex-col gap-4 pt-6">
                <MiniScore label="Signal" value={scan.scores.signal} />
                <MiniScore label="Congestion" value={scan.scores.congestion} />
                <MiniScore label="Efficiency" value={scan.scores.efficiency} />
              </CardContent>
            </Card>
          </section>

          <section className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Findings</CardTitle>
                <CardDescription>
                  {scan.networks.length} networks heard · {new Date(scan.scannedAt).toLocaleString()}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {scan.findings.map((f) => (
                  <div
                    key={f.id}
                    className={`rounded-lg border px-3 py-2 text-sm ${severityClass[f.severity]}`}
                  >
                    <p className="font-medium">{f.title}</p>
                    <p className="mt-1 text-xs/5 opacity-90">{f.detail}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Channel occupancy</CardTitle>
                <CardDescription>Taller bars mean more overlapping BSS on that channel.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-8">
                <ChannelMap
                  title="2.4 GHz"
                  buckets={scan.channels24}
                  currentChannel={current?.band === "2.4" ? current.channel : undefined}
                  recommended={scan.recommendedChannel24}
                />
                <Separator />
                <ChannelMap
                  title="5 GHz"
                  buckets={scan.channels5}
                  currentChannel={current?.band === "5" ? current.channel : undefined}
                  recommended={scan.recommendedChannel5}
                />
              </CardContent>
            </Card>
          </section>

          <Card>
            <CardHeader>
              <CardTitle>Speed and efficiency plan</CardTitle>
              <CardDescription>
                Do the “now” steps first. They are ordered by expected throughput gain on a Mac.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <PlanList plan={scan.plan} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Heard networks</CardTitle>
              <CardDescription>
                Filter by band to see who you actually share airtime with. Hidden names are labelled
                by channel and signal rank, strongest first.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <NetworkTable networks={networks} />
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}

function NicknameField({
  value,
  onSave,
}: {
  value: string;
  onSave: (value: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => {
          setDraft(value);
          setEditing(true);
        }}
        className="flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-cyan-200"
      >
        <Pencil className="size-3" />
        {value ? "Rename this network" : "Name this network"}
      </button>
    );
  }

  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(draft);
        setEditing(false);
      }}
    >
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="e.g. Home-5G"
        className="min-w-0 flex-1 rounded-md border border-white/10 bg-white/5 px-2.5 py-1.5 text-sm outline-none placeholder:text-muted-foreground focus:border-cyan-400/50"
      />
      <Button type="submit" size="sm" variant="secondary">
        <Check className="size-3.5" /> Save
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        onClick={() => {
          setDraft(value);
          setEditing(false);
        }}
      >
        <X className="size-3.5" />
      </Button>
      <p className="w-full text-[11px] text-muted-foreground">
        Stored in this browser only. Useful when macOS withholds the SSID.
      </p>
    </form>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 font-mono text-sm text-cyan-100">{value}</p>
    </div>
  );
}

function MiniScore({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs">
        <span>{label}</span>
        <span className="tabular-nums text-muted-foreground">{value}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full bg-cyan-400"
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
}
