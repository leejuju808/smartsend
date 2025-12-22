// API endpoint for inbound SMS webhook (Twilio)
// POST /api/sms/inbound

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { detectOptOutKeywords, normalizePhoneNumber } from "@/lib/providers/sms";

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

    // Find organization by SMS number
    const { data: org, error: orgError } = await supabase
      .from("organizations")
      .select("id, sms_number")
      .eq("sms_number", normalizedTo)
      .maybeSingle();

    if (orgError || !org) {
      console.error("Organization not found for SMS number:", normalizedTo);
      // Return success to Twilio to avoid retries, but log the error
      return new NextResponse(
        '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
        { headers: { "Content-Type": "application/xml" } }
      );
    }

    const orgId = org.id;

    // Check for opt-out keywords
    const optOutCheck = detectOptOutKeywords(body);
    if (optOutCheck.isOptOut) {
      // Handle opt-out
      await supabase.rpc("handle_sms_opt_out", {
        p_phone: normalizedFrom,
        p_org_id: orgId,
        p_reason: optOutCheck.keyword || "stop",
      });

      // Send confirmation message
      return new NextResponse(
        '<?xml version="1.0" encoding="UTF-8"?><Response><Message>You have been unsubscribed from SMS messages. Reply START to resubscribe.</Message></Response>',
        { headers: { "Content-Type": "application/xml" } }
      );
    }

    // Find or create contact
    let contactId = null;
    const { data: existingContact } = await supabase
      .from("contacts")
      .select("id")
      .eq("phone", normalizedFrom)
      .eq("org_id", orgId)
      .maybeSingle();

    if (existingContact) {
      contactId = existingContact.id;
    } else {
      // Create new contact from SMS
      const { data: newContact } = await supabase
        .from("contacts")
        .insert({
          phone: normalizedFrom,
          org_id: orgId,
          sms_opt_out: false,
        })
        .select("id")
        .single();

      contactId = newContact?.id || null;
    }

    // Find or create SMS thread
    let threadId = null;
    const { data: existingThread } = await supabase
      .from("reply_threads")
      .select("id")
      .eq("lead_id", contactId)
      .eq("channel", "sms")
      .maybeSingle();

    if (existingThread) {
      threadId = existingThread.id;
    } else {
      // Create new SMS thread
      const { data: newThread } = await supabase
        .from("reply_threads")
        .insert({
          lead_id: contactId,
          channel: "sms",
          last_message_at: new Date().toISOString(),
          last_direction: "inbound",
          unread: true,
        })
        .select("id")
        .single();

      threadId = newThread?.id || null;
    }

    // Create inbound message record
    const { data: messageRecord, error: messageError } = await supabase
      .from("messages")
      .insert({
        thread_id: threadId,
        direction: "inbound",
        channel: "sms",
        phone: normalizedFrom,
        body_text: body,
        from_email: null,
        to_email: null,
        subject: null,
        external_id: messageSid,
        sent_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (messageError) {
      console.error("Error creating message record:", messageError);
    }

    // Update thread
    if (threadId) {
      await supabase
        .from("reply_threads")
        .update({
          last_message_at: new Date().toISOString(),
          last_direction: "inbound",
          unread: true,
        })
        .eq("id", threadId);
    }

    // Block 37990: Check for change order approval (YES reply)
    const normalizedBody = body.toLowerCase().trim();
    const isApprovalMessage = 
      normalizedBody === "yes" || 
      normalizedBody === "y" || 
      normalizedBody === "approve" ||
      /^yes\s*$/i.test(normalizedBody) ||
      /^y\s*$/i.test(normalizedBody) ||
      /^approve\s*$/i.test(normalizedBody) ||
      /^ok\s*$/i.test(normalizedBody) ||
      /^sure\s*$/i.test(normalizedBody);

    if (isApprovalMessage && contactId) {
      // Find lead by contact
      const { data: lead } = await supabase
        .from("leads")
        .select("id")
        .eq("id", contactId)
        .maybeSingle();

      if (lead) {
        // Find most recent pending change order for this lead
        const { data: pendingCO } = await supabase
          .from("change_orders")
          .select(`
            id,
            job_id,
            amount,
            jobs!inner (
              id,
              lead_id
            )
          `)
          .eq("status", "pending")
          .eq("jobs.lead_id", lead.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (pendingCO) {
          // Approve the change order (trigger will update job contract value)
          await supabase
            .from("change_orders")
            .update({
              status: "approved",
              approved_at: new Date().toISOString(),
            })
            .eq("id", pendingCO.id);

          // Send confirmation (async, don't wait)
          fetch(`${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/sms/send`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              to: normalizedFrom,
              message: `Thank you! Change order approved for $${pendingCO.amount.toFixed(2)}. Your contract has been updated.`,
              org_id: orgId,
            }),
          }).catch(err => console.error("Error sending confirmation SMS:", err));
        }
      }
    }

    // Log activity to v3 contact_activity table (Block 13500)
    if (contactId) {
      const { logSMSReceivedV3 } = await import("@/lib/contactActivityV3");
      await logSMSReceivedV3(contactId, {
        messageText: body,
        createdBy: null, // System-generated
      });
    }

    // Classify SMS intent using AI (async, don't wait)
    if (messageRecord?.id) {
      // Queue intent classification job
      supabase
        .from("jobs")
        .insert({
          type: "sms_intent_classify",
          payload: { message_id: messageRecord.id },
          status: "queued",
          run_at: new Date().toISOString(),
        })
        .then(() => {
          console.log("Queued SMS intent classification for message:", messageRecord.id);
        })
        .catch((err) => {
          console.error("Error queueing SMS intent classification:", err);
        });
    }

    // Return empty TwiML response (no auto-reply in V1)
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


