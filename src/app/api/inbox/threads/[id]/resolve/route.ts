import { NextRequest, NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/supabase/admin";

const sb = supabaseAdmin;

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const threadId = params.id;

  if (!threadId) {
    return NextResponse.json({ error: "thread id required" }, { status: 400 });
  }

  const { error } = await sb
    .from("inbox_threads")
    .update({ needs_reply: false })
    .eq("id", threadId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}




