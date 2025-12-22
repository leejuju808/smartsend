import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const variantId = body?.variantId as string | undefined;
  const campaignId = body?.campaignId as string | undefined;
  const scenario = body?.scenario as string | undefined;
  const action = body?.action as string | undefined;

  if (!variantId || !campaignId || !scenario || !action) {
    return NextResponse.json({ error: "variantId, campaignId, scenario, and action are required" }, { status: 400 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRole) {
    return NextResponse.json({ error: "Supabase credentials not configured" }, { status: 500 });
  }

  const client = createClient(supabaseUrl, serviceRole, {
    auth: { persistSession: false },
  });

  const lowerAction = action.toLowerCase();

  if (lowerAction === "pause") {
    const { error } = await client.from("nudge_variants").update({ is_active: false }).eq("id", variantId);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  if (lowerAction === "resume") {
    const { error } = await client.from("nudge_variants").update({ is_active: true }).eq("id", variantId);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  const { data: banditRow, error: lookupError } = await client
    .from("nudge_bandit_state")
    .select("alpha, beta, success_weight, failure_weight")
    .eq("campaign_id", campaignId)
    .eq("scenario", scenario)
    .eq("variant_id", variantId)
    .maybeSingle();

  if (lookupError) {
    return NextResponse.json({ error: lookupError.message }, { status: 500 });
  }

  const baseAlpha = banditRow?.alpha ?? 1;
  const baseBeta = banditRow?.beta ?? 1;
  const successWeight = banditRow?.success_weight ?? 1;
  const failureWeight = banditRow?.failure_weight ?? 1;

  if (lowerAction === "boost") {
    const { error } = await client
      .from("nudge_bandit_state")
      .upsert({
        campaign_id: campaignId,
        scenario,
        variant_id: variantId,
        alpha: baseAlpha + 0.5,
        beta: baseBeta,
        success_weight: successWeight,
        failure_weight: failureWeight,
        last_update: new Date().toISOString(),
      }, { onConflict: "campaign_id,scenario,variant_id" });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  }

  if (lowerAction === "reset") {
    const { error } = await client
      .from("nudge_bandit_state")
      .upsert({
        campaign_id: campaignId,
        scenario,
        variant_id: variantId,
        alpha: 1,
        beta: 1,
        success_weight: successWeight,
        failure_weight: failureWeight,
        last_update: new Date().toISOString(),
      }, { onConflict: "campaign_id,scenario,variant_id" });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: `Unsupported action: ${action}` }, { status: 400 });
}
