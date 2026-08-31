import { NextResponse } from "next/server";
import { homedir } from "os";

export const dynamic = "force-dynamic";

/** GET /api/home —— 用户主目录 */
export async function GET() {
  return NextResponse.json({ home: homedir() });
}
