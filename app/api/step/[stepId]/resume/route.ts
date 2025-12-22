import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { assertEditorByStep } from "@/lib/acl";

export async function POST(
  _req: NextRequest,
  { params }: { params: { stepId: string } },
) {
  const supabase = createRouteHandlerClient({ cookies });

  const { data: step, error: stepError } = await supabase
    .from("campaign_steps")
    .select("id, campaign_id")
    .eq("id", params.stepId)
    .maybeSingle();

  if (stepError) {
    return NextResponse.json({ error: stepError.message }, { status: 500 });
  }
  if (!step) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  await assertEditorByStep(params.stepId);

  const { error: updateError } = await supabase
    .from("campaign_steps")
    .update({ paused: false, paused_reason: null, paused_at: null })
    .eq("id", params.stepId);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  const { error: eventError } = await supabase.from("deliverability_events").insert({
    campaign_id: step.campaign_id,
    entity_type: "step",
    entity_id: params.stepId,
    level: "resume",
    reason: "manual resume",
    provider: "guard",
    event_type: "guard",
    meta: {},
  });

  if (eventError) {
    return NextResponse.json({ error: eventError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

