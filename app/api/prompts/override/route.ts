import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

const OverrideSchema = z.object({
  campaignId: z.string().uuid(),
  stepNumber: z.number().int().positive().nullable().optional(),
  kind: z.enum(["rewrite", "policy", "guardrails"]),
  packId: z.string().uuid(),
  version: z.number().int().positive(),
});

export async function POST(req: Request) {
  const sb = createClient();
  const { data: auth } = await sb.auth.getUser();

  if (!auth?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const parsed = OverrideSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const { campaignId, stepNumber, kind, packId, version } = parsed.data;

  // Verify campaign ownership
  const { data: campaign, error: campaignError } = await sb
    .from("campaigns")
    .select("id, account_id, workspace_id, user_id, eval_min_macro_f1, eval_min_accuracy")
    .eq("id", campaignId)
    .maybeSingle();

  if (campaignError || !campaign) {
    return NextResponse.json(
      { error: "Campaign not found" },
      { status: 404 }
    );
  }

  // Check if user has access to campaign
  const hasAccess =
    campaign.account_id === auth.user.id ||
    campaign.workspace_id === auth.user.id ||
    campaign.user_id === auth.user.id;

  if (!hasAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Verify pack exists and version exists
  const { data: packVersion, error: packError } = await sb
    .from("prompt_pack_versions")
    .select("pack_id, version")
    .eq("pack_id", packId)
    .eq("version", version)
    .maybeSingle();

  if (packError || !packVersion) {
    return NextResponse.json(
      { error: "Prompt pack version not found" },
      { status: 404 }
    );
  }

  // Promotion guard: Check eval thresholds if campaign has them set
  const minMacroF1 = campaign.eval_min_macro_f1 ?? null;
  const minAccuracy = campaign.eval_min_accuracy ?? null;
  
  if (minMacroF1 !== null || minAccuracy !== null) {
    // Find the most recent eval run for this pack/version
    // For detector packs, check against active eval sets
    const { data: latestRun } = await sb
      .from("eval_runs")
      .select("id, macro_f1, accuracy, eval_set_id, created_at")
      .eq("pack_id", packId)
      .eq("pack_version", version)
      .eq("pack_kind", kind === "policy" ? "detector" : kind) // Map policy -> detector for eval
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!latestRun) {
      return NextResponse.json(
        {
          error: "No eval run found for this pack version",
          message: "Please run evaluation before promoting this pack version",
          required: {
            min_macro_f1: minMacroF1,
            min_accuracy: minAccuracy,
          },
        },
        { status: 400 }
      );
    }

    const macroF1 = latestRun.macro_f1 ?? 0;
    const accuracy = latestRun.accuracy ?? 0;
    const failures: string[] = [];

    if (minMacroF1 !== null && macroF1 < minMacroF1) {
      failures.push(`Macro-F1 ${macroF1.toFixed(3)} < required ${minMacroF1}`);
    }
    if (minAccuracy !== null && accuracy < minAccuracy) {
      failures.push(`Accuracy ${accuracy.toFixed(3)} < required ${minAccuracy}`);
    }

    if (failures.length > 0) {
      return NextResponse.json(
        {
          error: "Eval thresholds not met",
          message: "Cannot promote pack version: evaluation metrics below campaign thresholds",
          metrics: {
            macro_f1: macroF1,
            accuracy: accuracy,
          },
          required: {
            min_macro_f1: minMacroF1,
            min_accuracy: minAccuracy,
          },
          failures,
          run_id: latestRun.id,
        },
        { status: 400 }
      );
    }
  }

  // Safeguard: Check for active experiments (freeze prompt version during experiments)
  if (kind === "policy") {
    const { data: activeExperiments } = await sb
      .from("tone_experiments")
      .select("id, name, status")
      .eq("campaign_id", campaignId)
      .eq("status", "running")
      .limit(1);

    if (activeExperiments && activeExperiments.length > 0) {
      return NextResponse.json(
        {
          error: "Cannot change policy pack during active experiment",
          experiment: activeExperiments[0],
          warning: "Please pause or complete the experiment first, or confirm override",
        },
        { status: 409 }
      );
    }
  }

  // Upsert override
  const { error: overrideError } = await sb
    .from("campaign_prompt_overrides")
    .upsert(
      {
        campaign_id: campaignId,
        step_number: stepNumber ?? null,
        kind,
        pack_id: packId,
        version,
      },
      {
        onConflict: "campaign_id,step_number,kind",
      }
    );

  if (overrideError) {
    return NextResponse.json(
      { error: overrideError.message },
      { status: 400 }
    );
  }

  return NextResponse.json({ ok: true });
}

