// Helper to call the reply detection edge function
// This should be called after inserting inbound messages to email_messages

import { createClient } from '@supabase/supabase-js';

/**
 * Sync an inbound message to email_messages if needed, then call detector
 */
export async function syncAndDetectReply(
  workspaceId: string,
  inboundMessage: {
    id: string;
    from_email: string;
    to_email: string;
    subject?: string | null;
    body_text?: string | null;
    body_html?: string | null;
    headers?: Record<string, any> | null;
    provider?: string;
    message_id?: string | null;
  },
  threadId?: string,
  leadId?: string,
  campaignId?: string
): Promise<void> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  try {
    // Get workspace org_id if needed
    const { data: workspace } = await supabase
      .from('workspaces')
      .select('org_id, id')
      .eq('id', workspaceId)
      .maybeSingle();

    const orgId = workspace?.org_id || workspaceId;

    // Find or create email_messages entry
    // Try to find existing by provider message_id first
    let emailMessageId: string | null = null;
    
    if (inboundMessage.message_id) {
      const { data: existing } = await supabase
        .from('email_messages')
        .select('id')
        .eq('provider', inboundMessage.provider || 'other')
        .eq('message_id', inboundMessage.message_id)
        .eq('direction', 'inbound')
        .maybeSingle();
      
      if (existing) {
        emailMessageId = existing.id;
      }
    }

    // If not found, create new email_messages entry
    if (!emailMessageId) {
      // Get thread_id if we need to create/link a thread
      let finalThreadId = threadId;
      
      if (!finalThreadId && leadId) {
        // Try to find existing thread by lead_email
        const { data: lead } = await supabase
          .from('leads')
          .select('email')
          .eq('id', leadId)
          .maybeSingle();
        
        if (lead?.email) {
          const { data: thread } = await supabase
            .from('email_threads')
            .select('id')
            .eq('lead_email', lead.email.toLowerCase())
            .eq('workspace_id', workspaceId)
            .maybeSingle();
          
          if (thread) {
            finalThreadId = thread.id;
          } else {
            // Create thread if doesn't exist
            const { data: newThread } = await supabase
              .from('email_threads')
              .insert({
                workspace_id: workspaceId,
                lead_email: lead.email.toLowerCase(),
                subject: inboundMessage.subject || null,
                last_message_at: new Date().toISOString(),
              })
              .select('id')
              .single();
            
            if (newThread) {
              finalThreadId = newThread.id;
            }
          }
        }
      }

      // Insert email_messages entry
      const { data: newMsg, error: insertErr } = await supabase
        .from('email_messages')
        .insert({
          workspace_id: workspaceId,
          team_id: workspaceId, // fallback for team_id schema
          campaign_id: campaignId || null,
          lead_id: leadId || null,
          thread_id: finalThreadId || null,
          provider: (inboundMessage.provider as any) || 'other',
          message_id: inboundMessage.message_id || null,
          direction: 'inbound',
          from_email: inboundMessage.from_email,
          to_email: [inboundMessage.to_email],
          subject: inboundMessage.subject || null,
          body_text: inboundMessage.body_text || null,
          body_html: inboundMessage.body_html || null,
          headers: inboundMessage.headers || null,
          snippet: (inboundMessage.body_text || '').slice(0, 200),
          received_at: new Date().toISOString(),
        } as any)
        .select('id')
        .single();

      if (insertErr) {
        console.error('Failed to sync to email_messages:', insertErr);
        return; // Can't proceed without email_messages entry
      }

      emailMessageId = newMsg.id;
    }

    // Now call the detector
    await callReplyDetector(orgId, emailMessageId, campaignId || null);
  } catch (error) {
    console.error('Error in syncAndDetectReply:', error);
    // Don't throw - detection is best-effort
  }
}

/**
 * Call the reply detection edge function
 */
export async function callReplyDetector(
  orgIdOrWorkspaceId: string,
  messageId: string,
  campaignId?: string | null,
  edgeFunctionUrl?: string
): Promise<void> {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!supabaseUrl) {
      console.warn('NEXT_PUBLIC_SUPABASE_URL not set, skipping reply detection');
      return;
    }

    const edgeUrl = edgeFunctionUrl || `${supabaseUrl}/functions/v1/reply_detect`;
    
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceKey) {
      console.warn('SUPABASE_SERVICE_ROLE_KEY not set, skipping reply detection');
      return;
    }
    
    const response = await fetch(edgeUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${serviceKey}`,
        'apikey': serviceKey,
      },
      body: JSON.stringify({
        org_id: orgIdOrWorkspaceId,
        workspace_id: orgIdOrWorkspaceId,
        message_id: messageId,
        campaign_id: campaignId || null,
      }),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Reply detection failed:', response.status, errorText);
      // Don't throw - detection failure shouldn't break the ingest flow
    } else {
      const result = await response.json();
      console.log('Reply detection completed:', result.label, result.confidence);
    }
  } catch (error) {
    console.error('Error calling reply detector:', error);
    // Don't throw - detection is best-effort
  }
}

