"use server";

import { createClient } from "@/lib/supabase/server";

export async function updateSequenceStep(
  stepId: string,
  fields: {
    subject?: string;
    body?: string;
    delay_days?: number;
    position?: number;
    ab_test_enabled?: boolean;
    subject_variant_a?: string;
    subject_variant_b?: string;
    ab_test_winner?: string | null;
  }
) {
  const supabase = createClient();

  const updates: any = { ...fields };

  // When A/B testing is enabled, ensure variants are set
  if (fields.ab_test_enabled === true) {
    // If variants are empty, copy from subject
    if (!fields.subject_variant_a && !fields.subject_variant_b) {
      // Fetch current step to get subject
      const { data: currentStep } = await supabase
        .from("smartsend_sequence_steps")
        .select("subject")
        .eq("id", stepId)
        .single();
      
      if (currentStep?.subject) {
        if (!updates.subject_variant_a) updates.subject_variant_a = currentStep.subject;
        if (!updates.subject_variant_b) updates.subject_variant_b = currentStep.subject;
      }
    }
  } else if (fields.ab_test_enabled === false) {
    // When disabling, clear winner
    updates.ab_test_winner = null;
  }

  const { data, error } = await supabase
    .from("smartsend_sequence_steps")
    .update(updates)
    .eq("id", stepId)
    .select()
    .single();

  if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true, data };
}








