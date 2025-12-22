import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function GET(_: NextRequest, { params }: { params: { threadId: string } }) {
  const supabase = createRouteHandlerClient({ cookies });
  const { data, error } = await supabase
    .from("reply_drafts")
    .select("id")
    .eq("thread_id", params.threadId)
    .in("status", ["draft", "queued"])
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ id: data?.[0]?.id ?? null });
}


