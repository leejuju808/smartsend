import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function GET(req: NextRequest) {
  const supabase = createRouteHandlerClient({ cookies });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const thread = url.searchParams.get("thread");
  if (!thread) return NextResponse.json({ error: "thread parameter required" }, { status: 400 });

  const { data } = await supabase
    .from("inbox_threads")
    .select("id, campaign_id, lead_id, subject")
    .eq("id", thread)
    .maybeSingle();

  return NextResponse.json(data ?? {}, { headers: { "content-type": "application/json" } });
}

