import { createClient } from "@/lib/supabase/server";
import { pickToneSegment, type Tone } from "@/lib/tone/policySegment";
import { resolveTone } from "@/lib/tone";
import { selectToneWithLearning } from "./selectToneWithLearning";

export async function selectToneForContact(opts: {
  campaignId: string;
  stepNumber: number;
  contactId: string;
}): Promise<Tone> {
  const sb = createClient();

  // 1) Contact's last-known tone / rule / campaign defaults (Day-18)
  const [
    { data: clt },
    { data: rule },
    { data: camp },
    { data: contact },
  ] = await Promise.all([
    sb
      .from("contact_last_tone")
      .select("last_tone")
      .eq("campaign_id", opts.campaignId)
      .eq("contact_id", opts.contactId)
      .maybeSingle(),
    sb
      .from("followup_rules")
      .select("preferred_tone")
      .eq("campaign_id", opts.campaignId)
      .maybeSingle(),
    sb
      .from("campaigns")
      .select("preferred_tone")
      .eq("id", opts.campaignId)
      .maybeSingle(),
    sb
      .from("contacts")
      .select("segment")
      .eq("id", opts.contactId)
      .maybeSingle(),
  ]);

  const personalized = resolveTone({
    lastTone: (clt?.last_tone as any) || null,
    rulePreferred: (rule?.preferred_tone as any) || null,
    campaignPreferred: (camp?.preferred_tone as any) || null,
  });

  // If we already have a personal tone, use it.
  if (clt?.last_tone) return personalized as Tone;

  // 2) Segment learning
  const segment = contact?.segment ?? null;
  if (segment) {
    // Check for segment tone overrides
    const { data: overrides } = await sb
      .from("segment_tone_overrides")
      .select("tone, allowed")
      .eq("campaign_id", opts.campaignId)
      .eq("segment", segment);

    const disabledTones = new Set(
      (overrides || [])
        .filter((o) => !o.allowed)
        .map((o) => o.tone as string)
    );

    // Check campaign-level tone toggles
    if (!camp?.tone_enable_humorous) disabledTones.add("humorous");
    if (!camp?.tone_enable_assertive) disabledTones.add("assertive");

    const { data: perfData } = await sb
      .from("tone_perf_by_segment_30d")
      .select("tone, sends, open_rate, positive_share, meeting_share")
      .eq("campaign_id", opts.campaignId)
      .eq("step_number", opts.stepNumber)
      .eq("segment", segment);

    if (perfData && perfData.length) {
      // Filter out disabled tones
      const filteredPerf = perfData
        .filter((d) => !disabledTones.has(d.tone as string))
        .map((d) => ({
          tone: d.tone as Tone,
          sends: Number(d.sends ?? 0),
          open_rate: Number(d.open_rate ?? 0),
          positive_share: Number(d.positive_share ?? 0),
          meeting_share: Number(d.meeting_share ?? 0),
        }));

      // Resolve policy pack for config
      let policyPack = null;
      try {
        const { resolvePromptPack } = await import("@/lib/prompts/resolve");
        policyPack = await resolvePromptPack({
          campaignId: opts.campaignId,
          stepNumber: opts.stepNumber,
          kind: "policy",
        });
      } catch (error) {
        console.error("Failed to resolve policy prompt pack:", error);
      }

      const epsilon = policyPack?.config?.epsilon ?? 0.12;
      const minSamples = policyPack?.config?.minSamples ?? 12;

      if (filteredPerf.length > 0) {
        return pickToneSegment(filteredPerf, {
          epsilon,
          minSamples,
          disabledTones: disabledTones,
        });
      }
    }
  }

  // 3) Fallback to global Day-19 learner
  return await selectToneWithLearning(opts.campaignId, opts.stepNumber);
}

