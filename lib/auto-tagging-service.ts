/**
 * Block 13500 — Auto-Tagging Service
 * Service layer for applying auto-tags to contacts
 * Can be called from various places: imports, replies, enrichment, etc.
 */

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

export interface AutoTaggingOptions {
  contactId: string;
  workspaceId: string;
  replyText?: string;
  hasEstimate?: boolean;
  listName?: string;
  stormZip?: string;
  stormType?: 'hail' | 'wind' | 'rain' | 'freeze';
}

/**
 * Apply all auto-tags to a contact
 */
export async function applyAutoTagsToContact(
  contactId: string,
  workspaceId: string
): Promise<void> {
  try {
    const { error } = await supabase.rpc("apply_auto_tags", {
      p_contact_id: contactId,
      p_workspace_id: workspaceId,
    });

    if (error) {
      console.error("Error applying auto-tags:", error);
      throw error;
    }
  } catch (error) {
    console.error("Failed to apply auto-tags:", error);
    throw error;
  }
}

/**
 * Apply tags based on reply content
 */
export async function applyReplyTags(
  contactId: string,
  workspaceId: string,
  replyText: string
): Promise<void> {
  try {
    const { error } = await supabase.rpc("apply_reply_tags", {
      p_contact_id: contactId,
      p_workspace_id: workspaceId,
      p_reply_text: replyText,
    });

    if (error) {
      console.error("Error applying reply tags:", error);
      throw error;
    }

    // Also check for high-value tag after reply
    await applyHighValueTag(contactId, workspaceId);
  } catch (error) {
    console.error("Failed to apply reply tags:", error);
    throw error;
  }
}

/**
 * Apply storm tags to contacts in affected zip codes
 */
export async function applyStormTags(
  zipCode: string,
  stormType: 'hail' | 'wind' | 'rain' | 'freeze'
): Promise<void> {
  try {
    const { error } = await supabase.rpc("apply_storm_tags", {
      p_zip_code: zipCode,
      p_storm_type: stormType,
    });

    if (error) {
      console.error("Error applying storm tags:", error);
      throw error;
    }
  } catch (error) {
    console.error("Failed to apply storm tags:", error);
    throw error;
  }
}

/**
 * Apply old quote tags from import
 */
export async function applyOldQuoteTags(
  contactId: string,
  workspaceId: string,
  options: {
    hasEstimate?: boolean;
    listName?: string;
  } = {}
): Promise<void> {
  try {
    const { error } = await supabase.rpc("apply_old_quote_tags", {
      p_contact_id: contactId,
      p_workspace_id: workspaceId,
      p_has_estimate: options.hasEstimate || false,
      p_list_name: options.listName || null,
    });

    if (error) {
      console.error("Error applying old quote tags:", error);
      throw error;
    }
  } catch (error) {
    console.error("Failed to apply old quote tags:", error);
    throw error;
  }
}

/**
 * Apply high-value lead tag
 */
export async function applyHighValueTag(
  contactId: string,
  workspaceId: string
): Promise<void> {
  try {
    const { error } = await supabase.rpc("apply_high_value_tag", {
      p_contact_id: contactId,
      p_workspace_id: workspaceId,
    });

    if (error) {
      console.error("Error applying high-value tag:", error);
      throw error;
    }
  } catch (error) {
    console.error("Failed to apply high-value tag:", error);
    throw error;
  }
}

/**
 * Apply low-quality tag
 */
export async function applyLowQualityTag(
  contactId: string,
  workspaceId: string
): Promise<void> {
  try {
    const { error } = await supabase.rpc("apply_low_quality_tag", {
      p_contact_id: contactId,
      p_workspace_id: workspaceId,
    });

    if (error) {
      console.error("Error applying low-quality tag:", error);
      throw error;
    }
  } catch (error) {
    console.error("Failed to apply low-quality tag:", error);
    throw error;
  }
}

/**
 * Comprehensive auto-tagging function that applies all relevant tags
 */
export async function applyComprehensiveAutoTags(
  options: AutoTaggingOptions
): Promise<void> {
  const { contactId, workspaceId, replyText, hasEstimate, listName, stormZip, stormType } = options;

  try {
    // 1. Apply base auto-tags (location, enrichment, status)
    await applyAutoTagsToContact(contactId, workspaceId);

    // 2. Apply reply-based tags if reply text provided
    if (replyText) {
      await applyReplyTags(contactId, workspaceId, replyText);
    }

    // 3. Apply old quote tags if applicable
    if (hasEstimate || listName) {
      await applyOldQuoteTags(contactId, workspaceId, {
        hasEstimate,
        listName,
      });
    }

    // 4. Apply storm tags if storm data provided
    if (stormZip && stormType) {
      await applyStormTags(stormZip, stormType);
    }

    // 5. Apply low-quality check
    await applyLowQualityTag(contactId, workspaceId);

    // 6. Apply high-value check
    await applyHighValueTag(contactId, workspaceId);
  } catch (error) {
    console.error("Failed to apply comprehensive auto-tags:", error);
    throw error;
  }
}

/**
 * Get all tags for a contact (for UI display)
 */
export async function getContactTags(
  contactId: string,
  workspaceId: string
): Promise<Array<{ tag: string; type: string; created_at: string }>> {
  try {
    const { data, error } = await supabase.rpc("get_contact_tags", {
      p_contact_id: contactId,
      p_workspace_id: workspaceId,
    });

    if (error) {
      console.error("Error fetching contact tags:", error);
      throw error;
    }

    return data || [];
  } catch (error) {
    console.error("Failed to get contact tags:", error);
    throw error;
  }
}





















































