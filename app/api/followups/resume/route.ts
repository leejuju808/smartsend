import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

type ResumeBody = {
  thread_id?: string;
};

export async function POST(req: Request) {
  let threadId: string | undefined;
  try {
    const body = (await req.json()) as ResumeBody;
    threadId = typeof body?.thread_id === "string" ? body.thread_id : undefined;
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  if (!threadId) {
    return NextResponse.json({ error: "thread_id_required" }, { status: 400 });
  }

  const supabase = createRouteHandlerClient({ cookies });
  const { error } = await supabase.rpc("resume_lead_followups", {
    p_thread_id: threadId,
    p_reason: "manual",
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}





