import { runWifiScan } from "../src/lib/wifi/scan";
import type { ScanResult } from "../src/lib/wifi/types";

const bold = (s: string) => `\u001b[1m${s}\u001b[0m`;
const dim = (s: string) => `\u001b[2m${s}\u001b[0m`;
const red = (s: string) => `\u001b[31m${s}\u001b[0m`;
const yellow = (s: string) => `\u001b[33m${s}\u001b[0m`;
const green = (s: string) => `\u001b[32m${s}\u001b[0m`;
const cyan = (s: string) => `\u001b[36m${s}\u001b[0m`;

function bar(value: number, width = 24): string {
  const filled = Math.round((value / 100) * width);
  const tone = value >= 75 ? green : value >= 50 ? yellow : red;
  return tone("█".repeat(filled)) + dim("░".repeat(width - filled));
}

function printReport(scan: ScanResult) {
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
        `  macOS hid ${scan.privacy.redactedNetworks}/${scan.privacy.totalNetworks} network names (SSIDs need a Location Services grant).`,
      ),
    );
    console.log(dim("  Radio measurements are unaffected. Set WIFI_SSID=\"YourNetwork\" to label your own link."));
    console.log();
  } else if (scan.privacy.resolvedVia && scan.privacy.resolvedVia !== "system_profiler") {
    console.log(dim(`  SSID recovered via ${scan.privacy.resolvedVia}.`));
    console.log();
  }

  if (cur) {
    console.log(`  ${bold(cur.label ?? cur.ssid)}  ${dim(`(${cur.interfaceName})`)}`);
    console.log(
      `  ${cur.band} GHz · ch ${cur.channel}${cur.widthMHz ? ` @ ${cur.widthMHz} MHz` : ""} · ${cur.phyMode ?? "unknown PHY"} · ${cur.security ?? "security n/a"}`,
    );
    console.log(
      `  RSSI ${cur.rssi ?? "—"} dBm · noise ${cur.noise ?? "—"} dBm · SNR ${cur.snr ?? "—"} dB · TX ${cur.txRateMbps ?? "—"} Mbps`,
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
    const mark = f.severity === "critical" ? red("✗") : f.severity === "warn" ? yellow("!") : green("✓");
    console.log(`  ${mark} ${f.title}`);
    console.log(`    ${dim(f.detail)}`);
  }
  console.log();

  console.log(bold("  Channel occupancy"));
  const quiet24 = scan.recommendedChannel24;
  const quiet5 = scan.recommendedChannel5;
  for (const [label, buckets, quiet] of [
    ["2.4 GHz", scan.channels24, quiet24],
    ["5 GHz", scan.channels5, quiet5],
  ] as const) {
    const busy = [...buckets]
      .sort((a, b) => b.occupancy - a.occupancy)
      .slice(0, 3)
      .filter((b) => b.occupancy > 0)
      .map((b) => `ch ${b.channel} (${b.networks} BSS)`);
    console.log(
      `  ${label}: busiest ${busy.length ? busy.join(", ") : "clear"} · quietest ${cyan(String(quiet ?? "—"))}`,
    );
  }
  console.log();

  console.log(bold("  Heard networks"));
  for (const n of scan.networks.slice(0, 10)) {
    const name = (n.label ?? n.ssid).padEnd(18);
    const marker = n.isCurrent ? cyan("→") : " ";
    console.log(
      `  ${marker} ${name} ${dim(
        `${n.band} GHz ch ${String(n.channel).padEnd(3)} ${String(n.widthMHz ?? "—").padStart(3)} MHz  ${String(n.rssi ?? "—").padStart(4)} dBm  ${n.phyMode ?? "—"}`,
      )}`,
    );
  }
  if (scan.networks.length > 10) {
    console.log(dim(`  … ${scan.networks.length - 10} more`));
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
