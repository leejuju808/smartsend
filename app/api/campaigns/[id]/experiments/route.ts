import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// GET /api/campaigns/[id]/experiments
// Returns experiments + current perf (join view)
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const sb = createClient();
  const campaignId = params.id;

  try {
    // Get all experiments for this campaign
    const { data: experiments, error: expError } = await sb
      .from("tone_experiments")
      .select("*")
      .eq("campaign_id", campaignId)
      .order("created_at", { ascending: false });

    if (expError) {
      return NextResponse.json({ error: expError.message }, { status: 500 });
    }

    // Get performance data for all experiments
    const experimentIds = (experiments ?? []).map((e) => e.id);
    const { data: perf } = await sb
      .from("tone_experiment_perf_30d")
      .select("*")
      .in("experiment_id", experimentIds);

    // Group performance by experiment_id and arm
    const perfByExp = new Map<string, { control?: any; treatment?: any }>();
    for (const p of perf ?? []) {
      if (!perfByExp.has(p.experiment_id)) {
        perfByExp.set(p.experiment_id, {});
      }
      const expPerf = perfByExp.get(p.experiment_id)!;
      if (p.arm === "control") {
        expPerf.control = p;
      } else {
        expPerf.treatment = p;
      }
    }

    // Calculate lift for each experiment
    const experimentsWithPerf = (experiments ?? []).map((exp) => {
      const expPerf = perfByExp.get(exp.id) ?? {};
      const control = expPerf.control;
      const treatment = expPerf.treatment;

      let lift: number | null = null;
      if (control && treatment) {
        const controlMetric = Number(control[exp.primary_metric] ?? 0);
        const treatmentMetric = Number(treatment[exp.primary_metric] ?? 0);
        lift = treatmentMetric - controlMetric;
      }

      return {
        ...exp,
        performance: {
          control,
          treatment,
          lift,
        },
      };
    });

    return NextResponse.json({ experiments: experimentsWithPerf });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST /api/campaigns/[id]/experiments
// Create a new experiment
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const sb = createClient();
  const campaignId = params.id;
  const body = await req.json();

  try {
    const { data: experiment, error } = await sb
      .from("tone_experiments")
      .insert({
        campaign_id: campaignId,
        name: body.name,
        step_number: body.step_number,
        scope: body.scope ?? "segment",
        status: body.status ?? "running",
        ramp_percent: body.ramp_percent ?? 10,
        min_sample: body.min_sample ?? 500,
        promote_threshold: body.promote_threshold ?? 0.05,
        primary_metric: body.primary_metric ?? "meeting_share",
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ experiment });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// PATCH /api/campaigns/[id]/experiments
// Update experiment settings (pause, ramp, min_sample, primary_metric)
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const sb = createClient();
  const body = await req.json();
  const { experiment_id, ...updates } = body;

  if (!experiment_id) {
    return NextResponse.json({ error: "experiment_id required" }, { status: 400 });
  }

  try {
    // Only allow updating specific fields
    const allowed = (({
      status,
      ramp_percent,
      min_sample,
      primary_metric,
    }) => ({
      status,
      ramp_percent,
      min_sample,
      primary_metric,
    }))(updates);

    const { data: experiment, error } = await sb
      .from("tone_experiments")
      .update(allowed)
      .eq("id", experiment_id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ experiment });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}















