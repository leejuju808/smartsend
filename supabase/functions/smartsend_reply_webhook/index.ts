// @ts-nocheck
// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { detectReplyIntent } from "../_shared/aiReplyParser.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } }
);

Deno.serve(async (req: Request) => {
  try {
    // Handle CORS preflight
    if (req.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
        },
      });
    }

    const body = await req.json();

    // Extract info from Gmail/Outlook webhook format
    const emailText = body.text || body.body || body.bodyText || "";
    const senderEmail = body.from || body.fromEmail || body.sender;

    if (!emailText || !senderEmail) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: text and from" }),
        {
          status: 400,
          headers: { "content-type": "application/json" },
        }
      );
    }

    // Find lead by email
    const { data: lead, error: leadError } = await supabase
      .from("leads")
      .select("*")
      .eq("email", senderEmail.toLowerCase())
      .maybeSingle();

    if (!lead) {
      console.log(`No matching lead found for email: ${senderEmail}`);
      return new Response(
        JSON.stringify({ message: "No matching lead found" }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        }
      );
    }

    // Get campaign_id from lead or body
    const campaignId = lead.campaign_id || body.campaign_id;
    if (!campaignId) {
      console.log(`No campaign_id found for lead: ${lead.id}`);
      return new Response(
        JSON.stringify({ error: "No campaign_id found for lead" }),
        {
          status: 400,
          headers: { "content-type": "application/json" },
        }
      );
    }

    // AI detection
    const ai = await detectReplyIntent(emailText);

    // Insert into replies table
    const { error: replyError } = await supabase
      .from("smartsend_replies")
      .insert({
        lead_id: lead.id,
        campaign_id: campaignId,
        raw_text: emailText,
        ai_summary: ai.summary,
        ai_intent: ai.intent,
      });

    if (replyError) {
      console.error("Error inserting reply:", replyError);
    }

    // Update lead status
    const updateData: any = {
      replied_at: new Date().toISOString(),
      reply_status: ai.intent,
      status: "replied",
    };

    const { error: updateError } = await supabase
      .from("leads")
      .update(updateData)
      .eq("id", lead.id);

    if (updateError) {
      console.error("Error updating lead:", updateError);
    }

    // Pause campaign queue for this lead (cancel queued items, not sent ones)
    // Cancel items that are queued, pending, or processing - but not already sent
    const { error: queueError } = await supabase
      .from("smartsend_queue")
      .update({ status: "cancelled" })
      .eq("lead_id", lead.id)
      .in("status", ["queued", "pending", "processing", "retry"]);

    if (queueError) {
      console.error("Error cancelling queue items:", queueError);
    }

    // Log the event
    // Try to insert into system_logs first, fallback to campaign_logs
    try {
      await supabase.from("system_logs").insert({
        category: "smartsend_replies",
        level: "info",
        message: `Lead replied: ${senderEmail}`,
        context: {
          lead_id: lead.id,
          campaign_id: campaignId,
          reply_intent: ai.intent,
        },
        actor: "system",
      });
    } catch (logError) {
      // Fallback to campaign_logs if system_logs doesn't exist
      try {
        await supabase.from("campaign_logs").insert({
          campaign_id: campaignId,
          lead_id: lead.id,
          event: "reply_detected",
          type: "reply",
          meta: {
            sender_email: senderEmail,
            ai_intent: ai.intent,
            ai_summary: ai.summary,
          },
        });
      } catch (campaignLogError) {
        console.error("Error logging reply event:", campaignLogError);
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        message: "Reply processed",
        lead_id: lead.id,
        campaign_id: campaignId,
        intent: ai.intent,
      }),
      {
        status: 200,
        headers: {
          "content-type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  } catch (error) {
    console.error("smartsend_reply_webhook error:", error);
    return new Response(
      JSON.stringify({ error: String(error) }),
      {
        status: 500,
        headers: { "content-type": "application/json" },
      }
    );
  }
});

