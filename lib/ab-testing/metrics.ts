/**
 * A/B Testing Metrics Tracker
 * Updates metrics when emails are sent, opened, replied, etc.
 */

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

/**
 * Track when an email is sent
 */
export async function trackABSend(variantId: string) {
  try {
    await supabaseAdmin.rpc("increment_ab_metric", {
      p_variant_id: variantId,
      p_metric_type: "send",
      p_increment: 1,
    });
  } catch (error) {
    console.error("Failed to track A/B send:", error);
  }
}

/**
 * Track when an email is opened
 */
export async function trackABOpen(variantId: string) {
  try {
    await supabaseAdmin.rpc("increment_ab_metric", {
      p_variant_id: variantId,
      p_metric_type: "open",
      p_increment: 1,
    });
  } catch (error) {
    console.error("Failed to track A/B open:", error);
  }
}

/**
 * Track when an email receives a reply
 */
export async function trackABReply(variantId: string) {
  try {
    await supabaseAdmin.rpc("increment_ab_metric", {
      p_variant_id: variantId,
      p_metric_type: "reply",
      p_increment: 1,
    });
  } catch (error) {
    console.error("Failed to track A/B reply:", error);
  }
}

/**
 * Track when an estimate is booked
 */
export async function trackABBookedEstimate(variantId: string) {
  try {
    await supabaseAdmin.rpc("increment_ab_metric", {
      p_variant_id: variantId,
      p_metric_type: "booked_estimate",
      p_increment: 1,
    });
  } catch (error) {
    console.error("Failed to track A/B booked estimate:", error);
  }
}

/**
 * Track when a job is closed
 */
export async function trackABClosedJob(variantId: string) {
  try {
    await supabaseAdmin.rpc("increment_ab_metric", {
      p_variant_id: variantId,
      p_metric_type: "closed_job",
      p_increment: 1,
    });
  } catch (error) {
    console.error("Failed to track A/B closed job:", error);
  }
}

/**
 * Get variant ID for a lead in a campaign
 */
export async function getVariantForLead(
  campaignId: string,
  leadId: string
): Promise<string | null> {
  try {
    const { data, error } = await supabaseAdmin
      .from("ab_variant_assignments")
      .select("variant_id")
      .eq("campaign_id", campaignId)
      .eq("lead_id", leadId)
      .single();

    if (error || !data) {
      return null;
    }

    return data.variant_id;
  } catch (error) {
    console.error("Failed to get variant for lead:", error);
    return null;
  }
}

/**
 * Assign variant to lead (if not already assigned)
 */
export async function assignVariantToLead(
  campaignId: string,
  leadId: string,
  zipCode?: string
): Promise<string | null> {
  try {
    // Check if already assigned
    const existing = await getVariantForLead(campaignId, leadId);
    if (existing) {
      return existing;
    }

    // Use database function to assign
    const { data, error } = await supabaseAdmin.rpc("assign_ab_variant", {
      p_campaign_id: campaignId,
      p_lead_id: leadId,
      p_zip_code: zipCode || null,
    });

    if (error) {
      console.error("Failed to assign variant:", error);
      return null;
    }

    return data;
  } catch (error) {
    console.error("Failed to assign variant to lead:", error);
    return null;
  }
}



























