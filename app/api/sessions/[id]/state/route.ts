import { NextResponse } from "next/server";
import { getRoot } from "@/lib/cordis/root";
import { resolveSessionPath } from "@/lib/session-reader";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const ctx = await getRoot();
    const rpc = ctx.sessions.getRpcSession(id);
    if (rpc?.isAlive()) {
      const state = await rpc.send({ type: "get_state" });
      return NextResponse.json({ running: true, state });
    }

    if (!await resolveSessionPath(id)) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }
    return NextResponse.json({ running: false });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
