/**
 * Block 8600 - SmartSend Template Engine v1 (Deno Edge Function version)
 * Renders templates with merge fields: {{first_name}}, {{custom.field}}, {{campaign.signature}}
 * Block 12400 - Added enrichment variables: {{roof_type_guess}}, {{property_type_guess}}, {{storm_region}}, {{county}}
 * Block 13100 - Local personalization tokens ({{local_intro}}, {{local_weather}}, etc.) are supported but will be empty
 *               unless pre-populated. For full local personalization, use renderTemplateWithLocalPersonalization
 *               from the main application or call the /api/local-personalization endpoint.
 */

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


