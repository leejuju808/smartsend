/**
 * Campaign Key Authentication
 * Verifies campaign API key from X-Campaign-ID and X-Campaign-Key headers
 * 
 * This is a simple implementation that checks if the campaign exists.
 * In production, you'd want to store campaign keys in a separate table with hashing.
 * 
 * The RPC functions (claim_due_queue, complete_queue_item, etc.) will enforce
 * permissions via can_edit_campaign when called from non-service-role contexts.
 * When called from service role (API key path), the API layer should verify
 * the campaign key before calling the RPCs.
 */

import { createClient } from "@supabase/supabase-js";

export async function assertCampaignKey(
  req: Request,
  requiredScope?: string
): Promise<string> {
  const campaignId = req.headers.get("X-Campaign-ID");
  const campaignKey = req.headers.get("X-Campaign-Key");

  if (!campaignId || !campaignKey) {
    throw new Error("Missing X-Campaign-ID or X-Campaign-Key headers");
  }

  // Create admin client to verify campaign key
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Check if campaign exists
  const { data: campaign, error } = await admin
    .from("campaigns")
    .select("id")
    .eq("id", campaignId)
    .maybeSingle();

  if (error || !campaign) {
    throw new Error("Campaign not found or invalid");
  }

  // TODO: In production, verify campaignKey against a campaign_keys table
  // For MVP, we just verify the campaign exists. The RPC functions will
  // enforce permissions. In a production system, you'd want:
  // 1. A campaign_keys table with hashed keys
  // 2. Verification that the key matches and has the required scope
  // 3. Rate limiting per key
  
  // For now, we accept any non-empty key if the campaign exists
  // This allows the system to work while you implement proper key management
  if (!campaignKey || campaignKey.trim().length === 0) {
    throw new Error("Invalid campaign key");
  }

  return campaignId;
}

