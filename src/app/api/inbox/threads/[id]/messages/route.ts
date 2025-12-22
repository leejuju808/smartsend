import { NextRequest, NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/supabase/admin";

const sb = supabaseAdmin;

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const threadId = params.id;

  if (!threadId) {
    return NextResponse.json({ error: "thread id required" }, { status: 400 });
  }

  const { data, error } = await sb
    .from("inbox_messages")
    .select(
      "id, direction, subject, body_text, body_html, created_at, from_email, from_name, meta, provider, provider_message_id, account_id, ai_label, ai_confidence"
    )
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true })
    .limit(20);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ messages: data ?? [] });
}



