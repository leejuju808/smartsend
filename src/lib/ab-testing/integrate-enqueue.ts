/**
 * Block 24020 — Integrate A/B Testing into Campaign Enqueue
 * Call this when enqueueing emails to check for active tests and apply variants
 */

import { createClient } from '@supabase/supabase-js';
import { executeAbTest, getActiveTestForCampaign } from './execute-test';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * Check for active A/B test and execute if needed when enqueueing campaign emails
 * Call this before inserting into send_queue
 */
export async function integrateAbTestOnEnqueue(campaignId: string): Promise<void> {
  try {
    // Check if campaign has active test
    const testId = await getActiveTestForCampaign(campaignId);

    if (!testId) {
      // No active test, proceed normally
      return;
    }

    // Execute test (split recipients and apply variants)
    await executeAbTest({
      testId,
      campaignId,
    });

    console.log(`A/B test ${testId} executed for campaign ${campaignId}`);
  } catch (error: any) {
    // Don't fail enqueue if A/B test fails
    console.error(`Error integrating A/B test for campaign ${campaignId}:`, error);
  }
}

/**
 * Update email tracking when email is opened/replied (for A/B test stats)
 */
export async function updateAbTestTracking(params: {
  emailLogId?: string;
  leadId?: string;
  openedAt?: Date;
  repliedAt?: Date;
}): Promise<void> {
  const { emailLogId, leadId, openedAt, repliedAt } = params;

  if (!emailLogId && !leadId) {
    return;
  }

  try {
    // Find test recipient record
    const query = supabaseAdmin.from('ab_test_recipients').select('*');

    if (emailLogId) {
      query.eq('email_log_id', emailLogId);
    } else if (leadId) {
      query.eq('lead_id', leadId);
    }

    const { data: recipients } = await query.limit(1);

    if (!recipients || recipients.length === 0) {
      return; // Not part of an A/B test
    }

    const recipient = recipients[0];

    // Update opens
    if (openedAt && !recipient.opened_at) {
      await supabaseAdmin
        .from('ab_test_recipients')
        .update({ opened_at: openedAt.toISOString() })
        .eq('id', recipient.id);

      // Increment variant open count
      await supabaseAdmin.rpc('increment_variant_opens', {
        p_variant_id: recipient.variant_id,
      });
    }

    // Update replies
    if (repliedAt && !recipient.replied_at) {
      await supabaseAdmin
        .from('ab_test_recipients')
        .update({ replied_at: repliedAt.toISOString() })
        .eq('id', recipient.id);

      // Increment variant reply count
      await supabaseAdmin.rpc('increment_variant_replies', {
        p_variant_id: recipient.variant_id,
      });
    }
  } catch (error: any) {
    console.error('Error updating A/B test tracking:', error);
  }
}






































