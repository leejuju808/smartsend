import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { assertEditor } from "@/lib/acl";

export async function POST(_req: NextRequest, { params }: { params: { threadId: string } }) {
  const supabase = createRouteHandlerClient({ cookies });

  const thread = await supabase
    .from("inbox_threads")
    .select("campaign_id")
    .eq("id", params.threadId)
    .single();

  if (thread.error) {
    return NextResponse.json({ error: thread.error.message }, { status: 500 });
  }

  try {
    await assertEditor(thread.data.campaign_id);
  } catch {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const result = await supabase.rpc("create_followup_task", { p_thread: params.threadId });

  if (result.error) {
    return NextResponse.json({ error: result.error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, task_id: result.data });
}



