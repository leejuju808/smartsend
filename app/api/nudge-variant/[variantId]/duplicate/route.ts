import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function POST(_req: Request, { params }: { params: { variantId: string } }) {
  const supabase = createRouteHandlerClient({ cookies });

  const { data: existing, error: fetchError } = await supabase
    .from("nudge_variants")
    .select("*")
    .eq("id", params.variantId)
    .single();

  if (fetchError || !existing) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  const insertRow = {
    campaign_id: existing.campaign_id,
    scenario: existing.scenario,
    tone: existing.tone,
    name: `${existing.name ?? "Variant"} (copy)`,
    subject: existing.subject,
    body: existing.body,
    weight: existing.weight,
    is_active: existing.is_active,
    pinned: existing.pinned ?? false,
    pinned_weight: existing.pinned_weight ?? null,
  };

  const { data: inserted, error: insertError } = await supabase
    .from("nudge_variants")
    .insert(insertRow)
    .select()
    .single();

  if (insertError) {
    return NextResponse.json({ ok: false, error: "db_error" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, variant: inserted });
}


