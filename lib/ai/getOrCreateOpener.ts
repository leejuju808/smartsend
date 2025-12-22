// lib/ai/getOrCreateOpener.ts
// Block 15400: AI Personalization Engine v1
// Helper to get cached opener or generate new one

import { generateRoofingOpener } from "./generateRoofingOpener";
import type { SupabaseClient } from "@supabase/supabase-js";

type GetOrCreateOpenerParams = {
  workspaceId: string;
  contactId: string;
  campaignId: string;
  stepId: string;
};

/**
 * Gets a cached opener or generates a new one if not found
 * Returns null if generation fails or plan limits are exceeded
 */
export async function getOrCreateOpener(
  supabase: SupabaseClient,
  params: GetOrCreateOpenerParams
): Promise<string | null> {
  const { workspaceId, contactId, campaignId, stepId } = params;

  // 1) Try cache first
  const { data: existing } = await supabase
    .from("email_personalizations")
    .select("opener")
    .eq("workspace_id", workspaceId)
    .eq("contact_id", contactId)
    .eq("campaign_id", campaignId)
    .eq("step_id", stepId)
    .maybeSingle();

  if (existing?.opener) {
    return existing.opener;
  }

  // 2) Check plan limits before generating
  // Import dynamically to avoid circular dependencies
  const { canUseAIPersonalization } = await import("@/lib/planUsage");
  const limitCheck = await canUseAIPersonalization(workspaceId);

  if (!limitCheck.allowed) {
    console.log("AI personalization not allowed:", limitCheck.reason);
    return null;
  }

  // 3) Load context for generation
  const [
    { data: wp },
    { data: contact },
    { data: campaign },
    { data: step },
  ] = await Promise.all([
    supabase
      .from("workspace_profile")
      .select("company_name, primary_city, service_areas, years_in_business, core_services, brand_tone")
      .eq("workspace_id", workspaceId)
      .maybeSingle(),
    supabase
      .from("contacts")
      .select("id, first_name, last_name, city, lead_source, source_meta")
      .eq("id", contactId)
      .single(),
    supabase
      .from("campaigns")
      .select("id, name, template_key")
      .eq("id", campaignId)
      .single(),
    supabase
      .from("campaign_steps")
      .select("id, subject_template")
      .eq("id", stepId)
      .single(),
  ]);

  if (!wp || !contact || !campaign || !step) {
    console.error("Missing context for opener generation", { wp: !!wp, contact: !!contact, campaign: !!campaign, step: !!step });
    return null;
  }

  // 4) Generate opener
  let opener: string;
  try {
    opener = await generateRoofingOpener({
      workspaceProfile: {
        company_name: wp.company_name,
        primary_city: wp.primary_city,
        service_areas: wp.service_areas,
        years_in_business: wp.years_in_business,
        core_services: wp.core_services,
        brand_tone: wp.brand_tone as any,
      },
      contact: {
        first_name: contact.first_name,
        last_name: contact.last_name,
        city: contact.city,
        lead_source: contact.lead_source,
        source_meta: contact.source_meta,
      },
      campaign: {
        name: campaign.name,
        template_key: campaign.template_key,
      },
      step: {
        subject: step.subject_template,
      },
    });
  } catch (error: any) {
    console.error("Failed to generate opener:", error);
    return null;
  }

  // 5) Save to cache
  const { error: insertError } = await supabase
    .from("email_personalizations")
    .insert({
      workspace_id: workspaceId,
      contact_id: contact.id,
      campaign_id: campaign.id,
      step_id: step.id,
      opener,
    });

  if (insertError) {
    console.error("Failed to cache opener:", insertError);
    // Still return the opener even if caching fails
  }

  // 6) Increment usage counter
  await supabase.rpc("increment_ai_personalization_usage", {
    p_workspace_id: workspaceId,
    p_increment: 1,
  }).catch((err) => {
    console.error("Failed to increment AI personalization usage:", err);
    // Don't block on usage tracking failure
  });

  // 7) Log to contact timeline (Block 16000)
  try {
    const { logAIOpenerGenerated } = await import("@/lib/contactActivityV3");
    await logAIOpenerGenerated(supabase, {
      contactId: contact.id,
      workspaceId,
      openerText: opener,
      stepId: step.id,
    }).catch((err) => {
      console.error("Failed to log AI opener to contact timeline:", err);
      // Don't block on logging failure
    });
  } catch (err) {
    // Logging is optional, don't fail if module doesn't exist
    console.debug("Contact timeline logging not available:", err);
  }

  return opener;
}

