import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createReplyProcessor, parseInboundMessage } from '@/lib/replies';
import { classifyLeadIntent } from '@/lib/ai/classifyLeadIntent';

export async function POST(request: NextRequest) {
  try {
    // Verify webhook signature if provided
    const webhookSecret = process.env.INBOUND_WEBHOOK_SECRET;
    if (webhookSecret) {
      const signature = request.headers.get('x-webhook-signature');
      if (!signature || signature !== webhookSecret) {
        return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
      }
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Parse the webhook payload
    const body = await request.json();
    
    // Determine provider from headers or payload
    let provider: 'ses' | 'mailgun' | 'mailersend' = 'ses';
    if (request.headers.get('x-mailgun-signature')) {
      provider = 'mailgun';
    } else if (body.type === 'email.received') {
      provider = 'mailersend';
    }

    // Parse the inbound message using the new system
    let message;
    try {
      message = parseInboundMessage(body, provider);
    } catch (error) {
      console.error('Error parsing inbound message:', error);
      return NextResponse.json({ 
        error: 'Invalid message format',
        details: error instanceof Error ? error.message : 'Unknown error'
      }, { status: 400 });
    }

    // Find the workspace by the recipient email
    const { data: workspace } = await supabase
      .from('workspaces')
      .select('id, name')
      .eq('from_email', message.toEmail.toLowerCase())
      .or(`from_email.eq.${message.toEmail.toLowerCase()}`)
      .single();

    if (!workspace) {
      return NextResponse.json({ 
        success: true, 
        message: 'No matching workspace found for this recipient' 
      });
    }

    // Process the reply using the new ReplyProcessor
    const replyProcessor = createReplyProcessor(process.env.OPENAI_API_KEY);
    const result = await replyProcessor.processReply(workspace.id, message);

    // Classify lead intent (Block 10500 - Lead Brain v1)
    let leadIntentClassification = null;
    try {
      if (result.inboundMessageId) {
        // Find the inbound message to get lead_id and campaign_id
        const { data: inboundMessage } = await supabase
          .from('inbound_messages')
          .select('id, lead_id, campaign_id')
          .eq('id', result.inboundMessageId)
          .single();

        if (inboundMessage) {
          // Classify the message
          const classification = await classifyLeadIntent(
            message.bodyText,
            message.subject
          );

          // Get lead_id if not already set
          let leadId = inboundMessage.lead_id;
          if (!leadId && result.contactId) {
            leadId = await getLeadIdFromContact(supabase, result.contactId);
          }

          // Save classification to lead_intents table
          const { error: intentError } = await supabase
            .from('lead_intents')
            .insert({
              workspace_id: workspace.id,
              message_id: inboundMessage.id,
              lead_id: leadId,
              campaign_id: inboundMessage.campaign_id || result.campaignId || null,
              classification: classification.classification,
              confidence: classification.confidence,
            });

          if (intentError) {
            console.error('Error saving lead intent:', intentError);
          } else {
            leadIntentClassification = classification.classification;

            // Trigger auto-actions based on classification
            await handleClassificationActions(
              supabase,
              workspace.id,
              classification.classification,
              leadId,
              inboundMessage.campaign_id || result.campaignId
            );
          }
        }
      }
    } catch (error) {
      console.error('Error classifying lead intent:', error);
      // Don't fail the request if classification fails
    }

    // Return success response
    return NextResponse.json({
      success: true,
      message: 'Reply processed successfully',
      workspace: workspace.name,
      inbound_message_id: result.inboundMessageId,
      campaign_id: result.campaignId,
      contact_id: result.contactId,
      intent_category: result.intent?.category,
      intent_confidence: result.intent?.confidence,
      lead_intent_classification: leadIntentClassification,
      auto_stopped: result.autoStopped,
    });

  } catch (error) {
    console.error('Inbound webhook error:', error);
    return NextResponse.json(
      { error: 'Failed to process inbound email' },
      { status: 500 }
    );
  }
}

// Helper function to get lead_id from contact_id
async function getLeadIdFromContact(
  supabase: any,
  contactId: string | undefined
): Promise<string | null> {
  if (!contactId) return null;

  const { data: contact } = await supabase
    .from('contacts')
    .select('email')
    .eq('id', contactId)
    .single();

  if (!contact?.email) return null;

  const { data: lead } = await supabase
    .from('leads')
    .select('id')
    .eq('email', contact.email.toLowerCase())
    .maybeSingle();

  return lead?.id || null;
}

// Handle auto-actions based on classification
async function handleClassificationActions(
  supabase: any,
  workspaceId: string,
  classification: string,
  leadId: string | null,
  campaignId: string | null
): Promise<void> {
  try {
    // NOT_INTERESTED → stop campaign
    if (classification === 'NOT_INTERESTED' && leadId && campaignId) {
      // Pause the lead in this campaign
      await supabase.rpc('fn_autopause_lead', {
        p_campaign: campaignId,
        p_lead: leadId,
      });
    }

    // HOT → mark as hot lead (could trigger notifications)
    if (classification === 'HOT' && leadId) {
      // Update lead status or create hot lead event
      await supabase
        .from('leads')
        .update({ status: 'hot' })
        .eq('id', leadId);
    }

    // OUT_OF_SCOPE → archive or mark as invalid
    if (classification === 'OUT_OF_SCOPE' && leadId && campaignId) {
      // Pause lead to prevent further emails
      await supabase.rpc('fn_autopause_lead', {
        p_campaign: campaignId,
        p_lead: leadId,
      });
    }
  } catch (error) {
    console.error('Error handling classification actions:', error);
  }
} 