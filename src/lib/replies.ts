import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { createClient as createServerSupabaseClient } from '@/lib/supabase/server';
import { createIntentDetector } from './intent';
import { parseBounce } from './email/bounce';
import { classifyReplyText } from './ai/classifyReply';
import { syncAndDetectReply } from './reply-detection';

export interface InboundMessage {
  messageId: string;
  inReplyTo?: string;
  fromEmail: string;
  toEmail: string;
  subject?: string;
  bodyText: string;
  bodyHtml?: string;
  headers?: Record<string, string>;
  provider: 'ses' | 'mailgun' | 'mailersend';
  providerData?: any;
}

export interface ReplyIntent {
  category: 'meeting' | 'interested' | 'not_interested' | 'question' | 'other';
  confidence: number;
  actions: string[];
  extractedData: Record<string, any>;
}

export interface ProcessedReply {
  inboundMessageId: string;
  campaignId?: string;
  contactId?: string;
  intent?: ReplyIntent;
  autoStopped: boolean;
}

export type ReplyStatus =
  | 'replied'
  | 'out_of_office'
  | 'not_interested'
  | 'scheduling'
  | 'question'
  | 'neutral'
  | 'unclear';

export class ReplyProcessor {
  private supabase: any;
  private intentDetector: any;

  constructor(openaiApiKey?: string) {
    this.supabase = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    
    this.intentDetector = createIntentDetector(openaiApiKey);
  }

  /**
   * Process an inbound reply message
   */
  async processReply(
    workspaceId: string,
    message: InboundMessage
  ): Promise<ProcessedReply> {
    try {
      // 1. Insert inbound message
      const { data: inboundMessage, error: insertError } = await this.supabase
        .from('inbound_messages')
        .insert({
          workspace_id: workspaceId,
          message_id: message.messageId,
          in_reply_to: message.inReplyTo,
          from_email: message.fromEmail.toLowerCase(),
          to_email: message.toEmail.toLowerCase(),
          subject: message.subject,
          body_text: message.bodyText,
          body_html: message.bodyHtml,
          headers: message.headers,
          provider: message.provider,
          provider_data: message.providerData,
        })
        .select()
        .single();

      if (insertError) {
        throw new Error(`Failed to insert inbound message: ${insertError.message}`);
      }

      // 2. Find matching campaign and contact
      const { campaignId, contactId } = await this.findMatchingCampaign(
        workspaceId,
        message.inReplyTo || message.messageId
      );

      if (!campaignId) {
        return {
          inboundMessageId: inboundMessage.id,
          autoStopped: false,
        };
      }

      // 3. Classify reply intent
      const intent = await this.classifyIntent(message.bodyText);

      // 4. Insert reply intent
      if (intent) {
        await this.supabase
          .from('reply_intents')
          .insert({
            inbound_message_id: inboundMessage.id,
            workspace_id: workspaceId,
            contact_id: contactId,
            campaign_id: campaignId,
            category: intent.category,
            confidence: intent.confidence,
            actions: intent.actions,
            extracted_data: intent.extractedData,
          });
      }

      // 5. Create or update inbox thread
      if (contactId) {
        await this.createOrUpdateInboxThread(
          workspaceId,
          contactId,
          campaignId,
          message.subject || '(reply)',
          message.bodyText
        );
      }

      // 6. Auto-stop future sends
      await this.autoStopFutureSends(workspaceId, contactId!, campaignId, 'replied');

      // 7. Log reply event
      await this.supabase
        .from('email_events')
        .insert({
          workspace_id: workspaceId,
          campaign_id: campaignId,
          contact_id: contactId,
          event_type: 'replied',
          inbound_message_id: inboundMessage.id,
        });

      // 7.5. Trigger OOO extraction if we have a reply ID
      if (inboundMessage.id && campaignId && contactId) {
        try {
          const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
          const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
          if (supabaseUrl && supabaseKey) {
            await fetch(`${supabaseUrl}/functions/v1/ooo-extract`, {
              method: "POST",
              headers: { 
                "Content-Type": "application/json",
                "Authorization": `Bearer ${supabaseKey}`
              },
              body: JSON.stringify({ reply_id: inboundMessage.id }),
            });
          }
        } catch (e) {
          console.error("Failed to trigger OOO extraction:", e);
          // Don't fail the request if OOO extraction fails
        }
      }

      // 7.5. Update lead score for reply
      if (contactId) {
        const { data: contact } = await this.supabase
          .from('contacts')
          .select('email')
          .eq('id', contactId)
          .single();
        
        if (contact?.email) {
          await this.supabase.rpc('increment_score', {
            p_email: contact.email,
            p_type: 'reply'
          });
        }
      }

      // 7.6. Update leads table with reply detection
      if (campaignId && intent) {
        // Find the lead by contact email and campaign
        const { data: contactForLead } = await this.supabase
          .from('contacts')
          .select('id, email')
          .eq('id', contactId!)
          .single();
        
        if (contactForLead?.email) {
          // Try to find lead by email in this campaign
          const { data: lead } = await this.supabase
            .from('leads')
            .select('id')
            .eq('email', contactForLead.email)
            .maybeSingle();
          
          if (lead) {
            await this.supabase
              .from('leads')
              .update({
                reply_detected: true,
                reply_summary: intent.extractedData?.summary || `${intent.category} reply`,
                reply_classification: intent.category,
                status: 'replied',
                replied_at: new Date().toISOString(),
              })
              .eq('id', lead.id);
          }
        }
      }

      // 7.7. Block 13400: Enrich contact from reply content (async, non-blocking)
      if (contactId && message.bodyText) {
        try {
          const { enrichFromReply } = await import('@/lib/contact-enrichment-service');
          enrichFromReply(
            contactId,
            workspaceId,
            message.bodyText,
            this.supabase
          ).catch((error) => {
            console.error('Failed to enrich contact from reply:', error);
            // Don't throw - enrichment failures shouldn't break reply processing
          });
        } catch (error) {
          console.error('Failed to load enrichment service:', error);
          // Don't throw - enrichment failures shouldn't break reply processing
        }
      }

      // 8. Update campaign metrics
      await this.updateCampaignMetrics(campaignId, 'replies');

      // 9. Update sequence enrollment status (if actionable or bounce)
      await this.updateEnrollmentStatus(
        workspaceId,
        campaignId,
        contactId,
        message.bodyText,
        message.subject,
        message.fromEmail,
        intent
      );

      // 10. Sync to email_messages and run AI reply detection
      // This runs asynchronously and won't block the response
      // Extract leadId from contact if available
      let leadIdForDetection: string | undefined;
      if (contactId) {
        const { data: contact } = await this.supabase
          .from('contacts')
          .select('email')
          .eq('id', contactId)
          .maybeSingle();
        
        if (contact?.email) {
          const { data: lead } = await this.supabase
            .from('leads')
            .select('id')
            .eq('email', contact.email.toLowerCase())
            .maybeSingle();
          
          if (lead) {
            leadIdForDetection = lead.id;
          }
        }
      }
      
      syncAndDetectReply(
        workspaceId,
        {
          id: inboundMessage.id,
          from_email: message.fromEmail,
          to_email: message.toEmail,
          subject: message.subject,
          body_text: message.bodyText,
          body_html: message.bodyHtml,
          headers: message.headers,
          provider: message.provider,
          message_id: message.messageId,
        },
        undefined, // threadId - will be found/created if needed
        leadIdForDetection,
        campaignId
      ).catch(err => {
        console.error('Reply detection failed (non-blocking):', err);
      });

      return {
        inboundMessageId: inboundMessage.id,
        campaignId,
        contactId,
        intent: intent || undefined,
        autoStopped: true,
      };

    } catch (error) {
      console.error('Error processing reply:', error);
      throw error;
    }
  }

  /**
   * Update sequence enrollment status based on inbound message
   */
  private async updateEnrollmentStatus(
    workspaceId: string,
    campaignId: string | undefined,
    contactId: string | undefined,
    bodyText: string,
    subject: string | undefined,
    fromEmail: string,
    intent: ReplyIntent | null
  ): Promise<void> {
    if (!campaignId || !contactId) return;

    try {
      // Get org_id from workspace
      const { data: workspace } = await this.supabase
        .from('workspaces')
        .select('org_id')
        .eq('id', workspaceId)
        .maybeSingle();

      if (!workspace?.org_id) return;

      // Get lead_id from contact email
      const { data: contact } = await this.supabase
        .from('contacts')
        .select('email, id')
        .eq('id', contactId)
        .maybeSingle();

      if (!contact?.email) return;

      const { data: lead } = await this.supabase
        .from('leads')
        .select('id')
        .eq('org_id', workspace.org_id)
        .eq('email', contact.email.toLowerCase())
        .maybeSingle();

      if (!lead?.id) return;

      // Check for bounce
      const bounce = parseBounce(subject, bodyText, fromEmail);
      if (bounce.isBounce) {
        await this.supabase
          .from('sequence_enrollments')
          .upsert(
            {
              org_id: workspace.org_id,
              campaign_id: campaignId,
              lead_id: lead.id,
              status: 'paused_bounced',
              paused_reason: 'bounce',
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'campaign_id,lead_id' }
          );
        return;
      }

      // Check if actionable (not OOO)
      // Use classifyReplyText to get the full intent classification which includes 'ooo' and 'spam'
      let actionable = true;
      try {
        const classification = await classifyReplyText(bodyText);
        // If it's OOO or spam, not actionable (leave active)
        actionable = classification.intent !== 'ooo' && classification.intent !== 'spam';
      } catch (e) {
        // If classification fails, assume actionable (conservative approach - pause on reply)
        actionable = true;
      }

      if (actionable) {
        await this.supabase
          .from('sequence_enrollments')
          .upsert(
            {
              org_id: workspace.org_id,
              campaign_id: campaignId,
              lead_id: lead.id,
              status: 'paused_replied',
              paused_reason: 'inbound_reply',
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'campaign_id,lead_id' }
          );
      }
      // If OOO, leave active (or could be configurable)
    } catch (error) {
      console.error('Error updating enrollment status:', error);
    }
  }

  /**
   * Find matching campaign by message ID
   */
  private async findMatchingCampaign(
    workspaceId: string,
    messageId: string
  ): Promise<{ campaignId?: string; contactId?: string }> {
    // First try to find by in_reply_to in email_events
    const { data: emailEvent } = await this.supabase
      .from('email_events')
      .select('campaign_id, contact_id')
      .eq('workspace_id', workspaceId)
      .eq('message_id', messageId)
      .single();

    if (emailEvent) {
      return {
        campaignId: emailEvent.campaign_id,
        contactId: emailEvent.contact_id,
      };
    }

    // Fallback: try to find by campaign_contacts and recent sends
    const { data: campaignContact } = await this.supabase
      .from('campaign_contacts')
      .select('campaign_id, contact_id')
      .eq('workspace_id', workspaceId)
      .eq('status', 'sent')
      .order('sent_at', { ascending: false })
      .limit(1)
      .single();

    return campaignContact || {};
  }

  /**
   * Classify reply intent using AI
   */
  private async classifyIntent(bodyText: string): Promise<ReplyIntent | null> {
    try {
      const intent = await this.intentDetector.detectIntent(bodyText);
      
      return {
        category: intent.category as any,
        confidence: intent.confidence,
        actions: intent.actions,
        extractedData: intent.extractedData,
      };
    } catch (error) {
      console.error('Error classifying intent:', error);
      return null;
    }
  }

  /**
   * Auto-stop future sends for a contact
   */
  private async autoStopFutureSends(
    workspaceId: string,
    contactId: string,
    campaignId: string,
    reason: string
  ): Promise<void> {
    try {
      // Use the database function for auto-stop
      const { error } = await this.supabase.rpc('stop_future_sends', {
        p_workspace_id: workspaceId,
        p_contact_id: contactId,
        p_campaign_id: campaignId,
        p_reason: reason,
      });

      if (error) {
        console.error('Error calling stop_future_sends:', error);
      }
    } catch (error) {
      console.error('Error auto-stopping future sends:', error);
    }
  }

  /**
   * Create or update inbox thread for a reply
   */
  private async createOrUpdateInboxThread(
    workspaceId: string,
    contactId: string,
    campaignId: string,
    subject: string,
    bodyText: string
  ): Promise<void> {
    try {
      // Find existing thread or create new one
      let { data: thread } = await this.supabase
        .from('inbox_threads')
        .select('*')
        .eq('workspace_id', workspaceId)
        .eq('contact_id', contactId)
        .eq('campaign_id', campaignId)
        .eq('subject', subject)
        .maybeSingle();

      if (!thread) {
        // Create new thread
        const { data: newThread } = await this.supabase
          .from('inbox_threads')
          .insert({
            workspace_id: workspaceId,
            contact_id: contactId,
            campaign_id: campaignId,
            subject: subject,
            last_message_at: new Date().toISOString(),
            status: 'open'
          })
          .select()
          .single();
        
        thread = newThread;
      } else {
        // Update existing thread
        await this.supabase
          .from('inbox_threads')
          .update({
            last_message_at: new Date().toISOString(),
            status: 'open' // Reopen if it was closed
          })
          .eq('id', thread.id);
      }

      // Insert the reply message
      if (thread) {
        await this.supabase.from('inbox_messages').insert({
          thread_id: thread.id,
          sender: 'contact', // This will be the contact's email
          body: bodyText,
          is_incoming: true,
          sent_at: new Date().toISOString()
        });
      }
    } catch (error) {
      console.error('Error creating/updating inbox thread:', error);
    }
  }

  /**
   * Update campaign metrics
   */
  private async updateCampaignMetrics(campaignId: string, metricType: string): Promise<void> {
    try {
      // Update campaign replies count
      if (metricType === 'replies') {
        await this.supabase
          .from('campaigns')
          .update({
            replies: this.supabase.sql`COALESCE(replies, 0) + 1`
          })
          .eq('id', campaignId);
      }
    } catch (error) {
      console.error('Error updating campaign metrics:', error);
    }
  }

  /**
   * Get recent replies for a workspace
   */
  async getRecentReplies(
    workspaceId: string,
    limit: number = 50
  ): Promise<any[]> {
    const { data, error } = await this.supabase
      .from('inbox_replies_view')
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('Error fetching recent replies:', error);
      return [];
    }

    return data || [];
  }

  /**
   * Get reply statistics for a workspace
   */
  async getReplyStats(workspaceId: string): Promise<{
    totalReplies: number;
    byCategory: Record<string, number>;
    byCampaign: Record<string, number>;
    recentActivity: any[];
  }> {
    try {
      // Total replies
      const { count: totalReplies } = await this.supabase
        .from('inbound_messages')
        .select('*', { count: 'exact', head: true })
        .eq('workspace_id', workspaceId)
        .not('in_reply_to', 'is', null);

      // By category
      const { data: categoryStats } = await this.supabase
        .from('reply_intents')
        .select('category')
        .eq('workspace_id', workspaceId);

      const byCategory: Record<string, number> = {};
      if (categoryStats) {
        categoryStats.forEach((item: any) => {
          byCategory[item.category] = (byCategory[item.category] || 0) + 1;
        });
      }

      // By campaign
      const { data: campaignStats } = await this.supabase
        .from('reply_intents')
        .select('campaign_id, campaigns!inner(name)')
        .eq('workspace_id', workspaceId);

      const byCampaign: Record<string, number> = {};
      if (campaignStats) {
        campaignStats.forEach((item: any) => {
          const campaignName = item.campaigns?.name || 'Unknown';
          byCampaign[campaignName] = (byCampaign[campaignName] || 0) + 1;
        });
      }

      // Recent activity
      const recentActivity = await this.getRecentReplies(workspaceId, 10);

      return {
        totalReplies: totalReplies || 0,
        byCategory,
        byCampaign,
        recentActivity,
      };

    } catch (error) {
      console.error('Error fetching reply stats:', error);
      return {
        totalReplies: 0,
        byCategory: {},
        byCampaign: {},
        recentActivity: [],
      };
    }
  }

  /**
   * Process bulk replies (for webhook processing)
   */
  async processBulkReplies(
    workspaceId: string,
    messages: InboundMessage[]
  ): Promise<ProcessedReply[]> {
    const results: ProcessedReply[] = [];

    for (const message of messages) {
      try {
        const result = await this.processReply(workspaceId, message);
        results.push(result);
      } catch (error) {
        console.error(`Error processing message ${message.messageId}:`, error);
        results.push({
          inboundMessageId: '',
          autoStopped: false,
        });
      }
    }

    return results;
  }

  /**
   * Clean up old inbound messages
   */
  async cleanupOldMessages(workspaceId: string, daysOld: number = 90): Promise<number> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysOld);

      const { data, error } = await this.supabase
        .from('inbound_messages')
        .delete()
        .eq('workspace_id', workspaceId)
        .lt('created_at', cutoffDate.toISOString());

      if (error) {
        console.error('Error cleaning up old messages:', error);
        return 0;
      }

      return data?.length || 0;
    } catch (error) {
      console.error('Error cleaning up old messages:', error);
      return 0;
    }
  }
}

export async function getThreadStatus(threadId: string) {
  const supabase = createServerSupabaseClient();

  const { data: det, error: detectionError } = await supabase
    .from('reply_detections')
    .select('intent, subtype, confidence, created_at')
    .eq('thread_id', threadId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (detectionError) {
    console.error('Failed to load reply detection for thread', detectionError);
  }

  let autoPaused = false;
  const { data: thread, error: threadError } = await supabase
    .from('threads')
    .select('id, lead_id, campaign_id, auto_paused, resume_at')
    .eq('id', threadId)
    .maybeSingle();

  if (threadError) {
    console.warn('Failed to load thread record; attempting inbox_threads fallback', threadError);
  }

  let resumeAt: string | null = thread?.resume_at ?? null;
  let leadId: string | null = thread?.lead_id ?? null;

  if (thread && typeof thread.auto_paused !== 'undefined') {
    autoPaused = Boolean(thread.auto_paused);
  } else {
    const { data: inboxThread, error: inboxError } = await supabase
      .from('inbox_threads')
      .select('lead_id, state, auto_paused_reason, auto_paused_until')
      .eq('id', threadId)
      .maybeSingle();

    if (inboxError) {
      console.error('Failed to load inbox thread fallback', inboxError);
    }

    if (inboxThread) {
      leadId = inboxThread.lead_id ?? leadId;
      autoPaused =
        inboxThread.state === 'auto_paused' ||
        Boolean(inboxThread.auto_paused_reason) ||
        (inboxThread.auto_paused_until
          ? new Date(inboxThread.auto_paused_until).getTime() > Date.now()
          : false);
      resumeAt = inboxThread.auto_paused_until ?? resumeAt;
    }
  }

  return {
    intent: (det?.intent as ReplyStatus) ?? null,
    subtype: det?.subtype ?? null,
    confidence: typeof det?.confidence === 'number' ? det.confidence : null,
    created_at: det?.created_at ?? null,
    autoPaused,
    resume_at: resumeAt,
    lead_id: leadId,
  };
}

// Utility functions
export function createReplyProcessor(openaiApiKey?: string): ReplyProcessor {
  return new ReplyProcessor(openaiApiKey);
}

export function parseInboundMessage(payload: any, provider: 'ses' | 'mailgun' | 'mailersend'): InboundMessage {
  let message: InboundMessage;

  switch (provider) {
    case 'ses':
      message = {
        messageId: payload.MessageId || payload.messageId,
        inReplyTo: payload.InReplyTo || payload.inReplyTo,
        fromEmail: payload.From || payload.from,
        toEmail: payload.To || payload.to,
        subject: payload.Subject || payload.subject,
        bodyText: payload.TextBody || payload.textBody || payload.body,
        bodyHtml: payload.HtmlBody || payload.htmlBody,
        headers: payload.Headers || payload.headers,
        provider: 'ses',
        providerData: payload,
      };
      break;

    case 'mailgun':
      message = {
        messageId: payload['event-data']?.message?.headers?.['message-id'],
        inReplyTo: payload['event-data']?.message?.headers?.['in-reply-to'],
        fromEmail: payload['event-data']?.envelope?.sender || payload['event-data']?.from,
        toEmail: payload['event-data']?.envelope?.recipient || payload['event-data']?.to,
        subject: payload['event-data']?.message?.headers?.subject,
        bodyText: payload['event-data']?.['body-plain'] || payload['event-data']?.body,
        bodyHtml: payload['event-data']?.['body-html'],
        headers: payload['event-data']?.message?.headers,
        provider: 'mailgun',
        providerData: payload,
      };
      break;

    case 'mailersend':
      message = {
        messageId: payload.data?.id || payload.id,
        inReplyTo: payload.data?.headers?.['in-reply-to'],
        fromEmail: payload.data?.from?.email || payload.data?.from,
        toEmail: payload.data?.to?.email || payload.data?.to,
        subject: payload.data?.subject,
        bodyText: payload.data?.text || payload.data?.body,
        bodyHtml: payload.data?.html,
        headers: payload.data?.headers,
        provider: 'mailersend',
        providerData: payload,
      };
      break;

    default:
      throw new Error(`Unsupported provider: ${provider}`);
  }

  // Validate required fields
  if (!message.messageId || !message.fromEmail || !message.toEmail || !message.bodyText) {
    throw new Error('Missing required message fields');
  }

  return message;
} 