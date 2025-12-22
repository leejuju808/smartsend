import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { assertEditorByStep } from "@/lib/acl";

export async function POST(
  _req: NextRequest,
  { params }: { params: { variantId: string } },
) {
  const supabase = createRouteHandlerClient({ cookies });

  const { data: variant, error: variantError } = await supabase
    .from("step_variants")
    .select("id, step_id")
    .eq("id", params.variantId)
    .maybeSingle();

  if (variantError) {
    return NextResponse.json({ error: variantError.message }, { status: 500 });
  }
  if (!variant) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  await assertEditorByStep(variant.step_id);

  const { data: step, error: stepError } = await supabase
    .from("campaign_steps")
    .select("campaign_id")
    .eq("id", variant.step_id)
    .maybeSingle();

  if (stepError) {
    return NextResponse.json({ error: stepError.message }, { status: 500 });
  }
  if (!step) {
    return NextResponse.json({ error: "step_not_found" }, { status: 404 });
  }

  const { error: updateError } = await supabase
    .from("step_variants")
    .update({ active: true, notes: null })
    .eq("id", params.variantId);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  const { error: eventError } = await supabase.from("deliverability_events").insert({
    campaign_id: step.campaign_id,
    entity_type: "variant",
    entity_id: params.variantId,
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

