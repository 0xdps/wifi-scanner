import { runWifiScan } from "@/lib/wifi/scan";

export const dynamic = "force-dynamic";

export async function GET() {
  const result = await runWifiScan();
  return Response.json(result);
}
