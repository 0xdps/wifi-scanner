# Mac Wi-Fi planner

Scan the radios a Mac can hear, score the current link, and get a sequenced plan to improve **speed** and **airtime efficiency**.

This cloud workspace is Linux and has no Mac Wi-Fi chip, so the preview uses a labeled demo capture of a congested apartment (Mac stuck on 2.4 GHz while a 5 GHz twin SSID is visible). On your Mac, the same app reads a live `system_profiler SPAirPortDataType` dump.

## What it does

- Reads the associated SSID, band, channel, RSSI, noise, PHY mode, and TX rate
- Lists neighboring BSS and maps 2.4 / 5 GHz occupancy
- Flags weak signal, co-channel crowding, legacy 802.11n/g, 40 MHz on 2.4 GHz, and open security
- Emits a do-now / this-week / later plan (prefer 5 GHz, retune channel, Wi-Fi 6, IoT split, Ethernet)

## Run it on your Mac

Wi-Fi scanning is a radio measurement. It only works on the machine holding the antenna, so this must run on the Mac you want to fix.

### Fastest: one file, no install

`dist/wifi-plan.mjs` is a self-contained bundle with zero runtime dependencies. Copy it to your Mac and run it with the Node that ships in any recent install:

```bash
node wifi-plan.mjs
```

### Full repo

```bash
git clone <this repo>
cd mac-wifi-planner
npm install
npm run scan      # terminal report, no browser
```

Rebuild the standalone file after changing analysis logic:

```bash
npm run build:standalone
```

Or use the dashboard:

```bash
npm run dev       # then open http://127.0.0.1:43147
```

macOS may prompt for Local Network permission when System Profiler enumerates networks. Nearby SSIDs are more complete with Location Services on.

## Why network names show as hidden

Since macOS 15, an SSID counts as location data. `system_profiler`, `wdutil`, `ipconfig`, and
`networksetup` all return the literal string `<redacted>` unless the calling program holds a Location
Services grant, and macOS only grants it to signed, notarized apps — not to scripts or `node`.

Every radio measurement is unaffected: channel, width, RSSI, noise, PHY mode, security, and TX rate
are exact, so the plan is the same either way. Hidden networks get a synthesized label of
`AP-<channel><letter>`, ranked by signal, so you can still tell APs apart and spot which ones share
your channel.

To get real names back:

1. System Settings → Privacy & Security → Location Services → enable it for the app running the
   scan (Terminal, iTerm, your editor), then restart that app and rescan.
2. If macOS still withholds them, name your own network directly:

```bash
WIFI_SSID="Home-5G" npm run dev
```

In the dashboard you can also click **Name this network** on the link card; the name is stored in
that browser only. A neighbor sharing your channel, width, and security is tagged `same profile`,
which usually means it is your own router's other radio.

## Scan on the Mac, read the report elsewhere

```bash
# on the Mac
system_profiler SPAirPortDataType -json > my-wifi.json

# anywhere (same file)
WIFI_SCAN_FILE=my-wifi.json npm run scan
WIFI_SCAN_FILE=my-wifi.json npm run dev
```

`fixtures/macos-redacted.json` is a checked-in capture with hidden SSIDs, useful for working on the
UI on a machine without a Mac radio:

```bash
WIFI_SCAN_FILE=fixtures/macos-redacted.json npm run dev
```

## API

`GET /api/scan` returns JSON: current link, heard networks, scores, findings, channel buckets, the
plan, and a `privacy` block reporting how many SSIDs macOS withheld. `npm run scan -- --json` prints
the same payload.

## Notes

- Live scans only work on the machine that has the radio. A hosted preview cannot see your home AP.
- Linux fallback uses `nmcli device wifi list` when NetworkManager is present.
- Channel advice uses 1 / 6 / 11 on 2.4 GHz and the quietest 20 MHz slot on 5 GHz from this snapshot. Re-scan at the time of day you actually work.
