import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function GET(req: NextRequest) {
  const supabase = createRouteHandlerClient({ cookies });
  const { searchParams } = new URL(req.url);
  const presetId = searchParams.get("preset_id");

  let query = supabase
    .from("rewrite_variant_stats")
    .select(
      "window,campaign_id,preset_id,tone,goal,length,source,open_rate,reply_rate,sends,updated_at",
    )
    .order("window", { ascending: false })
    .limit(500);

  if (presetId) {
    query = query.eq("preset_id", presetId);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ stats: data ?? [] });
}



