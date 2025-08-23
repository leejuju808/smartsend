import { supabaseAdmin } from "@/server/supabase";

export async function setOnboardingStep(userId: string, step: string, done = true) {
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .update({ 
      onboarding: supabaseAdmin.sql`jsonb_set(
        COALESCE(onboarding, '{}'::jsonb), 
        '{${step}}', 
        ${done}::jsonb
      )`
    })
    .eq("id", userId)
    .select("onboarding")
    .single();

  if (error) {
    console.error("Error updating onboarding step:", error);
    throw error;
  }

  return data?.onboarding;
}

export async function getOnboardingSteps(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("onboarding")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    console.error("Error getting onboarding steps:", error);
    return {};
  }

  return data?.onboarding || {};
} 