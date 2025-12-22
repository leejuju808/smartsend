import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(
  req: Request,
  { params }: { params: { stepId: string } }
) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  
  const stepId = params.stepId;
  const { name, subject, body, weight } = await req.json();

  const { data: step, error: stepErr } = await supabase
    .from("sequence_steps")
    .select("sequence_id")
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

  const { data, error } = await supabase
    .from("sequence_step_variants")
    .insert({
      workspace_id: sequence.workspace_id,
      sequence_id: step.sequence_id,
      step_id: stepId,
      name: name || "Variant",
      subject,
      body,
      weight: weight ?? 100,
    })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error }, { status: 400 });

  return NextResponse.json({ variant: data }, { status: 200 });
}

