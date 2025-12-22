import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function POST(req: NextRequest, { params }: { params: { id: string }}) {
  const supabase = createRouteHandlerClient({ cookies });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // owner or editor can build queue; owner-only launch is enforced elsewhere
  const campaignId = params.id;
  const url = new URL(req.url);
  const dateParam = url.searchParams.get("date");        // YYYY-MM-DD
  const when = dateParam ? new Date(dateParam + "T00:00:00Z") : new Date(); // default today

  const day = when.toISOString().slice(0,10);

  const { data, error } = await supabase.rpc("build_campaign_queue_for_day", {
    p_campaign: campaignId, p_date: day
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // audit
  await supabase.rpc("log_audit", {
    p_actor: user.id,
    p_campaign: campaignId,
    p_entity_type: "queue",
    p_entity: null,
    p_action: "queue_build",
    p_meta: { date: day, result: data?.[0] ?? null }
  });

  return NextResponse.json({ ok: true, summary: data?.[0] ?? null });
}



