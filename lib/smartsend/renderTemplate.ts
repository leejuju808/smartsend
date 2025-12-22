/**
 * Block 8600 - SmartSend Template Engine v1
 * Renders templates with merge fields: {{first_name}}, {{custom.field}}, {{campaign.signature}}
 * Block 12400 - Added enrichment variables: {{roof_type_guess}}, {{property_type_guess}}, {{storm_region}}, {{county}}
 * Block 13100 - Added local personalization tokens: {{local_intro}}, {{local_weather}}, {{local_context}}, etc.
 */

import { generateLocalPersonalizationTokens, LocalPersonalizationContext } from '../ai/local-personalization-engine';

export function renderTemplate(
  template: string,
  lead: any,
  campaign: any
): string {
  if (!template) return "";

  const values: Record<string, any> = {
    first_name: lead?.first_name || "",
    last_name: lead?.last_name || "",
    company: lead?.company || "",
    email: lead?.email || "",
    city: lead?.city || "",
    state: lead?.state || "",
    zip: lead?.zip || lead?.zip_code || "",
    // Enrichment variables (Block 12400)
    roof_type_guess: lead?.roof_type_guess || "",
    property_type_guess: lead?.property_type_guess || "",
    storm_region: lead?.storm_risk_level || "",
    county: lead?.county || "",
    homeowner_likelihood: lead?.homeowner_likelihood || "",
    custom: lead?.custom_fields || {},
    campaign: campaign?.template_variables || {},
  };

  let output = template;

  // Replace basic fields: {{first_name}}, {{last_name}}, etc.
  Object.entries(values).forEach(([key, value]) => {
    if (key === "custom" || key === "campaign") {
      // Skip custom and campaign - handled separately
      return;
    }
    if (typeof value === "string") {
      const regex = new RegExp(`\\{\\{${key}\\}\\}`, "g");
      output = output.replace(regex, value);
    }
  });

  // Replace custom fields: {{custom.industry}}
  if (values.custom && typeof values.custom === "object") {
    Object.entries(values.custom).forEach(([key, value]) => {
      if (typeof value === "string") {
        const regex = new RegExp(`\\{\\{custom\\.${key}\\}\\}`, "g");
        output = output.replace(regex, value);
      }
    });
  }

  // Replace campaign-level vars: {{campaign.signature}}
  if (values.campaign && typeof values.campaign === "object") {
    Object.entries(values.campaign).forEach(([key, value]) => {
      if (typeof value === "string") {
        const regex = new RegExp(`\\{\\{campaign\\.${key}\\}\\}`, "g");
        output = output.replace(regex, value);
      }
    });
  }

  return output;
}

/**
 * Async version that includes local personalization tokens (Block 13100)
 * Use this when you need weather/storm/neighborhood personalization
 */
export async function renderTemplateWithLocalPersonalization(
  template: string,
  lead: any,
  campaign: any
): Promise<string> {
  if (!template) return "";

  // First, render basic template
  let output = renderTemplate(template, lead, campaign);

  // Check if template uses local personalization tokens
  const hasLocalTokens = /{{(local_intro|local_weather|local_context|weather_trigger|seasonal_hint|storm_alert|neighborhood)}}/i.test(output);
  
  if (!hasLocalTokens) {
    return output;
  }

  // Generate local personalization tokens
  try {
    const localContext: LocalPersonalizationContext = {
      city: lead?.city || null,
      state: lead?.state || null,
      zip: lead?.zip || lead?.zip_code || null,
      neighborhood: lead?.neighborhood || lead?.tags?.find((t: string) => t.startsWith('neighborhood:'))?.replace('neighborhood:', '') || null,
      property_type: lead?.property_type_guess || null,
    };

    const localTokens = await generateLocalPersonalizationTokens(localContext);

    // Replace local personalization tokens
    const localTokenMap: Record<string, string> = {
      local_intro: localTokens.local_intro,
      local_weather: localTokens.local_weather,
      local_context: localTokens.local_context,
      weather_trigger: localTokens.weather_trigger,
      seasonal_hint: localTokens.seasonal_hint,
      storm_alert: localTokens.storm_alert,
      neighborhood: localTokens.neighborhood,
    };

    Object.entries(localTokenMap).forEach(([key, value]) => {
      const regex = new RegExp(`\\{\\{${key}\\}\\}`, "gi");
      output = output.replace(regex, value || "");
    });
  } catch (error) {
    console.error('Error generating local personalization tokens:', error);
    // Continue with basic template if local personalization fails
  }

  return output;
}


