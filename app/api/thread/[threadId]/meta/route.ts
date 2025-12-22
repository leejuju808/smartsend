import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function GET(_req: Request, { params }: { params: { threadId: string } }) {
  const supabase = createRouteHandlerClient({ cookies });

  const { data: thread, error } = await supabase
    .from("inbox_threads")
    .select("id,campaign_id")
    .eq("id", params.threadId)
    .maybeSingle();

  if (error || !thread) {
    return NextResponse.json({ ok: false, error: "thread_not_found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, campaign_id: thread.campaign_id });
}


