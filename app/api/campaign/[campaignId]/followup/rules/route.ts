import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { requireRole } from "@/lib/auth/requireRole";

export async function GET(_req: Request, { params }: { params: { campaignId: string } }) {
  const supabase = createRouteHandlerClient({ cookies });
  const { data, error } = await supabase
    .from("followup_rules")
    .select(
      "auto_reweight_enabled,reweight_min_sends,reweight_metric,reweight_floor,reweight_ceiling,reweight_smoothing,picker_mode,picker_epsilon",
    )
    .eq("campaign_id", params.campaignId)
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, rules: data });
}

export async function PATCH(req: Request, { params }: { params: { campaignId: string } }) {
  // only owner/admin can modify follow-up rules
  const gate = await requireRole(["owner", "admin"]);
  if (!gate.allowed) return gate.res;

  const supabase = createRouteHandlerClient({ cookies });
  const body = await req.json().catch(() => ({}));
  const patch: Record<string, unknown> = {};
  const keys = [
    "auto_reweight_enabled",
    "reweight_min_sends",
    "reweight_metric",
    "reweight_floor",
    "reweight_ceiling",
    "reweight_smoothing",
    "picker_mode",
    "picker_epsilon",
  ];

  for (const k of keys) {
    if (k in body) {
      patch[k] = (body as Record<string, unknown>)[k];
    }
  }

  const { error } = await supabase.from("followup_rules").update(patch).eq("campaign_id", params.campaignId);

  if (error) {
    return NextResponse.json({ ok: false, error: "db_error" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request, { params }: { params: { campaignId: string } }) {
  // only owner/admin can delete follow-up rules
  const gate = await requireRole(["owner", "admin"]);
  if (!gate.allowed) return gate.res;

  const supabase = createRouteHandlerClient({ cookies });
  const { error } = await supabase
    .from("followup_rules")
    .delete()
    .eq("campaign_id", params.campaignId);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

