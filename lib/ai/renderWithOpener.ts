// lib/ai/renderWithOpener.ts
// Block 15400: AI Personalization Engine v1
// Helper to render template with AI-generated opener

import { renderTemplateString } from "@/lib/renderTemplate";
import { getOrCreateOpener } from "./getOrCreateOpener";
import type { SupabaseClient } from "@supabase/supabase-js";

type RenderWithOpenerParams = {
  template: string;
  workspaceId: string;
  contactId: string;
  campaignId: string;
  stepId: string | null;
  contact: {
    first_name?: string | null;
    last_name?: string | null;
    city?: string | null;
  };
  workspaceProfile: {
    company_name?: string | null;
    primary_city?: string | null;
  };
  aiPersonalizationEnabled: boolean;
};

/**
 * Renders a template string, injecting AI-generated opener if enabled
 * Returns the rendered template with {{opener}} replaced
 */
export async function renderWithOpener(
  supabase: SupabaseClient,
  params: RenderWithOpenerParams
): Promise<string> {
  const {
    template,
    workspaceId,
    contactId,
    campaignId,
    stepId,
    contact,
    workspaceProfile,
    aiPersonalizationEnabled,
  } = params;

  let opener: string | null = null;

  // Only generate opener if AI personalization is enabled and stepId is provided
  if (aiPersonalizationEnabled && stepId) {
    try {
      opener = await getOrCreateOpener(supabase, {
        workspaceId,
        contactId,
        campaignId,
        stepId,
      });
    } catch (error: any) {
      console.error("Failed to generate opener:", error);
      // Continue with fallback opener
    }
  }

  // Render template with opener
  return renderTemplateString(template, {
    contact,
    workspaceProfile,
    opener,
  });
}



























































