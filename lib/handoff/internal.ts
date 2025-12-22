// Internal Handoff Function
// Can be called from edge functions or service role contexts

import { createClient } from '@supabase/supabase-js';
import { initiateHandoff } from './engine';
import type { HandoffPayload } from './types';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function triggerHandoffInternal(threadId: string): Promise<void> {
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    // Fetch thread with related data
    const { data: thread, error: threadError } = await supabase
      .from('reply_threads')
      .select(`
        *,
        leads:lead_id (
          id,
          name,
          email
        ),
        companies:company_id (
          id,
          name
        ),
        campaigns:campaign_id (
          id,
          handoff_mode,
          handoff_destination,
          account_id
        )
      `)
      .eq('id', threadId)
      .single();

    if (threadError || !thread) {
      console.error('Failed to fetch thread for handoff:', threadError);
      return;
    }

    const campaign = thread.campaigns as any;
    if (!campaign || !campaign.handoff_destination || campaign.handoff_destination === 'none') {
      return; // No handoff configured
    }

    // Only auto-trigger if mode is 'auto'
    if (campaign.handoff_mode !== 'auto') {
      return;
    }

    // Build handoff payload
    const lead = thread.leads as any;
    const company = thread.companies as any;
    
    const payload: HandoffPayload = {
      lead_name: lead?.name || 'Unknown',
      lead_email: lead?.email || '',
      company: company?.name,
      summary: thread.ai_summary || undefined,
      tone: thread.ai_tone || undefined,
      opportunity: thread.ai_opportunity_score || undefined,
      objections: thread.ai_objections || undefined,
      buyer_role: thread.ai_buyer_role || undefined,
      campaign_id: thread.campaign_id || undefined,
      lead_id: thread.lead_id,
      company_id: thread.company_id || undefined
    };

    // Initiate handoff
    const handoffResult = await initiateHandoff(payload, campaign.handoff_destination);

    // Log handoff attempt
    await supabase.rpc('log_handoff_attempt', {
      p_account_id: campaign.account_id || thread.account_id,
      p_lead_id: thread.lead_id,
      p_company_id: thread.company_id || null,
      p_campaign_id: thread.campaign_id || null,
      p_method: campaign.handoff_destination,
      p_status: handoffResult.status === 'success' ? 'success' : 
                handoffResult.status === 'failed' ? 'failed' : 'ignored',
      p_meta: {
        result: handoffResult,
        payload: payload
      }
    }).catch((err) => console.error('Failed to log handoff:', err));

    // Log activity
    await supabase.from('activity_log').insert({
      account_id: campaign.account_id || thread.account_id,
      campaign_id: thread.campaign_id || null,
      company_id: thread.company_id || null,
      lead_id: thread.lead_id,
      event_type: handoffResult.status === 'success' ? 'handoff_success' : 
                  handoffResult.status === 'failed' ? 'handoff_failed' : 'handoff_initiated',
      meta: {
        destination: campaign.handoff_destination,
        result: handoffResult
      }
    }).catch((err) => console.error('Failed to log activity:', err));
  } catch (error) {
    console.error('Error in triggerHandoffInternal:', error);
    // Don't throw - handoff failures shouldn't break the main flow
  }
}












