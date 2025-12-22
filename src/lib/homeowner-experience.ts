// Block 21989 — SmartSend Roofing Homeowner Experience Score Helper
// Helper functions to update homeowner experience score from various signals

/**
 * Experience Signal Types
 * These map to the positive/negative signals defined in Block 21989
 */
export type ExperienceSignalType =
  // Positive signals
  | "positive_tone"
  | "tone_shift_neutral_to_positive"
  | "quick_estimator_reply"
  | "quick_homeowner_reply"
  | "detailed_questions"
  | "trust_gratitude"
  | "proactive_photos_videos"
  | "scheduling_questions"
  | "interested_expression"
  | "smart_send_rescue_followup"
  // Negative signals
  | "angry_tone"
  | "confused_tone"
  | "tone_shift_negative_to_worse"
  | "homeowner_stopped_responding"
  | "mentions_cheaper_competitor"
  | "proposal_delay_over_24h"
  | "estimator_missed_followup"
  | "expresses_distrust"
  | "mentions_frustration"
  | "cancels_meeting"
  | "smart_send_override_needed";

/**
 * Signal value mappings
 * These match the weights defined in Block 21989
 */
const SIGNAL_VALUES: Record<ExperienceSignalType, number> = {
  // Positive signals
  positive_tone: +20,
  tone_shift_neutral_to_positive: +15,
  quick_estimator_reply: +10,
  quick_homeowner_reply: +10,
  detailed_questions: +10,
  trust_gratitude: +20,
  proactive_photos_videos: +15,
  scheduling_questions: +20,
  interested_expression: +25,
  smart_send_rescue_followup: +5,
  // Negative signals
  angry_tone: -40,
  confused_tone: -20,
  tone_shift_negative_to_worse: -25,
  homeowner_stopped_responding: -20,
  mentions_cheaper_competitor: -20,
  proposal_delay_over_24h: -30,
  estimator_missed_followup: -25,
  expresses_distrust: -30,
  mentions_frustration: -35,
  cancels_meeting: -40,
  smart_send_override_needed: -10,
};

export interface ExperienceSignal {
  type: ExperienceSignalType;
  value: number;
  description?: string;
}

/**
 * Update homeowner experience score by calling the edge function
 * This is a fire-and-forget operation that won't block the main request
 */
export async function updateHomeownerExperience(
  leadId: string,
  signals: ExperienceSignal[]
): Promise<void> {
  if (!leadId || !signals || signals.length === 0) {
    return;
  }

  // Fire and forget - don't block the main request
  (async () => {
    try {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      if (!supabaseUrl) {
        console.error("Missing NEXT_PUBLIC_SUPABASE_URL");
        return;
      }

      const response = await fetch(
        `${supabaseUrl}/functions/v1/update-homeowner-experience`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
          },
          body: JSON.stringify({
            lead_id: leadId,
            signals: signals.map((s) => ({
              type: s.type,
              value: s.value,
              description: s.description,
            })),
          }),
        }
      );

      if (!response.ok) {
        const error = await response.text();
        console.error(
          "Failed to update homeowner experience score:",
          error
        );
      }
    } catch (err) {
      console.error("Error updating homeowner experience score:", err);
    }
  })();
}

/**
 * Helper to create a signal from a signal type
 */
export function createSignal(
  type: ExperienceSignalType,
  description?: string
): ExperienceSignal {
  return {
    type,
    value: SIGNAL_VALUES[type],
    description,
  };
}

/**
 * Convenience functions for common signal types
 */
export const HomeownerExperienceSignals = {
  // Positive signals
  positiveTone: (description?: string) =>
    createSignal("positive_tone", description),
  toneShiftNeutralToPositive: (description?: string) =>
    createSignal("tone_shift_neutral_to_positive", description),
  quickEstimatorReply: (description?: string) =>
    createSignal("quick_estimator_reply", description),
  quickHomeownerReply: (description?: string) =>
    createSignal("quick_homeowner_reply", description),
  detailedQuestions: (description?: string) =>
    createSignal("detailed_questions", description),
  trustGratitude: (description?: string) =>
    createSignal("trust_gratitude", description),
  proactivePhotosVideos: (description?: string) =>
    createSignal("proactive_photos_videos", description),
  schedulingQuestions: (description?: string) =>
    createSignal("scheduling_questions", description),
  interestedExpression: (description?: string) =>
    createSignal("interested_expression", description),
  smartSendRescueFollowup: (description?: string) =>
    createSignal("smart_send_rescue_followup", description),

  // Negative signals
  angryTone: (description?: string) =>
    createSignal("angry_tone", description),
  confusedTone: (description?: string) =>
    createSignal("confused_tone", description),
  toneShiftNegativeToWorse: (description?: string) =>
    createSignal("tone_shift_negative_to_worse", description),
  homeownerStoppedResponding: (description?: string) =>
    createSignal("homeowner_stopped_responding", description),
  mentionsCheaperCompetitor: (description?: string) =>
    createSignal("mentions_cheaper_competitor", description),
  proposalDelayOver24h: (description?: string) =>
    createSignal("proposal_delay_over_24h", description),
  estimatorMissedFollowup: (description?: string) =>
    createSignal("estimator_missed_followup", description),
  expressesDistrust: (description?: string) =>
    createSignal("expresses_distrust", description),
  mentionsFrustration: (description?: string) =>
    createSignal("mentions_frustration", description),
  cancelsMeeting: (description?: string) =>
    createSignal("cancels_meeting", description),
  smartSendOverrideNeeded: (description?: string) =>
    createSignal("smart_send_override_needed", description),
};









































