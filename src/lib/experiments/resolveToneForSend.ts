import { getOrCreateAssignment } from "./assignToneExperiment";
import { selectToneForContact } from "@/lib/followups/selectToneForContact"; // Day 22 (segment-aware)
import { resolveTone } from "@/lib/tone"; // Day 18
import type { Tone } from "@/lib/tone";

export async function resolveToneForSend({
  campaignId,
  contactId,
  stepNumber,
}: {
  campaignId: string;
  contactId: string;
  stepNumber: number;
}): Promise<{ tone: Tone; experimentId: string | null; arm: "control" | "treatment" | null }> {
  const assignment = await getOrCreateAssignment({ campaignId, contactId, stepNumber });

  if (!assignment || assignment.arm === "control") {
    // Baseline = deterministic fallback (rule → campaign → default formal)
    return {
      tone: resolveTone({
        lastTone: null,
        rulePreferred: null,
        campaignPreferred: "formal",
      }),
      experimentId: assignment?.experimentId ?? null,
      arm: assignment?.arm ?? null,
    };
  }

  // Treatment = full learner (personal → segment → global learner)
  const tone = await selectToneForContact({ campaignId, contactId, stepNumber });
  return {
    tone,
    experimentId: assignment.experimentId,
    arm: assignment.arm,
  };
}















