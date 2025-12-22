import { createClient } from '@supabase/supabase-js';
import { google } from 'googleapis';
import { supabaseAdmin } from '@/lib/supabase/server';

const supabase = supabaseAdmin();

/**
 * Detect if leads in a campaign have replied by checking Gmail threads
 * Updates lead status to 'Replied' so follow-up sequences pause automatically
 * 
 * @param campaignId - The campaign ID to check replies for
 * @param ownerId - The owner/user ID who sent the campaign
 * @returns Array of lead emails that were marked as replied
 */
export async function checkRepliesForCampaign(campaignId: string, ownerId: string): Promise<string[]> {
  try {
    // 1. Get Gmail credentials for the owner
    const { data: mailbox, error: mbError } = await supabase
      .from('mailboxes')
      .select('from_email, gmail_refresh_token')
      .eq('owner', ownerId)
      .eq('provider', 'gmail')
      .maybeSingle();

    if (mbError || !mailbox?.gmail_refresh_token) {
      console.error('No Gmail credentials found for owner:', ownerId);
      return [];
    }

    // 2. Set up Gmail OAuth2 client
    const oAuth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_OAUTH_REDIRECT_URL
    );
    oAuth2Client.setCredentials({ refresh_token: mailbox.gmail_refresh_token });

    // Refresh the access token
    try {
      await oAuth2Client.getAccessToken();
    } catch (error) {
      console.error('Failed to refresh Gmail access token:', error);
      return [];
    }

    const gmail = google.gmail({ version: 'v1', auth: oAuth2Client });

    // 3. Get all leads for this campaign
    const { data: leads, error: leadsError } = await supabase
      .from('leads')
      .select('id, email, campaign_id, status')
      .eq('campaign_id', campaignId)
      .neq('status', 'Replied'); // Only check leads that haven't replied yet

    if (leadsError || !leads?.length) {
      console.log(`No leads found for campaign ${campaignId} or all already replied`);
      return [];
    }

    // 4. Get email logs with thread IDs for this campaign
    const { data: emailLogs, error: logsError } = await supabase
      .from('email_logs')
      .select('lead_id, thread_id, message_id')
      .eq('campaign_id', campaignId)
      .not('thread_id', 'is', null);

    if (logsError || !emailLogs?.length) {
      console.log(`No email logs with thread IDs found for campaign ${campaignId}`);
      return [];
    }

    // 5. Create a map of lead_id to thread_id
    const leadThreadMap = new Map<string, string>();
    for (const log of emailLogs) {
      if (log.thread_id && log.lead_id) {
        leadThreadMap.set(log.lead_id, log.thread_id);
      }
    }

    const updated: string[] = [];

    // 6. Check each lead's Gmail thread for replies
    for (const lead of leads) {
      let threadId = leadThreadMap.get(lead.id);
      
      // If no thread ID in map, try to get it from email_logs
      if (!threadId) {
        const { data: log } = await supabase
          .from('email_logs')
          .select('thread_id, provider_thread_id')
          .eq('lead_id', lead.id)
          .maybeSingle();

        threadId = log?.thread_id || log?.provider_thread_id || null;
      }

      if (!threadId) {
        console.log(`No thread ID found for lead ${lead.email}, skipping`);
        continue;
      }
      
      try {
        const thread = await gmail.users.threads.get({
          userId: 'me',
          id: threadId,
        });

        const messages = thread.data.messages || [];
        
        // Check if there's a reply from the recipient (not from us)
        const hasReply = messages.some((message) => {
          const headers = message.payload?.headers || [];
          const fromHeader = headers.find((h) => h.name === 'From');
          
          if (!fromHeader) return false;
          
          // Check if FROM is NOT our mailbox email
          const fromEmail = fromHeader.value.toLowerCase();
          const mailboxEmail = mailbox.from_email.toLowerCase();
          const isNotFromUs = !fromEmail.includes(mailboxEmail);
          
          // Make sure this message is a reply (has In-Reply-To or References header)
          const hasReplyHeaders = headers.some(
            (h) => h.name === 'In-Reply-To' || h.name === 'References'
          );
          
          return isNotFromUs && hasReplyHeaders;
        });

        if (hasReply) {
          // Update lead status to 'Replied'
          const { error: updateError } = await supabase
            .from('leads')
            .update({ 
              status: 'Replied',
              replied_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            })
            .eq('id', lead.id);

          if (!updateError) {
            // Cancel queued follow-ups for this lead
            const { data: clLinks } = await supabase
              .from("campaign_leads")
              .select("campaign_id")
              .eq("lead_id", lead.id);
            
            if (clLinks && clLinks.length > 0) {
              for (const clLink of clLinks) {
                await supabase.from("send_queue")
                  .update({ state: "Skipped", error: "Lead replied; sequence paused" })
                  .eq("campaign_id", clLink.campaign_id)
                  .eq("lead_id", lead.id)
                  .eq("state", "Queued");
                
                await supabase.from("campaign_leads")
                  .update({ state: "Replied" })
                  .eq("campaign_id", clLink.campaign_id)
                  .eq("lead_id", lead.id);
              }
            }
            
            console.log(`✅ Marked lead ${lead.email} as replied`);
            updated.push(lead.email);
          } else {
            console.error(`❌ Failed to update lead ${lead.email}:`, updateError);
          }
        }
      } catch (error) {
        console.error(`Error checking thread ${threadId} for lead ${lead.email}:`, error);
        // Continue with next lead even if one fails
      }
    }

    console.log(`📧 Campaign ${campaignId}: ${updated.length} leads marked as replied`);
    return updated;

  } catch (error) {
    console.error('Error checking replies for campaign:', error);
    throw error;
  }
}

/**
 * Check for replies across all active campaigns for an owner
 * Useful for periodic background jobs
 * 
 * @param ownerId - The owner/user ID
 * @returns Summary of replies detected
 */
export async function checkRepliesForAllCampaigns(ownerId: string): Promise<{
  campaignsChecked: number;
  leadsReplied: number;
  details: Array<{ campaignId: string; emails: string[] }>;
}> {
  // Get all active campaigns for this owner
  const { data: campaigns, error: campaignsError } = await supabase
    .from('campaigns')
    .select('id, workspace_id')
    .eq('workspace_id', ownerId)
    .eq('status', 'active');

  if (campaignsError || !campaigns?.length) {
    return { campaignsChecked: 0, leadsReplied: 0, details: [] };
  }

  const details: Array<{ campaignId: string; emails: string[] }> = [];
  let totalReplied = 0;

  for (const campaign of campaigns) {
    const replied = await checkRepliesForCampaign(campaign.id, ownerId);
    if (replied.length > 0) {
      details.push({ campaignId: campaign.id, emails: replied });
      totalReplied += replied.length;
    }
  }

  return {
    campaignsChecked: campaigns.length,
    leadsReplied: totalReplied,
    details,
  };
}
