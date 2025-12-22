import { NextResponse } from "next/server";
import { orchestrateNext } from "@/lib/followup/orchestrator";

export async function POST(req: Request) {
  const payload = (await req.json().catch(() => null)) as { threadId?: string } | null;

  if (!payload?.threadId) {
    return NextResponse.json({ error: "thread_required" }, { status: 400 });
  }

  try {
    const result = await orchestrateNext(payload.threadId);
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "orchestration_failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}






