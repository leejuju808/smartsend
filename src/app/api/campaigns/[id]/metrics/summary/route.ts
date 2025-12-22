import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function GET(_: NextRequest, { params }: { params: { id: string }}) {
  const supabase = createRouteHandlerClient({ cookies });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const campId = params.id;

  const [{ data: summary, error: sErr }, { data: metrics, error: mErr }, { data: domains, error: dErr }] = await Promise.all([
    supabase.from("v_campaign_summary").select("*").eq("campaign_id", campId).single(),
    supabase.from("v_campaign_metrics").select("*").eq("campaign_id", campId).maybeSingle(),
    supabase.from("v_top_domains_30d").select("*").eq("campaign_id", campId).limit(25)
  ]);
  if (sErr) return NextResponse.json({ error: sErr.message }, { status: 400 });
  if (dErr) return NextResponse.json({ error: dErr.message }, { status: 400 });

  // Merge metrics into summary
  const enrichedSummary = {
    ...summary,
    opens_unique: metrics?.opens_unique || 0,
    clicks_unique: metrics?.clicks_unique || 0,
    unsub_unique: metrics?.unsub_unique || 0
  };

  // sort top domains by replies_30d desc
  const top = (domains||[]).sort((a:any,b:any)=> (b.replies_30d||0) - (a.replies_30d||0)).slice(0,10);

  return NextResponse.json({ summary: enrichedSummary, top_domains: top });
}
