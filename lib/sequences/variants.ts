import { createClient } from "@/lib/supabase/server";

export async function chooseVariantForStep(args: {
  workspaceId: string;
  sequenceId: string;
  stepId: string;
}) {
  const supabase = createClient();

  const { data: variants, error } = await supabase
    .from("sequence_step_variants")
    .select("id, weight, is_default")
    .eq("workspace_id", args.workspaceId)
    .eq("sequence_id", args.sequenceId)
    .eq("step_id", args.stepId);

  if (error || !variants || variants.length === 0) {
    // fallback: no variants defined, let caller use base step template
    return null;
  }

  // Normalize weights; if no weights, default all to 100
  const normalized = variants.map((v) => ({
    ...v,
    weight: v.weight && v.weight > 0 ? v.weight : 100,
  }));
  const totalWeight = normalized.reduce((sum, v) => sum + v.weight, 0);
  const r = Math.random() * totalWeight;

  let acc = 0;
  let chosen = normalized[0];
  for (const v of normalized) {
    acc += v.weight;
    if (r <= acc) {
      chosen = v;
      break;
    }
  }
  return chosen.id as string;
}







