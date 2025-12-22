import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { data: campaign, error: cErr } = await supabase
    .from("campaigns")
    .select("*")
    .eq("id", params.id)
    .single();

  if (cErr || !campaign) {
    return NextResponse.json(
      { error: "campaign_not_found", details: cErr?.message },
      { status: 404 }
    );
  }

  // Duplicate campaign row (best-effort across evolving schemas)
  const copy: any = { ...(campaign as any) };
  for (const k of [
    "id",
    "created_at",
    "updated_at",
    "started_at",
    "finished_at",
    "launched_at",
    "scheduled_at",
  ]) {
    delete copy[k];
  }

  copy.name = `${(campaign as any).name || "Campaign"} (Copy)`;
  copy.status = "draft";
  if ("created_by" in copy) copy.created_by = user.id;
  if ("owner_id" in copy) copy.owner_id = user.id;
  if ("is_shared" in copy) copy.is_shared = false;

  const { data: inserted, error: insErr } = await supabase
    .from("campaigns")
    .insert(copy)
    .select("id")
    .single();

  if (insErr || !inserted?.id) {
    return NextResponse.json(
      { error: "duplicate_failed", details: insErr?.message },
      { status: 500 }
    );
  }

  const newCampaignId = inserted.id as string;

  // Duplicate campaign_steps (if present)
  try {
    const { data: steps } = await supabase
      .from("campaign_steps")
      .select("*")
      .eq("campaign_id", params.id);

    if (steps && steps.length > 0) {
      const stepRows = steps.map((s: any) => {
        const row = { ...s };
        delete row.id;
        row.campaign_id = newCampaignId;
        return row;
      });
      await supabase.from("campaign_steps").insert(stepRows as any);
    }
  } catch {
    // ignore
  }

  // Duplicate template_variants (if present)
  try {
    const { data: variants } = await supabase
      .from("template_variants")
      .select("*")
      .eq("campaign_id", params.id);

    if (variants && variants.length > 0) {
      const rows = variants.map((v: any) => {
        const row = { ...v };
        delete row.id;
        row.campaign_id = newCampaignId;
        return row;
      });
      await supabase.from("template_variants").insert(rows as any);
    }
  } catch {
    // ignore
  }

  return NextResponse.json({ ok: true, id: newCampaignId, next: `/campaigns/${newCampaignId}` });
}








