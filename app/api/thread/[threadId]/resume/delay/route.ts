import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

type DelayBody = {
  days?: number;
};

export async function POST(req: NextRequest, { params }: { params: { threadId: string } }) {
  const supabase = createRouteHandlerClient({ cookies });

  let days = 7;
  try {
    const body = (await req.json()) as DelayBody;
    if (typeof body?.days === "number" && Number.isFinite(body.days)) {
      days = Math.max(1, Math.round(body.days));
    }
  } catch {
    // Ignore malformed bodies and fall back to default days
  }

  const { error } = await supabase.rpc("delay_thread_resume", {
    p_thread: params.threadId,
    p_days: days
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, days });
}







