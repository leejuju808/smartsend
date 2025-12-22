import { createClient } from '@supabase/supabase-js';
import { randomBytes } from 'crypto';

function sbAdmin() { 
  return new (createClient as any)(
    process.env.NEXT_PUBLIC_SUPABASE_URL!, 
    process.env.SUPABASE_SERVICE_ROLE_KEY!, 
    { auth: { persistSession: false } }
  ); 
}

function tok(n = 24) { 
  return randomBytes(n).toString('base64url'); 
}

function baseUrl() { 
  return (process.env.NEXT_PUBLIC_SITE_URL || '').replace(/\/$/, ''); 
}

export async function makeUnsubLink(
  workspaceId: string, 
  email: string, 
  sequenceId?: string, 
  subscriberId?: string
) {
  const sb = sbAdmin();
  await sb.rpc('app.set_workspace', { id: workspaceId });
  const token = tok();
  
  await sb.from('unsubscribe_tokens').insert({ 
    token, 
    workspace_id: workspaceId, 
    email: email.toLowerCase(), 
    sequence_id: sequenceId || null, 
    subscriber_id: subscriberId || null 
  });
  
  return `${baseUrl()}/u?token=${encodeURIComponent(token)}`;
}

export async function isSuppressedFor(
  workspaceId: string, 
  email: string, 
  sequenceId?: string
) {
  const sb = sbAdmin();
  await sb.rpc('app.set_workspace', { id: workspaceId });
  const em = email.toLowerCase();

  // Global suppression_list check (from earlier drops)
  const sup = await sb.from('suppression_list').select('email').eq('workspace_id', workspaceId).eq('email', em).limit(1);
  if (sup.data && sup.data.length) return { blocked: true, reason: 'suppression_list' };

  // Preferences global opt-out
  const prefs = await sb.from('email_preferences')
    .select('global_opt_out')
    .eq('workspace_id', workspaceId)
    .eq('email', em)
    .maybeSingle();
  if (prefs.data?.global_opt_out) return { blocked: true, reason: 'global_opt_out' };

  // Per-sequence opt-out
  if (sequenceId) {
    const so = await sb.from('sequence_opt_outs')
      .select('sequence_id')
      .eq('workspace_id', workspaceId)
      .eq('email', em)
      .eq('sequence_id', sequenceId)
      .limit(1);
    if (so.data && so.data.length) return { blocked: true, reason: 'sequence_opt_out' };
  }

  return { blocked: false };
}

export async function applyGlobalUnsub(
  workspaceId: string, 
  email: string, 
  meta?: { ua?: string; ip?: string; reason?: string }
) {
  const sb = sbAdmin();
  await sb.rpc('app.set_workspace', { id: workspaceId });
  const em = email.toLowerCase();
  
  await sb.from('email_preferences').upsert({ 
    workspace_id: workspaceId, 
    email: em, 
    global_opt_out: true, 
    updated_at: new Date().toISOString() 
  });
  
  // Add to suppression list for immediate blocking
  await sb.rpc('suppress_contact', {
    p_workspace_id: workspaceId,
    p_email: em,
    p_reason: 'unsubscribed',
    p_created_by: 'system',
    p_created_by_user_id: null,
    p_notes: meta?.reason ? `unsubscribe:${meta.reason}` : 'unsubscribe:user-click',
  });
  
  await sb.from('unsubscribe_events').insert({ 
    workspace_id: workspaceId, 
    email: em, 
    action: 'global', 
    reason: meta?.reason || null, 
    user_agent: meta?.ua || '', 
    ip: (meta?.ip || null) 
  });

  // Cancel future sequence emails for this email across all campaigns
  await cancelFutureQueueForEmail(sb, workspaceId, em);

  // Also cancel any queued outbound immediately (instant DNC).
  await sb.rpc('ss_cancel_outbound_for_email', { p_workspace_id: workspaceId, p_email: em });
}

export async function applySequenceUnsub(
  workspaceId: string, 
  email: string, 
  sequenceId: string, 
  meta?: { ua?: string; ip?: string; reason?: string }
) {
  const sb = sbAdmin();
  await sb.rpc('app.set_workspace', { id: workspaceId });
  const em = email.toLowerCase();
  
  await sb.from('sequence_opt_outs').upsert({ 
    workspace_id: workspaceId, 
    email: em, 
    sequence_id: sequenceId 
  });
  
  await sb.from('unsubscribe_events').insert({ 
    workspace_id: workspaceId, 
    email: em, 
    action: 'sequence', 
    sequence_id: sequenceId, 
    reason: meta?.reason || null, 
    user_agent: meta?.ua || '', 
    ip: (meta?.ip || null) 
  });

  // Get campaign_id from sequence and cancel future emails
  const { data: sequence } = await sb
    .from('sequences')
    .select('campaign_id')
    .eq('id', sequenceId)
    .maybeSingle();

  if (sequence?.campaign_id) {
    // Find lead_id from email
    const { data: lead } = await sb
      .from('leads')
      .select('id')
      .eq('email', em)
      .limit(1);

    if (lead?.[0]?.id) {
      await sb.rpc('cancel_future_queue', {
        p_campaign: sequence.campaign_id,
        p_lead: lead[0].id
      });

      // Also pause the sequence progress
      await sb
        .from('sequence_progress')
        .update({ status: 'stopped' })
        .eq('campaign_id', sequence.campaign_id)
        .eq('lead_id', lead[0].id);
    }
  }
}

// Helper to cancel future queue items for an email across all campaigns
async function cancelFutureQueueForEmail(sb: any, workspaceId: string, email: string) {
  // Find all leads with this email
  const { data: leads } = await sb
    .from('leads')
    .select('id')
    .eq('email', email);

  if (!leads?.length) return;

  const leadIds = leads.map((l: any) => l.id);

  // Get all campaigns for these leads
  const { data: progressRows } = await sb
    .from('sequence_progress')
    .select('campaign_id, lead_id')
    .in('lead_id', leadIds)
    .eq('workspace_id', workspaceId)
    .eq('status', 'active');

  if (!progressRows?.length) return;

  // Cancel future queue items for each campaign/lead pair
  for (const row of progressRows) {
    await sb.rpc('cancel_future_queue', {
      p_campaign: row.campaign_id,
      p_lead: row.lead_id
    });

    // Also pause the sequence progress
    await sb
      .from('sequence_progress')
      .update({ status: 'stopped' })
      .eq('campaign_id', row.campaign_id)
      .eq('lead_id', row.lead_id);
  }
}

// Helper function to check if email is in suppression list
export async function isInSuppressionList(workspaceId: string, email: string) {
  const sb = sbAdmin();
  await sb.rpc('app.set_workspace', { id: workspaceId });
  const em = email.toLowerCase();
  
  const { data } = await sb.from('suppression_list')
    .select('email')
    .eq('workspace_id', workspaceId)
    .eq('email', em)
    .limit(1);
    
  return data && data.length > 0;
}

// Helper function to add email to suppression list
export async function addToSuppressionList(
  workspaceId: string, 
  email: string, 
  reason: string = 'manual'
) {
  const sb = sbAdmin();
  await sb.rpc('app.set_workspace', { id: workspaceId });
  const em = email.toLowerCase();
  
  await sb.rpc('suppress_contact', {
    p_workspace_id: workspaceId,
    p_email: em,
    p_reason: reason,
    p_created_by: 'user',
    p_created_by_user_id: null,
    p_notes: 'manual_suppression',
  });
} 