import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

/**
 * Handle auto-pause on reply for email sequences
 * This should be called when a lead replies to an email from a sequence
 */
export async function handleReplyForSequence(
  campaignId: string,
  leadId: string,
  workspaceId: string
) {
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    // Cancel future queued items
    await supabase.rpc('cancel_future_queue', {
      p_campaign: campaignId,
      p_lead: leadId
    });

    // Pause the sequence progress
    await supabase
      .from('sequence_progress')
      .update({ status: 'stopped' })
      .eq('campaign_id', campaignId)
      .eq('lead_id', leadId);

    console.log(`Cancelled future sequence emails for campaign ${campaignId}, lead ${leadId}`);
  } catch (error) {
    console.error('Error handling reply for sequence:', error);
    // Don't throw - we don't want to break reply processing
  }
}
