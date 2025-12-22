// Block 214: Bounce Detection Engine v1
// Handles bounce webhooks from Gmail/Outlook and classifies bounces

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

function classifyBounce(reason: string): "hard" | "soft" | "block" {
  const lower = reason.toLowerCase();

  // Hard bounce indicators
  if (
    lower.includes("user unknown") ||
    lower.includes("mailbox not found") ||
    lower.includes("invalid recipient") ||
    lower.includes("5.1.1") ||
    lower.includes("550") ||
    lower.includes("551") ||
    lower.includes("no such user") ||
    lower.includes("address not found") ||
    lower.includes("does not exist")
  ) {
    return "hard";
  }

  // Blocklisted indicators
  if (
    lower.includes("message blocked") ||
    lower.includes("spam detected") ||
    lower.includes("access denied") ||
    lower.includes("policy rejection") ||
    lower.includes("blocked") ||
    lower.includes("rejected") ||
    lower.includes("554")
  ) {
    return "block";
  }

  // Soft bounce (default for temporary issues)
  return "soft";
}

Deno.serve(async (req) => {
  try {
    const payload = await req.json();
    const { message_id, email, reason, campaign_id, lead_id } = payload;

    if (!email || !reason) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: email, reason" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const bounce_type = classifyBounce(reason);

    // Log bounce event in email_events
    // Note: email_events may have different schemas, so we'll try the most common one
    const eventData: any = {
      event_type: "bounce",
      bounce_type,
      campaign_id: campaign_id || null,
      lead_id: targetLeadId || lead_id || null,
    };

    // Add email to extra metadata or as a column if the schema supports it
    // Try to insert with extra field first (most common schema)
    eventData.extra = {
      reason,
      message_id: message_id || null,
      email: email.toLowerCase(),
    };

    const { error: eventError } = await supabase.from("email_events").insert(eventData);

    if (eventError) {
      console.error("Failed to insert bounce event:", eventError);
    }

    // Find lead by email if lead_id not provided
    let targetLeadId = lead_id;
    if (!targetLeadId && email) {
      const { data: lead } = await supabase
        .from("leads")
        .select("id")
        .eq("email", email.toLowerCase())
        .maybeSingle();
      targetLeadId = lead?.id;
    }

    // Update lead: mark as invalid and set email_status
    if (targetLeadId) {
      const { error: leadError } = await supabase
        .from("leads")
        .update({
          email_valid: false,
          email_status: bounce_type === "hard" ? "hard" : bounce_type === "block" ? "block" : "soft",
        })
        .eq("id", targetLeadId);

      if (leadError) {
        console.error("Failed to update lead:", leadError);
      }
    } else if (email) {
      // Try to update by email directly
      const { error: leadError } = await supabase
        .from("leads")
        .update({
          email_valid: false,
          email_status: bounce_type === "hard" ? "hard" : bounce_type === "block" ? "block" : "soft",
        })
        .eq("email", email.toLowerCase());

      if (leadError) {
        console.error("Failed to update lead by email:", leadError);
      }
    }

    // Mark all threads as closed for this lead
    if (targetLeadId) {
      const { error: threadError } = await supabase
        .from("reply_threads")
        .update({ state: "closed" })
        .eq("lead_id", targetLeadId);

      if (threadError) {
        console.error("Failed to close threads:", threadError);
      }
    } else if (email) {
      // Fallback: try to find lead by email and close threads
      const { data: lead } = await supabase
        .from("leads")
        .select("id")
        .eq("email", email.toLowerCase())
        .maybeSingle();

      if (lead?.id) {
        const { error: threadError } = await supabase
          .from("reply_threads")
          .update({ state: "closed" })
          .eq("lead_id", lead.id);

        if (threadError) {
          console.error("Failed to close threads by email lookup:", threadError);
        }
      }
    }

    return new Response(
      JSON.stringify({ ok: true, bounce_type, email }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Bounce ingest error:", error);
    return new Response(
      JSON.stringify({ error: String(error) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});

