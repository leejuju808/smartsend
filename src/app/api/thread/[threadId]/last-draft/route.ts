import { NextRequest, NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase";

export async function GET(
  _req: NextRequest,
  { params }: { params: { threadId: string } }
) {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("reply_drafts")
    .select(
      `
      id,
      thread_id,
      campaign_id,
      lead_id,
      source_message_id,
      kind,
      subject,
      body,
      meta,
      created_at
    `
    )
    .eq("thread_id", params.threadId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ draft: data ?? null });
}



