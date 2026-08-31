import { NextResponse } from "next/server";
import {
  attachSessionProjectInfo,
  listAllSessions,
  mergeSessionLists,
} from "@/lib/session-reader";
import { getRoot } from "@/lib/cordis/root";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const force = new URL(req.url).searchParams.get("force") === "1";
    const ctx = await getRoot();
    const [persistedSessions, runtimeSessions] = await Promise.all([
      listAllSessions({ force }),
      attachSessionProjectInfo(ctx.sessions.getRpcSessionInfos()),
    ]);
    const sessions = mergeSessionLists(persistedSessions, runtimeSessions);
    return NextResponse.json(
      {
        sessions,
        runningSessionIds: ctx.sessions.getRunningRpcSessionIds(),
        completionNotificationSuppressedSessionIds: ctx.sessions.getCompletionNotificationSuppressedRpcSessionIds(),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      { error: String(error) },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
