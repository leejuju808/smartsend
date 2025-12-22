// Block 15300 — Lead Source Auto-Tagging Helper
// Auto-tags contacts based on campaign template key

import { SupabaseClient } from "@supabase/supabase-js";

/**
 * Auto-tag contacts when they're attached to a campaign based on template key
 */
export async function autoTagContactsFromCampaign(
  supabase: SupabaseClient,
  campaignId: string,
  contactIds: string[]
): Promise<void> {
  if (!contactIds.length) return;

  // Get campaign with template key
  const { data: campaign, error: campError } = await supabase
    .from("campaigns")
    .select("id, template_key")
    .eq("id", campaignId)
    .single();

  if (campError || !campaign || !campaign.template_key) {
    return; // No template key, skip auto-tagging
  }

  const templateKey = campaign.template_key;
  let leadSourceToApply: string | null = null;

  // Map template keys to lead sources
  if (templateKey === "storm_damage") {
    leadSourceToApply = "storm_outreach";
  } else if (templateKey === "annual_inspection") {
    leadSourceToApply = "retail_lead";
  } else if (templateKey === "reactivation") {
    leadSourceToApply = "quote_reactivation";
  }

  if (!leadSourceToApply) {
    return; // No mapping for this template key
  }

  // Get existing contacts to merge source_meta
  const { data: existingContacts } = await supabase
    .from("contacts")
    .select("id, source_meta")
    .in("id", contactIds);

  // Update contacts with lead source and merged metadata
  for (const contact of existingContacts || []) {
    const existingMeta = (contact.source_meta as any) || {};
    await supabase
      .from("contacts")
      .update({
        lead_source: leadSourceToApply,
        source_meta: {
          ...existingMeta,
          campaign_id: campaignId,
          template_key: templateKey,
        },
      })
      .eq("id", contact.id);
  }
}

/**
 * Auto-tag contacts based on list type when added to a list
 */
export async function autoTagContactsFromList(
  supabase: SupabaseClient,
  listId: string,
  contactIds: string[]
): Promise<void> {
  if (!contactIds.length) return;

  // Get list with type
  const { data: list, error: listError } = await supabase
    .from("contact_lists")
    .select("id, list_type, source_tag")
    .eq("id", listId)
    .single();

  if (listError || !list || !list.list_type) {
    return; // No list type, skip auto-tagging
  }

  let leadSourceToApply: string | null = null;
  let sourceMetaUpdate: any = {};

  if (list.list_type === "storm") {
    leadSourceToApply = "storm_outreach";
    sourceMetaUpdate = {
      list_id: listId,
      storm_name: list.source_tag || null,
    };
  } else if (list.list_type === "past_customers") {
    leadSourceToApply = "past_customer";
  } else if (list.list_type === "reactivation") {
    leadSourceToApply = "quote_reactivation";
  }

  if (!leadSourceToApply) {
    return; // No mapping for this list type
  }

  // Get existing contacts to merge source_meta
  const { data: existingContacts } = await supabase
    .from("contacts")
    .select("id, source_meta")
    .in("id", contactIds);

  // Update contacts with lead source and merged metadata
  for (const contact of existingContacts || []) {
    const existingMeta = (contact.source_meta as any) || {};
    await supabase
      .from("contacts")
      .update({
        lead_source: leadSourceToApply,
        source_meta: {
          ...existingMeta,
          ...sourceMetaUpdate,
        },
      })
      .eq("id", contact.id);
  }
}



























































