import { connection } from "next/server";
import { WifiDashboard } from "@/components/wifi/dashboard";
import { runWifiScan } from "@/lib/wifi/scan";

export default async function Home() {
  // A scan is a request-time radio measurement; without this the page is
  // prerendered and `next start` would serve readings taken at build time.
  await connection();
  const initial = await runWifiScan();
  return <WifiDashboard initial={initial} />;
}
