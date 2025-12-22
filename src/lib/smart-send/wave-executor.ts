/**
 * Wave Executor
 * Executes send waves and handles multi-domain staggering
 */

import { createClient } from '@supabase/supabase-js';
import { trackEmailSend } from './behavior-tracker';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * Execute a send wave
 */
export async function executeWave(waveId: string): Promise<void> {
  try {
    // Get wave details
    const { data: wave, error: waveError } = await supabase
      .from('send_waves')
      .select('*, campaign_schedules(*), campaigns(*)')
      .eq('id', waveId)
      .single();

    if (waveError || !wave) {
      throw new Error('Wave not found');
    }

    // Check if it's time to send
    const now = new Date();
    const sendAt = new Date(wave.send_at);

    if (now < sendAt) {
      console.log(`Wave ${waveId} not ready yet. Scheduled for ${sendAt}`);
      return;
    }

    // Update wave status
    await supabase
      .from('send_waves')
      .update({
        status: 'sending',
        started_at: now.toISOString(),
      })
      .eq('id', waveId);

    // Get recipients
    const { data: recipients, error: recipientsError } = await supabase
      .from('wave_recipients')
      .select('*, leads(*)')
      .eq('wave_id', waveId)
      .eq('status', 'queued')
      .order('scheduled_send_at', { ascending: true });

    if (recipientsError) {
      throw recipientsError;
    }

    if (!recipients || recipients.length === 0) {
      // No recipients, mark as completed
      await supabase
        .from('send_waves')
        .update({
          status: 'sent',
          completed_at: now.toISOString(),
        })
        .eq('id', waveId);
      return;
    }

    // Get available domains for staggering
    const domains = await getAvailableDomains(wave.workspace_id);
    const enableStaggering =
      wave.campaign_schedules?.enable_domain_staggering && domains.length > 1;

    let sentCount = 0;
    let failedCount = 0;
    const staggerMinutes = wave.campaign_schedules?.domain_stagger_minutes || 15;

    // Process recipients
    for (let i = 0; i < recipients.length; i++) {
      const recipient = recipients[i];
      const lead = recipient.leads as any;

      try {
        // Calculate send time with staggering
        let actualSendTime = new Date(recipient.scheduled_send_at || wave.send_at);
        if (enableStaggering && domains.length > 1) {
          const domainIndex = i % domains.length;
          actualSendTime = new Date(
            actualSendTime.getTime() + domainIndex * staggerMinutes * 60 * 1000
          );
        }

        // Wait if needed
        const waitTime = actualSendTime.getTime() - now.getTime();
        if (waitTime > 0) {
          await new Promise((resolve) => setTimeout(resolve, waitTime));
        }

        // Send email (integrate with your email sending system)
        const sendResult = await sendEmailToRecipient({
          recipient,
          lead,
          campaign: wave.campaigns,
          domain: enableStaggering
            ? domains[i % domains.length]
            : domains[0],
        });

        if (sendResult.success) {
          // Update recipient status
          await supabase
            .from('wave_recipients')
            .update({
              status: 'sent',
              sent_at: new Date().toISOString(),
            })
            .eq('id', recipient.id);

          // Track behavior
          if (lead?.id) {
            await trackEmailSend(
              wave.workspace_id,
              lead.id,
              recipient.recipient_email
            );
          }

          sentCount++;
        } else {
          throw new Error(sendResult.error || 'Send failed');
        }
      } catch (error: any) {
        console.error(`Error sending to ${recipient.recipient_email}:`, error);

        // Update recipient status
        await supabase
          .from('wave_recipients')
          .update({
            status: 'failed',
            error_message: error.message || 'Send failed',
            retry_count: (recipient.retry_count || 0) + 1,
          })
          .eq('id', recipient.id);

        failedCount++;
      }
    }

    // Update wave status
    await supabase
      .from('send_waves')
      .update({
        status: 'sent',
        sent_count: sentCount,
        failed_count: failedCount,
        completed_at: new Date().toISOString(),
      })
      .eq('id', waveId);

    console.log(
      `Wave ${waveId} completed: ${sentCount} sent, ${failedCount} failed`
    );
  } catch (error: any) {
    console.error(`Error executing wave ${waveId}:`, error);

    // Mark wave as failed
    await supabase
      .from('send_waves')
      .update({
        status: 'failed',
        error_message: error.message || 'Wave execution failed',
      })
      .eq('id', waveId);

    throw error;
  }
}

/**
 * Get available domains for a workspace
 */
async function getAvailableDomains(workspaceId: string): Promise<string[]> {
  try {
    const { data: domains } = await supabase
      .from('sending_domains')
      .select('domain, sending_reputation')
      .eq('org_id', workspaceId) // Adjust based on your schema
      .in('sending_reputation', ['good', 'excellent'])
      .order('sending_reputation', { ascending: false });

    return domains?.map((d) => d.domain).filter((d): d is string => !!d) || [];
  } catch (error) {
    console.error('Error fetching domains:', error);
    return [];
  }
}

/**
 * Send email to a recipient
 * This should integrate with your existing email sending system
 */
async function sendEmailToRecipient({
  recipient,
  lead,
  campaign,
  domain,
}: {
  recipient: any;
  lead: any;
  campaign: any;
  domain: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    // TODO: Integrate with your email sending system
    // This is a placeholder - replace with actual email sending logic
    console.log(`Sending email to ${recipient.recipient_email} via ${domain}`);

    // Example integration:
    // const result = await sendEmail({
    //   to: recipient.recipient_email,
    //   from: `noreply@${domain}`,
    //   subject: campaign.subject,
    //   html: campaign.body_html,
    // });

    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Process all due waves
 */
export async function processDueWaves(): Promise<void> {
  try {
    const now = new Date();

    // Get all pending waves that are due
    const { data: waves, error } = await supabase
      .from('send_waves')
      .select('id')
      .eq('status', 'pending')
      .lte('send_at', now.toISOString())
      .order('send_at', { ascending: true })
      .limit(10); // Process 10 at a time

    if (error) {
      throw error;
    }

    if (!waves || waves.length === 0) {
      return;
    }

    // Process each wave
    for (const wave of waves) {
      try {
        await executeWave(wave.id);
      } catch (error) {
        console.error(`Error processing wave ${wave.id}:`, error);
        // Continue with next wave
      }
    }
  } catch (error) {
    console.error('Error processing due waves:', error);
    throw error;
  }
}



























