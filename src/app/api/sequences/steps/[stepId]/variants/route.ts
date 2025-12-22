// app/api/sequences/steps/[stepId]/variants/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  req: Request,
  { params }: { params: { stepId: string } }
) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  
  const stepId = params.stepId;

  const { data: step, error: stepErr } = await supabase
    .from("sequence_steps")
    .select("id, sequence_id")
    .eq("id", stepId)
    .single();

  if (stepErr || !step) {
    return NextResponse.json({ error: "step_not_found" }, { status: 404 });
  }

  // Get workspace_id from sequence
  const { data: sequence, error: seqErr } = await supabase
    .from("sequences")
    .select("workspace_id")
    .eq("id", step.sequence_id)
    .single();

  if (seqErr || !sequence) {
    return NextResponse.json({ error: "sequence_not_found" }, { status: 404 });
  }

  const { data: variants, error } = await supabase
    .from("sequence_step_variants")
    .select("id, name, subject, body, weight, is_default")
    .eq("step_id", stepId)
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error }, { status: 400 });
  }

  const { data: stats } = await supabase
    .from("sequence_variant_stats")
    .select("*")
    .eq("step_id", stepId);

  const statsById = new Map<string, any>();
  (stats || []).forEach((s) => statsById.set(s.variant_id, s));

  const merged = (variants || []).map((v) => ({
    ...v,
    stats: statsById.get(v.id) || null,
  }));

  return NextResponse.json({ variants: merged }, { status: 200 });
}