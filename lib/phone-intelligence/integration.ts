// Block 17900 — Phone Intelligence Integration
// Helper functions to integrate phone intelligence into contact flows

import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { getPhoneIntelligence } from "./index";

/**
 * Enrich contact with phone intelligence after creation/update
 * This should be called whenever a contact's phone number is set or updated
 */
export async function enrichContactPhone(
  supabase: ReturnType<typeof createClient<Database>>,
  contactId: string,
  phoneNumber: string | null,
  orgId: string
): Promise<void> {
  if (!phoneNumber) {
    // Clear phone intelligence if phone is removed
    await supabase
      .from("contacts")
      .update({
        phone_valid: null,
        phone_line_type: null,
        phone_carrier: null,
        phone_sms_readiness: null,
        phone_quality_score: null,
        phone_intelligence_id: null,
      })
      .eq("id", contactId);
    return;
  }

  try {
    // Get phone intelligence
    const intelligence = await getPhoneIntelligence(
      supabase,
      phoneNumber,
      orgId,
      contactId
    );

    // Intelligence is already saved and contact is updated in getPhoneIntelligence
    // This function is mainly for explicit integration points
  } catch (error: any) {
    console.error(`Error enriching phone for contact ${contactId}:`, error);
    // Don't throw - phone enrichment failure shouldn't break contact creation
  }
}

/**
 * Batch enrich multiple contacts with phone intelligence
 * Useful for imports and bulk operations
 */
export async function batchEnrichContactPhones(
  supabase: ReturnType<typeof createClient<Database>>,
  contacts: Array<{ id: string; phone: string | null; org_id: string }>,
  options: {
    batchSize?: number;
    onProgress?: (processed: number, total: number) => void;
  } = {}
): Promise<void> {
  const { batchSize = 10, onProgress } = options;

  for (let i = 0; i < contacts.length; i += batchSize) {
    const batch = contacts.slice(i, i + batchSize);

    await Promise.allSettled(
      batch.map(async (contact) => {
        if (contact.phone) {
          await enrichContactPhone(
            supabase,
            contact.id,
            contact.phone,
            contact.org_id
          );
        }
      })
    );

    if (onProgress) {
      onProgress(Math.min(i + batchSize, contacts.length), contacts.length);
    }
  }
}

/**
 * Trigger phone intelligence update for a contact
 * Can be called from webhooks, API endpoints, or background jobs
 */
export async function triggerPhoneIntelligenceUpdate(
  supabase: ReturnType<typeof createClient<Database>>,
  contactId: string
): Promise<void> {
  // Get contact
  const { data: contact, error: contactError } = await supabase
    .from("contacts")
    .select("id, phone, org_id")
    .eq("id", contactId)
    .maybeSingle();

  if (contactError || !contact) {
    console.error("Contact not found:", contactError);
    return;
  }

  // Get org_id from contact or from org_members
  let orgId = contact.org_id;

  if (!orgId) {
    // Try to get org_id from user's organization
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: orgMember } = await supabase
        .from("org_members")
        .select("org_id")
        .eq("user_id", user.id)
        .maybeSingle();
      orgId = orgMember?.org_id;
    }
  }

  if (!orgId) {
    console.error("Organization ID not found for contact");
    return;
  }

  if (contact.phone) {
    await enrichContactPhone(supabase, contactId, contact.phone, orgId);
  }
}





















































