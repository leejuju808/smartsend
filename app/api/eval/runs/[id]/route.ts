import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// GET /api/eval/runs/[id] - Get run details with predictions
export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  const sb = createClient();
  const { data: auth } = await sb.auth.getUser();

  if (!auth?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: run, error: runError } = await sb
    .from("eval_runs")
    .select("*")
    .eq("id", params.id)
    .single();

  if (runError || !run) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }

  // Get predictions for this run
  const { data: predictions, error: predError } = await sb
    .from("eval_predictions")
    .select(`
      id,
      item_id,
      pred_label,
      confidence,
      correct,
      eval_items (
        id,
        text,
        gold_label
      )
    `)
    .eq("run_id", params.id);

  if (predError) {
    return NextResponse.json({ error: predError.message }, { status: 400 });
  }

  // Get previous run for comparison
  const { data: previousRun } = await sb
    .from("eval_runs")
    .select("id, macro_f1, accuracy, created_at")
    .eq("eval_set_id", run.eval_set_id)
    .lt("created_at", run.created_at)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return NextResponse.json({
    run,
    predictions: predictions || [],
    previous_run: previousRun || null,
  });
}















