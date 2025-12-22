import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

export async function GET(
  _req: Request,
  { params }: { params: { sequenceId: string } }
) {
  const supabase = createClient();
  const sequenceId = params.sequenceId;

  const stepsPromise = supabase
    .from("mv_sequence_step_metrics")
    .select("*")
    .eq("sequence_id", sequenceId)
    .order("step_id", { ascending: true });

  const followupStepsPromise = supabase
    .from("followup_steps")
    .select("id")
    .eq("sequence_id", sequenceId);

  const [steps, followupSteps] = await Promise.all([stepsPromise, followupStepsPromise]);

  if (steps.error) {
    return NextResponse.json({ error: steps.error.message }, { status: 400 });
  }

  if (followupSteps.error) {
    return NextResponse.json({ error: followupSteps.error.message }, { status: 400 });
  }

  const stepIds = followupSteps.data?.map((row) => row.id) ?? [];
  let branchesData: unknown[] = [];

  if (stepIds.length > 0) {
    const branches = await supabase
      .from("mv_sequence_branch_metrics")
      .select("*")
      .eq("sequence_id", sequenceId)
      .in("step_id", stepIds)
      .order("step_id", { ascending: true })
      .order("goto_step", { ascending: true });

    if (branches.error) {
      return NextResponse.json({ error: branches.error.message }, { status: 400 });
    }

    branchesData = branches.data ?? [];
  }

  return NextResponse.json({
    steps: steps.data ?? [],
    branches: branchesData,
  });
}


