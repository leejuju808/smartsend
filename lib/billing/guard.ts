// lib/billing/guard.ts
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@/lib/supabase/types";
import { getPlanConfig } from "./plans";
import type { SupabaseClient } from "@supabase/supabase-js";

export async function checkCampaignLimit(ownerId: string) {
  const supabase = createClientComponentClient<Database>();

  const { data: sub } = await supabase
    .from("subscriptions")
    .select("plan")
    .eq("owner_id", ownerId)
    .maybeSingle();

  const config = getPlanConfig(sub?.plan as any);

  if (config.maxCampaigns == null) return { allowed: true };

  const { count } = await supabase
    .from("campaigns")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", ownerId);

  if ((count ?? 0) >= config.maxCampaigns) {
    return {
      allowed: false,
      reason: `Your ${config.name} plan allows ${config.maxCampaigns} campaigns. Upgrade to add more.`,
    };
  }

  return { allowed: true };
}

/**
 * Server-side helper to check email sending limits for an owner
 * Use this in API routes when queueing/sending emails
 */
export async function checkEmailLimit(
  supabase: SupabaseClient<Database>,
  ownerId: string
): Promise<{ allowed: boolean; reason?: string }> {
  const { data: sub } = await supabase
    .from("subscriptions")
    .select("plan")
    .eq("owner_id", ownerId)
    .maybeSingle();

  const config = getPlanConfig(sub?.plan as any);

  if (config.monthlyEmailLimit == null) return { allowed: true };

  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();

  // Get all campaigns owned by this owner
  const { data: campaigns } = await supabase
    .from("campaigns")
    .select("id")
    .eq("owner_id", ownerId);

  if (!campaigns || campaigns.length === 0) {
    return { allowed: true };
  }

  const campaignIds = campaigns.map((c) => c.id);
  
  // Count emails sent this month via campaigns owned by this owner
  const { count: emailCount } = await supabase
    .from("outbound_emails")
    .select("id", { count: "exact", head: true })
    .eq("status", "sent")
    .gte("sent_at", start)
    .lt("sent_at", end)
    .in("campaign_id", campaignIds);

  if ((emailCount ?? 0) >= config.monthlyEmailLimit) {
    return {
      allowed: false,
      reason: `You have reached your ${config.name} plan limit of ${config.monthlyEmailLimit.toLocaleString()} emails this month. Upgrade to send more.`,
    };
  }

  return { allowed: true };
}

