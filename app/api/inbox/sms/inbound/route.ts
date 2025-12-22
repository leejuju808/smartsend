// API endpoint for inbound SMS webhook (Twilio) - Inbox System
// POST /api/inbox/sms/inbound
// Handles inbound SMS and creates inbox_messages records

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { normalizePhoneNumber } from "@/lib/providers/sms";
import { insertUnifiedMessage, getCompanyIdFromWorkspace } from "@/lib/unified-messages";
import { classifyReplyHotWarmDeadV1 } from "@/lib/replyDetection/hotWarmDead";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    // Parse Twilio webhook form data
    const formData = await req.formData();
    const from = formData.get("From") as string;
    const to = formData.get("To") as string;
    const body = formData.get("Body") as string;
    const messageSid = formData.get("MessageSid") as string;

    if (!from || !to || !body) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Normalize phone numbers
    const normalizedFrom = normalizePhoneNumber(from);
    const normalizedTo = normalizePhoneNumber(to);

    if (!normalizedFrom || !normalizedTo) {
      return NextResponse.json(
        { error: "Invalid phone number format" },
        { status: 400 }
      );
    }

    // Find workspace by SMS number (from workspace_settings)
    // Query all workspace_settings and filter in code since JSONB contains doesn't work well with nested paths
    const { data: allWorkspaceSettings } = await supabase
      .from("workspace_settings")
      .select("workspace_id, settings");

    const workspaceSettings = allWorkspaceSettings?.find(
      (ws) => ws.settings?.sms?.phone_number === normalizedTo
    );

    if (!workspaceSettings) {
      console.error("Workspace not found for SMS number:", normalizedTo);
      // Return success to Twilio to avoid retries
      return new NextResponse(
        '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
        { headers: { "Content-Type": "application/xml" } }
      );
    }

    const workspaceId = workspaceSettings.workspace_id;

    // Check if phone number has opted out
    const { data: isOptedOut } = await supabase.rpc("is_sms_opted_out", {
      p_workspace_id: workspaceId,
      p_phone_number: normalizedFrom,
    });

    if (isOptedOut) {
      // Return success but don't process
      return new NextResponse(
        '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
        { headers: { "Content-Type": "application/xml" } }
      );
    }

    // Find or create contact
    let contactId = null;
    const { data: existingContact } = await supabase
      .from("contacts")
      .select("id")
      .eq("phone", normalizedFrom)
      .eq("workspace_id", workspaceId)
      .maybeSingle();

    if (existingContact) {
      contactId = existingContact.id;
    } else {
      // Create new contact from SMS
      const { data: newContact } = await supabase
        .from("contacts")
        .insert({
          phone: normalizedFrom,
          workspace_id: workspaceId,
          sms_opt_out: false,
        })
        .select("id")
        .single();

      contactId = newContact?.id || null;
    }

    // Find or create inbox thread (one thread per contact per campaign)
    // For SMS, we'll use a default campaign or create a thread without campaign
    let threadId = null;
    
    // Try to find existing thread for this contact
    const { data: existingThread } = await supabase
      .from("inbox_threads")
      .select("id, campaign_id")
      .eq("contact_id", contactId)
      .order("last_message_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingThread) {
      threadId = existingThread.id;
    } else {
      // Create new inbox thread
      // We need a campaign_id - try to find a default campaign or use null
      const { data: defaultCampaign } = await supabase
        .from("campaigns")
        .select("id")
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const { data: newThread } = await supabase
        .from("inbox_threads")
        .insert({
          contact_id: contactId,
          campaign_id: defaultCampaign?.id || null,
          last_message_at: new Date().toISOString(),
          status: "open",
        })
        .select("id")
        .single();

      threadId = newThread?.id || null;
    }

    // Create inbound SMS message record
    const { data: messageRecord, error: messageError } = await supabase
      .from("inbox_messages")
      .insert({
        thread_id: threadId,
        campaign_id: existingThread?.campaign_id || null,
        contact_id: contactId,
        channel: "sms",
        from_phone: normalizedFrom,
        to_phone: normalizedTo,
        from_email: null,
        to_email: null,
        subject: null,
        body_raw: body,
        body_clean: body,
        received_at: new Date().toISOString(),
        sms_provider_message_id: messageSid,
        sms_delivery_status: "delivered", // Inbound messages are considered delivered
        status: "unread",
        // Block 268200: inbound is never automation-tagged
        automation_tag: null,
        automation_meta: {},
      })
      .select()
      .single();

    if (messageError) {
      console.error("Error creating inbox message record:", messageError);
      // Still return success to Twilio
    }

    // Update thread's last_message_at and last_channel
    if (threadId) {
      const hw = classifyReplyHotWarmDeadV1(body);
      const nowIso = new Date().toISOString();

      // Owner Attention Filter (v1): hot/warm stay visible, dead is removed (lead_stage=lost)
      const threadPatch: any = {
        last_message_at: nowIso,
        last_channel: "sms",
        updated_at: nowIso,
        // Block 268200: stop follow-up chain instantly on inbound reply
        autofollowup_anchor_at: null,
        autofollowup_step: 0,
        autofollowup_last_sent_at: null,
        next_action_at: null,
      };

      if (hw === "hot") {
        threadPatch.engagement_level = "hot";
      } else if (hw === "warm") {
        threadPatch.engagement_level = "warm";
      } else if (hw === "dead") {
        threadPatch.lead_stage = "lost";
        threadPatch.status = "closed";
      }

      await supabase
        .from("inbox_threads")
        .update(threadPatch)
        .eq("id", threadId);
    }

    // Log to SMS QA logs
    if (messageRecord?.id) {
      await supabase.from("sms_qa_logs").insert({
        message_id: messageRecord.id,
        workspace_id: workspaceId,
        direction: "inbound",
        phone_number: normalizedFrom,
        body: body,
      });
    }

    // Block 150000: Insert into unified messages table
    try {
      const companyId = await getCompanyIdFromWorkspace(workspaceId);
      if (companyId && contactId) {
        // Get lead_id from contact
        const { data: contact } = await supabase
          .from("contacts")
          .select("id, phone, email, first_name, last_name")
          .eq("id", contactId)
          .maybeSingle();

        // Try to find lead by phone or email
        let leadId = null;
        if (contact) {
          const { data: lead } = await supabase
            .from("leads")
            .select("id")
            .or(`phone.eq.${normalizedFrom},email.eq.${contact.email}`)
            .eq("roofing_company_id", companyId)
            .limit(1)
            .maybeSingle();
          leadId = lead?.id || null;
        }

        // Block 268200: mirror hot/warm/dead onto leads.outreach_status when we can resolve a lead_id
        if (leadId) {
          const nowIso = new Date().toISOString();
          const hw = classifyReplyHotWarmDeadV1(body);
          const updates: any =
            hw === "dead"
              ? { outreach_status: "dead", reason_dead: "stop_reply", last_reply_at: nowIso, do_not_contact: true }
              : hw === "hot"
              ? { outreach_status: "hot", reason_dead: null, last_reply_at: nowIso }
              : { outreach_status: "warm", reason_dead: null, last_reply_at: nowIso };
          await supabase.from("leads").update(updates).eq("id", leadId);
        }

        const senderName = contact?.first_name || contact?.last_name
          ? `${contact.first_name || ""} ${contact.last_name || ""}`.trim()
          : contact?.phone || normalizedFrom;

        await insertUnifiedMessage({
          company_id: companyId,
          lead_id: leadId,
          channel: "sms",
          direction: "incoming",
          sender: senderName,
          sender_phone: normalizedFrom,
          body: body,
          metadata: {
            sms_provider_message_id: messageSid,
            contact_id: contactId,
            workspace_id: workspaceId,
            hot_warm_dead_v1: classifyReplyHotWarmDeadV1(body),
          },
          external_id: messageSid || null,
        });
      }
    } catch (unifiedError) {
      console.warn("Failed to insert unified message for SMS:", unifiedError);
      // Don't throw - unified message insertion failure shouldn't break SMS processing
    }

    // Check for auto-reply (after hours)
    const smsSettings = workspaceSettings.settings?.sms;
    if (smsSettings?.auto_reply_enabled) {
      const now = new Date();
      const hour = now.getHours();
      const businessHours = smsSettings.business_hours || { start: 9, end: 17 };
      
      if (hour < businessHours.start || hour >= businessHours.end) {
        // After hours - send auto-reply
        const autoReplyMessage = smsSettings.after_hours_message || 
          "Got your message — we'll reach out first thing in the morning. If it's urgent, reply URGENT.";
        
        // Queue auto-reply SMS (we'll send it via the send endpoint)
        // For now, just log it - actual sending will be handled by auto-reply system
      }
    }

    // Return empty TwiML response (auto-replies handled separately)
    return new NextResponse(
      '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
      { headers: { "Content-Type": "application/xml" } }
    );
  } catch (error: any) {
    console.error("Error processing inbound SMS:", error);
    // Return success to Twilio to avoid retries
    return new NextResponse(
      '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
      { headers: { "Content-Type": "application/xml" } }
    );
  }
}

