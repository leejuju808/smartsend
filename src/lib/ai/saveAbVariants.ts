import { getServerSupabase } from "@/lib/supabase/server";

export interface RewriteVariant {
  subject: string;
  body: string;
}

/**
 * Save A/B variants to campaign_templates and template_variants tables
 * Creates a base template if it doesn't exist, then saves variants
 * 
 * @param campaignId - Campaign ID
 * @param variants - Array of variants to save
 * @param userId - User ID (for RLS)
 * @param baseName - Name for the base template (default: "Default")
 * @returns Array of created variant IDs
 */
export async function saveAbVariants(
  campaignId: string,
  variants: RewriteVariant[],
  userId: string,
  baseName: string = "Default"
): Promise<string[]> {
  const supabase = getServerSupabase();

  // Find or create base campaign template
  const { data: existingTemplate, error: findError } = await supabase
    .from("campaign_templates")
    .select("id")
    .eq("campaign_id", campaignId)
    .eq("name", baseName)
    .maybeSingle();

  let templateId: string;

  if (existingTemplate) {
    templateId = existingTemplate.id;
  } else {
    // Create base template using first variant (or empty if no variants)
    const { data: newTemplate, error: createError } = await supabase
      .from("campaign_templates")
      .insert({
        campaign_id: campaignId,
        user_id: userId,
        name: baseName,
        subject: variants[0]?.subject || "",
        body_html: variants[0]?.body || "",
        is_active: true,
      })
      .select("id")
      .single();

    if (createError || !newTemplate) {
      throw new Error(`Failed to create campaign template: ${createError?.message || "Unknown error"}`);
    }

    templateId = newTemplate.id;
  }

  // Delete existing variants for this template
  await supabase
    .from("template_variants")
    .delete()
    .eq("campaign_template_id", templateId);

  // Insert new variants
  const variantRows = variants.map((v, index) => ({
    campaign_template_id: templateId,
    user_id: userId,
    label: `V${index + 1}: AI Generated`,
    subject: v.subject,
    body_html: v.body,
    weight: Math.floor(100 / variants.length), // Equal weights
  }));

  const { data: insertedVariants, error: insertError } = await supabase
    .from("template_variants")
    .insert(variantRows)
    .select("id");

  if (insertError || !insertedVariants) {
    throw new Error(`Failed to save variants: ${insertError?.message || "Unknown error"}`);
  }

  return insertedVariants.map((v) => v.id);
}

