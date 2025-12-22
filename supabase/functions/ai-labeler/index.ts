// supabase/functions/ai-labeler/index.ts
// AI Labeler Hook: Classifies inbound emails and inserts into inbox_messages
// with correct is_human flag to prevent auto-replies from triggering cancel_followups

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WEBHOOK_SECRET = Deno.env.get("REPLY_WEBHOOK_SECRET");

type AiLabel = "ooo" | "unsubscribe" | "bounce" | "positive" | "neutral" | "negative" | "other";

interface InboundPayload {
  provider: string;
  message_id: string;
  in_reply_to?: string;
  thread_id?: string;
  from: string;
  to: string | string[];
  subject: string;
  text: string;
  user_id?: string;
  campaign_id?: string;
  mailbox_id?: string;
  lead_id?: string;
}

async function classifyEmail(subject: string, body: string): Promise<AiLabel> {
  const sys = `You classify B2B cold-email replies. Output STRICT JSON with key "label".

Labels: ooo|unsubscribe|bounce|positive|neutral|negative|other

- "unsubscribe" if they explicitly ask to be removed from emails
- "ooo" for vacation/out-of-office/auto-replies
- "bounce" for delivery errors or bounce messages
- "positive" for interested/accepting replies
- "neutral" for neutral acknowledgment
- "negative" for negative/declining replies
- "other" for anything else`;

  const user = `Subject: ${subject || "(none)"}\n---\nBody:\n${body || "(empty)"}`;

  try {
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { 
        Authorization: `Bearer ${OPENAI_API_KEY}`, 
        "Content-Type": "application/json" 
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.1,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: sys },
          { role: "user", content: user }
        ]
      }),
    });

    if (!r.ok) {
      const txt = await r.text();
      throw new Error(`OpenAI error: ${r.status} ${txt}`);
    }

    const j = await r.json();
    const parsed = JSON.parse(j.choices?.[0]?.message?.content ?? "{}");
    const label = parsed.label ?? "other";
    
    // Validate label
    const validLabels: AiLabel[] = ["ooo", "unsubscribe", "bounce", "positive", "neutral", "negative", "other"];
    if (validLabels.includes(label)) {
      return label;
    }
    return "other";
  } catch (e) {
    console.error("Classification error:", e);
    return "other";
  }
}

serve(async (req) => {
  try {
    // Handle CORS preflight
    if (req.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization, x-reply-secret",
        },
      });
    }

    // Verify webhook secret if configured
    if (WEBHOOK_SECRET) {
      const secretHeader = req.headers.get("x-reply-secret") || req.headers.get("x-webhook-signature");
      if (!secretHeader || secretHeader !== WEBHOOK_SECRET) {
        return new Response(
          JSON.stringify({ ok: false, error: "unauthorized" }),
          { status: 401, headers: { "Content-Type": "application/json" } }
        );
      }
    }

    // Parse request body
    const payload: InboundPayload = await req.json();
    
    if (!payload.from || (!payload.text && !payload.subject)) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: from, and (text or subject)" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    // Classify the email
    const label = await classifyEmail(payload.subject || "", payload.text || "");

    // Determine if this is a human reply (not ooo/unsubscribe/bounce)
    const isHuman = !["ooo", "unsubscribe", "bounce"].includes(label);
    
    // Determine provider
    const provider = payload.provider || "gmail";
    if (provider !== "gmail" && provider !== "outlook") {
      return new Response(
        JSON.stringify({ error: `Unsupported provider: ${provider}` }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Normalize to_email to string
    const toEmail = Array.isArray(payload.to) ? payload.to[0] : payload.to;

    // Find or create thread if needed
    let threadId: string | null = null;
    if (payload.campaign_id && payload.lead_id) {
      // Try to find existing thread
      const { data: existingThread } = await supabase
        .from("inbox_threads")
        .select("id")
        .eq("campaign_id", payload.campaign_id)
        .eq("lead_id", payload.lead_id)
        .maybeSingle();

      if (existingThread) {
        threadId = existingThread.id;
      } else if (payload.user_id) {
        // Create new thread
        const { data: newThread, error: threadErr } = await supabase
          .from("inbox_threads")
          .insert({
            campaign_id: payload.campaign_id,
            lead_id: payload.lead_id,
            subject: payload.subject || null,
            status: "open",
          })
          .select("id")
          .single();

        if (threadErr) {
          console.error("Error creating thread:", threadErr);
        } else if (newThread) {
          threadId = newThread.id;
        }
      }
    }

    // Insert into inbox_messages with correct flags
    const { data: message, error: insertError } = await supabase
      .from("inbox_messages")
      .insert({
        user_id: payload.user_id || null,
        campaign_id: payload.campaign_id || null,
        mailbox_id: payload.mailbox_id || null,
        lead_id: payload.lead_id || null,
        thread_id: threadId,
        provider: provider,
        provider_msg_id: payload.message_id,
        provider_thread_id: payload.thread_id || null,
        direction: "in",
        from_email: payload.from,
        to_email: toEmail,
        subject: payload.subject || null,
        body_text: payload.text || null,
        is_human: isHuman, // Only true for human replies (not ooo/unsubscribe/bounce)
        reply_label: label,
        classified: { label, classified_at: new Date().toISOString() },
      })
      .select("id")
      .single();

    if (insertError) {
      console.error("Error inserting inbox_message:", insertError);
      // Check if it's a duplicate (unique constraint violation)
      if (insertError.code === "23505") {
        // Try to update existing message
        const { data: existing } = await supabase
          .from("inbox_messages")
          .select("id")
          .eq("provider", provider)
          .eq("provider_msg_id", payload.message_id)
          .maybeSingle();

        if (existing) {
          await supabase
            .from("inbox_messages")
            .update({
              is_human: isHuman,
              reply_label: label,
              classified: { label, classified_at: new Date().toISOString() },
            })
            .eq("id", existing.id);
          
          return new Response(
            JSON.stringify({ 
              ok: true, 
              message_id: existing.id,
              label,
              is_human,
              action: "updated"
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          );
        }
      }
      
      return new Response(
        JSON.stringify({ error: insertError.message }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    // Auto-suppress on unsubscribe/bounce
    if (label === "unsubscribe" || label === "bounce") {
      const emailForSuppression = (payload.from || "").toLowerCase();
      if (emailForSuppression) {
        try {
          await supabase.rpc("suppress_email", {
            p_email: emailForSuppression,
            p_reason: label,
            p_meta: { 
              message_id: payload.message_id ?? null, 
              thread_id: payload.thread_id ?? null,
              classified_at: new Date().toISOString()
            }
          });
          console.log(`Suppressed email: ${emailForSuppression}, reason: ${label}`);
        } catch (suppressErr) {
          console.error("Error suppressing email:", suppressErr);
          // Don't fail the request if suppression fails
        }
      }
    }

    // Track telemetry for auto.cancel_followups (only if human reply)
    if (isHuman && payload.campaign_id) {
      // The trigger will handle the cancel_followups and audit log
      // We just track that a human reply was processed
      console.log(`Human reply processed: ${message.id}, label: ${label}`);
    } else {
      console.log(`Auto-reply processed (no cancel): ${message.id}, label: ${label}`);
    }

    return new Response(
      JSON.stringify({ 
        ok: true, 
        message_id: message.id,
        label,
        is_human,
        action: "inserted"
      }),
      { 
        status: 200, 
        headers: { 
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        } 
      }
    );

  } catch (error: any) {
    console.error("ai-labeler error:", error);
    return new Response(
      JSON.stringify({ 
        error: "Internal server error", 
        message: error?.message || "Unknown error" 
      }),
      { 
        status: 500, 
        headers: { "Content-Type": "application/json" }
      }
    );
  }
});

