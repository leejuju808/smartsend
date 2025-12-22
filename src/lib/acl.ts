import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { createSupabaseServer } from '@/lib/supabaseServer';
import { getActiveOrg } from '@/lib/org';

/**
 * Get current user's role in the active org
 */
export async function currentRole(): Promise<string | null> {
  try {
    const org = await getActiveOrg();
    if (!org?.id) return null;
    
    const sb = createSupabaseServer();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return null;
    
    const { data: member } = await sb
      .from('org_members')
      .select('role')
      .eq('org_id', org.id)
      .eq('user_id', user.id)
      .maybeSingle();
    
    return member?.role || null;
  } catch (error) {
    console.error('Error getting current role:', error);
    return null;
  }
}

/**
 * Require user to be admin or owner in active org
 * Throws if not admin/owner
 */
export async function requireAdmin(): Promise<{ ok: boolean; role?: string; error?: string }> {
  try {
    const role = await currentRole();
    if (!role) {
      return { ok: false, error: 'no_role' };
    }
    
    if (!['owner', 'admin'].includes(role)) {
      return { ok: false, error: 'forbidden', role };
    }
    
    return { ok: true, role };
  } catch (error) {
    console.error('Error in requireAdmin:', error);
    return { ok: false, error: 'error' };
  }
}

/**
 * Check if user can read a specific campaign
 */
export async function canReadCampaign(campaignId: string): Promise<boolean> {
  try {
    const sb = createSupabaseServer();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return false;
    
    const org = await getActiveOrg();
    if (!org?.id) return false;
    
    // Get campaign to check its org
    const { data: campaign } = await sb
      .from('campaigns')
      .select('id, org_id, user_id')
      .eq('id', campaignId)
      .maybeSingle();
    
    if (!campaign) return false;
    
    // Check user's org membership
    const { data: member } = await sb
      .from('org_members')
      .select('role')
      .eq('org_id', org.id)
      .eq('user_id', user.id)
      .maybeSingle();
    
    const role = member?.role;
    
    // Owner/Admin can always read
    if (role === 'owner' || role === 'admin') return true;
    
    // Member and Viewer can read
    if (role === 'member' || role === 'viewer') return true;
    
    // Check campaign_acl
    const { data: acl } = await sb
      .from('campaign_acl')
      .select('id')
      .eq('campaign_id', campaignId)
      .eq('user_id', user.id)
      .maybeSingle();
    
    return !!acl;
  } catch (error) {
    console.error('Error checking canReadCampaign:', error);
    return false;
  }
}

/**
 * Check if user can write to a specific campaign
 */
export async function canWriteCampaign(campaignId: string): Promise<boolean> {
  try {
    const sb = createSupabaseServer();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return false;
    
    const org = await getActiveOrg();
    if (!org?.id) return false;
    
    // Get campaign
    const { data: campaign } = await sb
      .from('campaigns')
      .select('id, org_id')
      .eq('id', campaignId)
      .maybeSingle();
    
    if (!campaign) return false;
    
    // Check user's org membership
    const { data: member } = await sb
      .from('org_members')
      .select('role')
      .eq('org_id', org.id)
      .eq('user_id', user.id)
      .maybeSingle();
    
    const role = member?.role;
    
    // Owner/Admin can always write
    if (role === 'owner' || role === 'admin') return true;
    
    // Member can write
    if (role === 'member') return true;
    
    // Viewer cannot write
    if (role === 'viewer') return false;
    
    // Check campaign_acl for write permission
    const { data: acl } = await sb
      .from('campaign_acl')
      .select('id')
      .eq('campaign_id', campaignId)
      .eq('user_id', user.id)
      .eq('permission', 'write')
      .maybeSingle();
    
    return !!acl;
  } catch (error) {
    console.error('Error checking canWriteCampaign:', error);
    return false;
  }
}

/**
 * Check if user can read a specific inbox
 */
export async function canReadInbox(inboxId: string): Promise<boolean> {
  try {
    const sb = createSupabaseServer();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return false;
    
    const org = await getActiveOrg();
    if (!org?.id) return false;
    
    // Get inbox's workspace
    const { data: inbox } = await sb
      .from('inbox_threads')
      .select('id, workspace_id')
      .eq('id', inboxId)
      .maybeSingle();
    
    if (!inbox) return false;
    
    // For now, check org membership (all org members can read inbox)
    const { data: member } = await sb
      .from('org_members')
      .select('role')
      .eq('org_id', org.id)
      .eq('user_id', user.id)
      .maybeSingle();
    
    return !!member;
  } catch (error) {
    console.error('Error checking canReadInbox:', error);
    return false;
  }
}

/**
 * Check if user can write to a specific inbox
 */
export async function canWriteInbox(inboxId: string): Promise<boolean> {
  try {
    const sb = createSupabaseServer();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return false;
    
    const org = await getActiveOrg();
    if (!org?.id) return false;
    
    // Get inbox's workspace
    const { data: inbox } = await sb
      .from('inbox_threads')
      .select('id, workspace_id')
      .eq('id', inboxId)
      .maybeSingle();
    
    if (!inbox) return false;
    
    // Check user's org membership
    const { data: member } = await sb
      .from('org_members')
      .select('role')
      .eq('org_id', org.id)
      .eq('user_id', user.id)
      .maybeSingle();
    
    const role = member?.role;
    
    // Owner/Admin/Member can write
    if (role === 'owner' || role === 'admin' || role === 'member') return true;
    
    // Viewer cannot write
    return false;
  } catch (error) {
    console.error('Error checking canWriteInbox:', error);
    return false;
  }
}

/**
 * Ensure current user can edit the campaign (editor/owner roles).
 * Throws if not authorized.
 */
export async function assertEditor(campaignId: string): Promise<void> {
  const supabase = createRouteHandlerClient({ cookies });
  const { data, error } = await supabase.rpc("is_campaign_editor", {
    p_campaign: campaignId,
  });

  if (error) {
    throw error;
  }
  if (!data) {
    throw new Error("forbidden");
  }
}

/**
 * Ensure current user is owner of the campaign.
 * Throws if not authorized.
 */
export async function assertOwner(campaignId: string): Promise<void> {
  const supabase = createRouteHandlerClient({ cookies });
  const { data, error } = await supabase.rpc("is_campaign_owner", {
    p_campaign: campaignId,
  });

  if (error) {
    throw error;
  }
  if (!data) {
    throw new Error("forbidden");
  }
}

/**
 * Ensure current user can view the campaign (viewer+ roles).
 * Throws if not authorized.
 */
export async function assertViewer(campaignId: string): Promise<void> {
  const supabase = createRouteHandlerClient({ cookies });
  const { data, error } = await supabase.rpc("is_campaign_viewer", {
    p_campaign: campaignId,
  });

  if (error) {
    throw error;
  }
  if (!data) {
    throw new Error("forbidden");
  }
}

/**
 * Lookup the campaign id for a given step id.
 */
export async function getCampaignIdByStep(stepId: string): Promise<string | null> {
  const supabase = createRouteHandlerClient({ cookies });
  const { data, error } = await supabase
    .from("campaign_steps")
    .select("campaign_id")
    .eq("id", stepId)
    .single();

  if (error || !data) return null;
  return data.campaign_id as string;
}

/**
 * Ensure current user can view the step (viewer+ roles).
 * Throws HTTP responses for API handlers.
 */
export async function assertViewerByStep(stepId: string): Promise<void> {
  const supabase = createRouteHandlerClient({ cookies });
  const cid = await getCampaignIdByStep(stepId);
  if (!cid) {
    throw new Response(JSON.stringify({ error: "not_found" }), { status: 404 });
  }

  const { data, error } = await supabase.rpc("is_campaign_viewer", {
    p_campaign: cid,
  });

  if (error || !data) {
    throw new Response(JSON.stringify({ error: "forbidden" }), { status: 403 });
  }
}

/**
 * Ensure current user can edit the step (editor+ roles).
 * Throws HTTP responses for API handlers.
 */
export async function assertEditorByStep(stepId: string): Promise<void> {
  const supabase = createRouteHandlerClient({ cookies });
  const cid = await getCampaignIdByStep(stepId);
  if (!cid) {
    throw new Response(JSON.stringify({ error: "not_found" }), { status: 404 });
  }

  const { data, error } = await supabase.rpc("is_campaign_editor", {
    p_campaign: cid,
  });

  if (error || !data) {
    throw new Response(JSON.stringify({ error: "forbidden" }), { status: 403 });
  }
}

