// lib/authz/can.ts
// Authorization helpers for campaign and team access control

import { createClient } from "@/lib/supabase/server";

export async function requireCampaignRole(
  campaignId: string,
  userId: string,
  roles: ("viewer" | "editor" | "admin" | "owner")[]
): Promise<boolean> {
  const sb = createClient();

  // Get campaign to find team_id
  const { data: camp, error: campError } = await sb
    .from("campaigns")
    .select("team_id")
    .eq("id", campaignId)
    .single();

  if (campError || !camp) {
    return false;
  }

  // Check team owner/admin
  const { data: tm } = await sb
    .from("team_members")
    .select("role")
    .eq("team_id", camp.team_id)
    .eq("user_id", userId)
    .maybeSingle();

  if (tm && (tm.role === 'owner' || tm.role === 'admin')) {
    return true;
  }

  // Check campaign member role
  const { data: cm } = await sb
    .from("campaign_members")
    .select("role")
    .eq("campaign_id", campaignId)
    .eq("user_id", userId)
    .maybeSingle();

  if (!cm) {
    return false;
  }

  if (roles.includes('editor') && cm.role === 'editor') {
    return true;
  }

  if (roles.includes('viewer') && (cm.role === 'viewer' || cm.role === 'editor')) {
    return true;
  }

  return false;
}

/**
 * Check if user can view a campaign
 */
export async function canViewCampaign(
  campaignId: string,
  userId: string
): Promise<boolean> {
  return requireCampaignRole(campaignId, userId, ['viewer', 'editor', 'admin', 'owner']);
}

/**
 * Check if user can edit a campaign
 */
export async function canEditCampaign(
  campaignId: string,
  userId: string
): Promise<boolean> {
  return requireCampaignRole(campaignId, userId, ['editor', 'admin', 'owner']);
}

/**
 * Check if user can delete a campaign (only team owners/admins)
 */
export async function canDeleteCampaign(
  campaignId: string,
  userId: string
): Promise<boolean> {
  const sb = createClient();

  const { data: camp } = await sb
    .from("campaigns")
    .select("team_id")
    .eq("id", campaignId)
    .single();

  if (!camp) {
    return false;
  }

  const { data: tm } = await sb
    .from("team_members")
    .select("role")
    .eq("team_id", camp.team_id)
    .eq("user_id", userId)
    .maybeSingle();

  return tm ? (tm.role === 'owner' || tm.role === 'admin') : false;
}

/**
 * Check if user can invite to a campaign
 */
export async function canInviteToCampaign(
  campaignId: string,
  userId: string
): Promise<boolean> {
  return canEditCampaign(campaignId, userId);
}

/**
 * Get user's role for a campaign
 */
export async function getUserCampaignRole(
  campaignId: string,
  userId: string
): Promise<"viewer" | "editor" | "admin" | "owner" | null> {
  const sb = createClient();

  const { data: camp } = await sb
    .from("campaigns")
    .select("team_id")
    .eq("id", campaignId)
    .single();

  if (!camp) {
    return null;
  }

  // Check team role first
  const { data: tm } = await sb
    .from("team_members")
    .select("role")
    .eq("team_id", camp.team_id)
    .eq("user_id", userId)
    .maybeSingle();

  if (tm && (tm.role === 'owner' || tm.role === 'admin')) {
    return tm.role === 'owner' ? 'owner' : 'admin';
  }

  // Check campaign member role
  const { data: cm } = await sb
    .from("campaign_members")
    .select("role")
    .eq("campaign_id", campaignId)
    .eq("user_id", userId)
    .maybeSingle();

  if (cm) {
    return cm.role as "viewer" | "editor";
  }

  return null;
}















