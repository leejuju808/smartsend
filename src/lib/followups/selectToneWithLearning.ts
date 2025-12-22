import { createClient } from "@/lib/supabase/server";
import { pickTone } from "@/lib/tone/policy";
import type { Tone } from "@/lib/tone/policySegment";
import { resolvePromptPack } from "@/lib/prompts/resolve";

/**
 * Fallback to global tone learning (Day-19 learner)
 * Uses tone_performance_30d view for campaign-wide tone selection
 * Uses policy prompt pack config for epsilon/minSamples if available
 */
export async function selectToneWithLearning(
  campaignId: string,
  stepNumber: number
): Promise<Tone> {
  const sb = createClient();

  // Resolve policy prompt pack to get config (epsilon, minSamples, objectiveWeights)
  let policyPack = null;
  try {
    policyPack = await resolvePromptPack({
      campaignId,
      stepNumber,
      kind: "policy",
    });
  } catch (error) {
    console.error("Failed to resolve policy prompt pack:", error);
  }

  // Extract config values with defaults
  const epsilon = policyPack?.config?.epsilon ?? 0.15;
  const minSamplesPerTone = policyPack?.config?.minSamples ?? policyPack?.config?.minSamplesPerTone ?? 20;

  const { data } = await sb
    .from("tone_performance_30d")
    .select("tone, sends, open_rate, positive_share, meeting_share")
    .eq("campaign_id", campaignId)
    .eq("step_number", stepNumber);

  if (data && data.length) {
    return pickTone(
      data.map((d) => ({
        tone: d.tone as Tone,
        sends: Number(d.sends ?? 0),
        open_rate: Number(d.open_rate ?? 0),
        positive_share: Number(d.positive_share ?? 0),
        meeting_share: Number(d.meeting_share ?? 0),
      })),
      { epsilon, minSamplesPerTone }
    );
  }

  return "formal"; // default fallback
}

