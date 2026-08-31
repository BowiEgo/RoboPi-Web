import { NextResponse } from "next/server";
import { getRoot } from "@/lib/cordis/root";

export const dynamic = "force-dynamic";

// GET /api/agent/running - Lightweight snapshot for visible-tab polling.
export async function GET() {
  const ctx = await getRoot();
  return NextResponse.json(
    {
      runningSessionIds: ctx.sessions.getRunningRpcSessionIds(),
      completionNotificationSuppressedSessionIds: ctx.sessions.getCompletionNotificationSuppressedRpcSessionIds(),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
