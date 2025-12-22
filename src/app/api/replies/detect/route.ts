import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { classifyReplyText } from '@/lib/ai/classifyReply';
import { insertIntentSignal, getCompanyIdFromLead } from '@/lib/intent-signals';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { fromEmail, toEmail, subject, snippet, bodyText, inReplyTo } = body;

    if (!fromEmail) {
      return NextResponse.json({ error: 'fromEmail is required' }, { status: 400 });
    }

    // Find the contact/lead by email
    const { data: contact } = await supabase
      .from('contacts')
      .select('id, workspace_id')
      .eq('email', fromEmail.toLowerCase())
      .maybeSingle();

    if (!contact) {
      return NextResponse.json(
        { success: true, message: 'Contact not found - this is not a reply to a campaign' },
        { status: 200 }
      );
    }

    // Find the most recent campaign_recipients entry for this contact
    const { data: recipients } = await supabase
      .from('campaign_recipients')
      .select('id, campaign_id, contact_id')
      .eq('contact_id', contact.id)
      .order('created_at', { ascending: false })
      .limit(1);

    if (!recipients || recipients.length === 0) {
      return NextResponse.json(
        { success: true, message: 'No campaign found for this contact' },
        { status: 200 }
      );
    }

    const recipient = recipients[0];

    // Classify the reply using AI
    const textToClassify = bodyText || snippet || '';
    const classification = await classifyReplyText(textToClassify);

    // Update the campaign_recipients status
    await supabase
      .from('campaign_recipients')
      .update({
        status: 'replied',
        // Add any other fields as needed
      })
      .eq('id', recipient.id);

    // Update the contact's lead if it exists
    const { data: lead } = await supabase
      .from('leads')
      .select('id, campaign_id')
      .eq('campaign_id', recipient.campaign_id)
      .eq('email', fromEmail.toLowerCase())
      .maybeSingle();

    if (lead) {
      await supabase
        .from('leads')
        .update({
          reply_detected: true,
          reply_summary: classification.summary,
          reply_classification: classification.intent,
          status: 'replied',
          replied_at: new Date().toISOString(),
        })
        .eq('id', lead.id);

      // Generate intent signal for reply
      if (orgId) {
        const companyId = await getCompanyIdFromLead(lead.id);
        if (companyId) {
          await insertIntentSignal({
            accountId: orgId,
            companyId,
            leadId: lead.id,
            signalType: 'reply',
            weight: 5,
          });
        }
      }

      // Update campaign_leads state to 'Replied'
      await supabase
        .from("campaign_leads")
        .update({ state: "Replied" })
        .eq("lead_id", lead.id)
        .neq("state", "Replied");

      // 4d) Move pipeline stage to 'won'
      await supabase
        .from('leads')
        .update({ pipeline_stage: 'won' })
        .eq('id', lead.id);

      // 4e) Create follow-up task (one per lead)
      const ownerId = null; // set from lead/campaign owner if available in your schema
      const dueAt = nextBusinessDayISO();
      await supabase.from('follow_up_tasks').insert([
        {
          lead_id: lead.id,
          campaign_id: lead.campaign_id,
          owner_id: ownerId,
          title: 'Reply received — follow up',
          notes: `Auto-created from replyDetection. Subject: ${subject || '(no subject)'}
Classification: ${classification.intent} (conf: ${classification.confidence})`,
          status: 'open',
          due_at: dueAt,
        } as any,
      ]);
    }

    // Get org_id from campaign or lead
    let orgId = null;
    if (recipient.campaign_id) {
      const { data: campaign } = await supabase
        .from('campaigns')
        .select('org_id')
        .eq('id', recipient.campaign_id)
        .maybeSingle();
      orgId = campaign?.org_id || null;
    }
    if (!orgId && lead?.id) {
      const { data: leadData } = await supabase
        .from('leads')
        .select('org_id')
        .eq('id', lead.id)
        .maybeSingle();
      orgId = leadData?.org_id || null;
    }

    // Log the classification in campaign_logs
    await supabase
      .from('campaign_logs')
      .insert({
        lead_id: lead?.id,
        campaign_id: recipient.campaign_id,
        org_id: orgId,
        event_type: 'reply_detected',
        details: {
          from_email: fromEmail,
          to_email: toEmail,
          subject: subject,
          snippet: snippet,
          classification: classification.intent,
          confidence: classification.confidence,
          summary: classification.summary,
        },
        classification: classification.intent,
      });

    // Auto-unpause lead if resume_on_reply is enabled and lead is paused
    if (lead?.id && recipient.campaign_id) {
      try {
        const { data: camp } = await supabase
          .from("campaigns")
          .select("resume_on_reply")
          .eq("id", recipient.campaign_id)
          .maybeSingle();
        
        const { data: campaignLead } = await supabase
          .from("campaign_leads")
          .select("paused_at")
          .eq("lead_id", lead.id)
          .eq("campaign_id", recipient.campaign_id)
          .maybeSingle();

        if (camp?.resume_on_reply && campaignLead?.paused_at) {
          await supabase
            .from("campaign_leads")
            .update({
              paused_at: null,
              paused_by: null,
              pause_reason: null,
            })
            .eq("lead_id", lead.id)
            .eq("campaign_id", recipient.campaign_id);

          await supabase.from("activity_logs").insert({
            campaign_id: recipient.campaign_id,
            actor_id: null,
            lead_id: lead.id,
            event_type: "lead_resumed",
            meta: { reason: "resume_on_reply" },
          });
        }
      } catch (autoUnpauseErr) {
        console.error("Failed to auto-unpause lead:", autoUnpauseErr);
        // Don't fail if auto-unpause fails
      }
    }

    // Log "replied" event to email_events
    // Find the most recent email sent to this lead in this campaign
    if (lead?.id && recipient.campaign_id) {
      // Find variant_id from most recent send_queue or send_logs
      const { data: recentSend } = await supabase
        .from("send_queue")
        .select("variant_id")
        .eq("campaign_id", recipient.campaign_id)
        .eq("lead_id", lead.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      
      const variantId = recentSend?.variant_id || null;
      
      const { data: recentEmail } = await supabase
        .from('emails')
        .select('id')
        .eq('lead_id', lead.id)
        .eq('campaign_id', recipient.campaign_id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (recentEmail?.id) {
        await supabase.from("email_events").insert({
          email_id: recentEmail.id,
          lead_id: lead.id,
          campaign_id: recipient.campaign_id,
          variant_id: variantId,
          event_type: "replied",
          meta: { source: "ai", classification: classification.intent, confidence: classification.confidence }
        }).catch((err: any) => {
          console.error("Failed to log replied event:", err);
        });
        
        // Increment variant replies metric if variant_id exists
        if (variantId) {
          await supabase.rpc("increment_variant_metric", {
            p_variant_id: variantId,
            p_metric: "replies",
          }).catch((err: any) => {
            console.error("Failed to increment variant replies:", err);
          });
        }
        
        // Log to unified activity_log
        try {
          const { data: campaign } = await supabase
            .from('campaigns')
            .select('account_id, workspace_id, org_id')
            .eq('id', recipient.campaign_id)
            .maybeSingle();
          
          const account_id = campaign?.account_id || campaign?.workspace_id || campaign?.org_id;
          
          if (account_id) {
            await supabase.from('activity_log').insert({
              account_id,
              campaign_id: recipient.campaign_id,
              company_id: lead.company_id || null,
              lead_id: lead.id,
              event_type: 'email_reply',
              meta: { 
                source: 'ai', 
                classification: classification.intent, 
                confidence: classification.confidence,
                reply_text: body_text?.slice(0, 200) || null
              },
            });
          }
        } catch (activityErr) {
          console.error('Failed to log reply activity:', activityErr);
        }
      }
    }

    // Handle auto-stop for certain reply types
    const autoStopIntents = ['interested', 'scheduling', 'not_interested', 'unsubscribe'];
    if (autoStopIntents.includes(classification.intent)) {
      // Stop any active campaign sends for this contact
      await supabase
        .from('campaign_recipients')
        .update({ status: 'paused' })
        .eq('contact_id', contact.id)
        .in('status', ['queued', 'pending']);
    }

    return NextResponse.json({
      success: true,
      message: 'Reply detected and classified',
      classification: classification.intent,
      confidence: classification.confidence,
      summary: classification.summary,
      lead_id: lead?.id,
      campaign_id: recipient.campaign_id,
    });

  } catch (error) {
    console.error('Reply detection error:', error);
    return NextResponse.json(
      { error: 'Failed to detect reply', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// helper placed near bottom of file
function nextBusinessDayISO(d = new Date()) {
  const dt = new Date(d);
  const day = dt.getUTCDay(); // 0 Sun .. 6 Sat
  let add = 1;
  if (day === 5) add = 3; // Fri -> Mon
  else if (day === 6) add = 2; // Sat -> Mon
  dt.setUTCDate(dt.getUTCDate() + add);
  dt.setUTCHours(17, 0, 0, 0); // ~10:00am PT; adjust for your TZ/needs
  return dt.toISOString();
}
