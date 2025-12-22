import { cookies, headers } from "next/headers";
import { createSupabaseServer } from "@/lib/supabaseServer";

/**
 * Get the current organization ID from cookie or user's first org
 */
export async function getCurrentOrgId(): Promise<string | null> {
  const cookieStore = await cookies();
  const orgId = cookieStore.get("current_org_id")?.value || headers().get("x-org-id") || null;
  
  if (orgId) return orgId;

  // Fallback: get user's first org
  const sb = createSupabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return null;

  const { data: membership } = await sb
    .from("org_members")
    .select("org_id")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  return membership?.org_id || null;
}

/**
 * Get org_id from a campaign_id (for leads and logs that reference campaigns)
 */
export async function getOrgIdFromCampaign(campaignId: string): Promise<string | null> {
  const sb = createSupabaseServer();
  const { data: campaign } = await sb
    .from("campaigns")
    .select("org_id")
    .eq("id", campaignId)
    .maybeSingle();

  return campaign?.org_id || null;
}

/**
 * Get org_id from a lead_id (for logs that reference leads)
 */
export async function getOrgIdFromLead(leadId: string): Promise<string | null> {
  const sb = createSupabaseServer();
  const { data: lead } = await sb
    .from("leads")
    .select("org_id")
    .eq("id", leadId)
    .maybeSingle();

  return lead?.org_id || null;
}

