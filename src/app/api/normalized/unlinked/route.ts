import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function GET(req: NextRequest) {
  const supabase = createRouteHandlerClient({ cookies });
  const { searchParams } = new URL(req.url);
  const limitParam = searchParams.get("limit");
  const limit = Math.min(Math.max(Number(limitParam) || 50, 1), 200);

  const { data, error } = await supabase
    .from("normalized_messages")
    .select("id, from_email, subject, body_preview, sent_at, provider")
    .eq("link_status", "unlinked")
    .order("sent_at", { ascending: false, nullsLast: true })
    .limit(limit);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ messages: data ?? [] });
}

