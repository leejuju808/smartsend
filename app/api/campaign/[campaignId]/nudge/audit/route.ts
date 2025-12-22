import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function GET(req: Request, { params }: { params: { campaignId: string } }) {
  const supabase = createRouteHandlerClient({ cookies });
  const { searchParams } = new URL(req.url);
  const limit = Number(searchParams.get("limit") || 50);

  const { data, error } = await supabase
    .from("variant_weight_audit")
    .select(
      "created_at,scenario,tone,variant_id,old_weight,new_weight,basis,window_start,window_end,stats",
    )
    .eq("campaign_id", params.campaignId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    return NextResponse.json({ ok: false, error: "db_error" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, items: data });
}

