/**
 * Block 9400 — AI Personalization Engine v1
 * Block 24100 — SmartSend Roofing Message Personalization Engine v1 (Enhanced)
 * Helper functions for checking feature access and personalizing emails
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabaseAdmin = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    })
  : null;

/**
 * Check if workspace has access to AI Personalization (Growth/Domination plans only)
 */
export async function hasPersonalizationAccess(workspaceId: string): Promise<boolean> {
  if (!supabaseAdmin) return false;

  try {
    // Check workspace billing/subscription
    const { data: subscription } = await supabaseAdmin
      .from('billing_subscriptions')
      .select('plan, status')
      .eq('workspace_id', workspaceId)
      .eq('status', 'active')
      .maybeSingle();

    if (!subscription) {
      // Check for trial or other statuses
      const { data: trial } = await supabaseAdmin
        .from('billing_subscriptions')
        .select('plan, status')
        .eq('workspace_id', workspaceId)
        .in('status', ['trialing', 'active'])
        .maybeSingle();

      if (!trial) return false;

      const plan = (trial.plan || '').toLowerCase();
      return plan === 'growth' || plan === 'domination';
    }

    const plan = (subscription.plan || '').toLowerCase();
    return plan === 'growth' || plan === 'domination';
  } catch (error) {
    console.error('Error checking personalization access:', error);
    return false;
  }
}

/**
 * Personalize email if access is available, otherwise return original
 * Block 24100: Uses comprehensive 5-layer personalization engine
 */
export async function personalizeIfEnabled(
  templateSubject: string,
  templateBody: string,
  contactId: string,
  campaignId: string,
  workspaceId: string,
  leadId?: string
): Promise<{ subject: string; body: string; personalized: boolean; opener?: string; personalization_score?: number }> {
  const hasAccess = await hasPersonalizationAccess(workspaceId);
  
  if (!hasAccess) {
    return {
      subject: templateSubject,
      body: templateBody,
      personalized: false,
    };
  }

  try {
    // Block 24100: Use comprehensive 5-layer personalization engine
    const { personalizeEmailV1Block24100 } = await import('./personalization-engine-v1-block24100');
    const result = await personalizeEmailV1Block24100({
      template_body: templateBody,
      template_subject: templateSubject,
      contact_id: contactId,
      lead_id: leadId,
      campaign_id: campaignId,
      workspace_id: workspaceId,
    });

    return {
      subject: result.subject,
      body: result.body,
      opener: result.opener,
      personalization_score: result.personalization_score,
      personalized: true,
    };
  } catch (error) {
    console.error('Personalization failed, using original:', error);
    // Fallback to original template
    return {
      subject: templateSubject,
      body: templateBody,
      personalized: false,
    };
  }
}



















