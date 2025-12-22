import { createClient } from "@/lib/supabase/server";
import { assignArm } from "./hashBucket";

export async function getOrCreateAssignment(opts: {
  campaignId: string;
  contactId: string;
  stepNumber: number;
}): Promise<{ experimentId: string; arm: "control" | "treatment" } | null> {
  const sb = createClient();

  const { data: exp } = await sb
    .from("tone_experiments")
    .select("id, ramp_percent, status, scope")
    .eq("campaign_id", opts.campaignId)
    .eq("step_number", opts.stepNumber)
    .eq("status", "running")
    .maybeSingle();

  if (!exp) return null;

  // fetch existing
  const { data: existing } = await sb
    .from("tone_experiment_assignments")
    .select("id, arm")
    .eq("experiment_id", exp.id)
    .eq("contact_id", opts.contactId)
    .eq("step_number", opts.stepNumber)
    .maybeSingle();

  if (existing) return { experimentId: exp.id, arm: existing.arm as "control" | "treatment" };

  const arm = assignArm({
    campaignId: opts.campaignId,
    contactId: opts.contactId,
    stepNumber: opts.stepNumber,
    rampPercent: exp.ramp_percent,
  });

  const { data: contact } = await sb
    .from("contacts")
    .select("segment")
    .eq("id", opts.contactId)
    .maybeSingle();

  await sb.from("tone_experiment_assignments").insert({
    experiment_id: exp.id,
    campaign_id: opts.campaignId,
    contact_id: opts.contactId,
    step_number: opts.stepNumber,
    arm,
    segment: contact?.segment ?? null,
  });

  return { experimentId: exp.id, arm };
}















