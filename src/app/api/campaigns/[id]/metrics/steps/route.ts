import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function GET(_: NextRequest, { params }: { params: { id: string }}) {
  const sb = createRouteHandlerClient({ cookies });
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data, error } = await sb
    .from("v_campaign_step_metrics")
    .select("*")
    .eq("campaign_id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // Normalize empty rows for steps 1..3 if missing
  const rows = (data || []).map(d => ({
    step_no: d.step_no, sent: d.sent, delivered: d.delivered,
    opens: d.opens, clicks: d.clicks, replies: d.replies, bounces: d.bounces
  }));
  return NextResponse.json({ rows });
}



