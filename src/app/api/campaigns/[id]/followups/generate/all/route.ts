import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function POST(req: NextRequest, { params }: { params: { id: string }}) {
  const sb = createRouteHandlerClient({ cookies });
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // Determine max configured step for this campaign
  const { data: steps, error: se } = await sb
    .from("campaign_steps").select("step_no, enabled").eq("campaign_id", params.id);

  if (se) return NextResponse.json({ error: se.message }, { status: 400 });

  const enabledSteps = (steps || []).filter(s => s.enabled).map(s => s.step_no);
  const maxStep = enabledSteps.length ? Math.max(...enabledSteps) : 1;

  let totalQueued = 0;
  // Generate next for each step that can have a "next" (1->2, 2->3, etc.)
  for (let from = 1; from < maxStep; from++) {
    const { data, error } = await sb.rpc("schedule_followups_for_campaign", {
      p_campaign: params.id, p_from_step: from, p_limit: 1000
    });
    if (error) return NextResponse.json({ error: error.message, from }, { status: 400 });
    totalQueued += (data ?? 0);
  }

  return NextResponse.json({ ok: true, queued: totalQueued, steps: enabledSteps.sort((a,b)=>a-b) });
}



