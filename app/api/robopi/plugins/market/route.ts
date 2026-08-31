import { NextResponse } from "next/server";
import { listMarketWithStatus, MARKET_FILE } from "@/lib/plugin-registry";

export const dynamic = "force-dynamic";

/** GET /api/robopi/plugins/market —— 插件市场（含已安装状态） */
export async function GET() {
  const plugins = await listMarketWithStatus();
  return NextResponse.json({
    plugins,
    marketFile: MARKET_FILE,
  });
}
