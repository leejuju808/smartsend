// supabase/functions/ingest-inbound-email/index.ts
// Block 404 — Reply Detection Engine v1
// Entry point for email provider webhooks to detect replies

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.0";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

// Helper function to strip HTML tags
function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

interface InboundPayload {
  from: string;
  to: string;
  subject: string;
  text?: string;
  html?: string;
  provider_message_id?: string;
  provider_thread_id?: string;
  in_reply_to?: string | null;
  references?: string | null;
  raw_headers?: Record<string, any>;
}

Deno.serve(async (req) => {
  try {
    const payload: InboundPayload = await req.json();

    const {
      from,
      to,
      subject,
      text,
      html,
      provider_message_id,
      provider_thread_id,
      in_reply_to,
      references,
      raw_headers
    } = payload;

    // 1. Try to match this to an outbound email via In-Reply-To or References
    let outboundMatch = null;

    if (in_reply_to) {
      const { data } = await supabase
        .from("email_events")
        .select("id, lead_id, campaign_id")
        .eq("provider_message_id", in_reply_to)
        .eq("direction", "outbound")
        .limit(1)
        .maybeSingle();

      outboundMatch = data;
    }

    if (!outboundMatch && references) {
      const refs = references.split(/\s+/).filter(r => r.trim().length > 0);
      if (refs.length > 0) {
        const { data } = await supabase
          .from("email_events")
          .select("id, lead_id, campaign_id, provider_message_id")
          .in("provider_message_id", refs)
          .eq("direction", "outbound")
          .limit(1)
          .maybeSingle();

        outboundMatch = data;
      }
    }

    // 2. Insert inbound event regardless, but if we matched, link to lead/campaign
    const { data: replyEvent, error: insertError } = await supabase
      .from("email_events")
      .insert({
        direction: "inbound",
        event_type: "reply",
        provider_message_id: provider_message_id || null,
        provider_thread_id: provider_thread_id || null,
        raw_headers: raw_headers || null,
        from_address: from,
        to_address: to,
        subject: subject || null,
        body_text: text || null,
        body_html: html || null,
        lead_id: outboundMatch?.lead_id ?? null,
        campaign_id: outboundMatch?.campaign_id ?? null
      })
      .select()
      .single();

    if (insertError) {
      console.error("Failed to insert reply event:", insertError);
      throw insertError;
    }

    // 3. If we couldn't match, stop here (still logged for manual review)
    if (!outboundMatch?.lead_id || !outboundMatch?.campaign_id) {
      return new Response(JSON.stringify({ ok: true, matched: false }), {
        headers: { "Content-Type": "application/json" }
      });
    }

    const leadId = outboundMatch.lead_id;
    const campaignId = outboundMatch.campaign_id;

    // 4. Mark lead + campaign_leads as replied (idempotent)
    const now = new Date().toISOString();

    await supabase
      .from("leads")
      .update({ replied_at: now })
      .eq("id", leadId)
      .is("replied_at", null); // ignore if already set

    await supabase
      .from("campaign_leads")
      .update({
        is_replied: true,
        replied_at: now,
        last_reply_event_id: replyEvent.id
      })
      .eq("lead_id", leadId)
      .eq("campaign_id", campaignId);

    // 5. Auto-pause future scheduled steps
    // Try send_queue first - pause items that haven't been sent yet
    await supabase
      .from("send_queue")
      .update({ is_paused: true })
      .eq("lead_id", leadId)
      .eq("campaign_id", campaignId)
      .is("sent_at", null); // only unsent future steps

    // Also try campaign_step_queue if it exists
    const { error: stepQueueError } = await supabase
      .from("campaign_step_queue")
      .update({ is_paused: true })
      .eq("lead_id", leadId)
      .eq("campaign_id", campaignId)
      .is("sent_at", null);

    // Ignore error if table doesn't exist
    if (stepQueueError && !stepQueueError.message.includes("does not exist")) {
      console.warn("campaign_step_queue update error:", stepQueueError);
    }

    // 6. Trigger Reply Intent AI Classifier (Block 438)
    // Fire-and-forget: don't await to avoid blocking the response
    const replyBody = text || (html ? stripHtml(html) : "");
    if (replyBody && replyEvent.id && leadId) {
      fetch(`${supabaseUrl}/functions/v1/reply-intent`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${supabaseServiceRoleKey}`,
        },
        body: JSON.stringify({
          text: replyBody,
          event_id: replyEvent.id,
          lead_id: leadId,
        }),
      }).catch((err) => {
        console.error("Failed to trigger reply-intent classifier:", err);
        // Don't throw - classification failure shouldn't break reply ingestion
      });
    }

    return new Response(JSON.stringify({ ok: true, matched: true }), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    console.error("ingest-inbound-email error", err);
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
});

