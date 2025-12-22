// supabase/functions/ingest-reply-event/index.ts
// Block 8180 — Inbound reply webhook + auto mark as replied

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars");
}

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

type ReplyPayload = {
  queueId?: string;
  campaignId?: string;
  leadId?: string | null;
  fromEmail?: string;
  subject?: string | null;
  body?: string | null;
  meta?: Record<string, unknown>;
};

type ReplyType =
  | "positive"
  | "neutral"
  | "negative"
  | "ooh"
  | "unsubscribe"
  | "unknown";

function classifyReply(body: string | null, subject: string | null): ReplyType {
  const text = `${subject ?? ""}\n${body ?? ""}`.toLowerCase();

  if (!text.trim()) return "unknown";

  if (text.includes("unsubscribe") || text.includes("remove me")) {
    return "unsubscribe";
  }

  if (
    text.includes("out of office") ||
    text.includes("automatic reply") ||
    text.includes("auto reply") ||
    text.includes("vacation responder")
  ) {
    return "ooh";
  }

  // crude positive / negative heuristics (placeholder for real AI)
  if (
    text.includes("interested") ||
    text.includes("let's talk") ||
    text.includes("sounds good") ||
    text.includes("book a call")
  ) {
    return "positive";
  }

  if (
    text.includes("not interested") ||
    text.includes("stop emailing") ||
    text.includes("do not contact")
  ) {
    return "negative";
  }

  return "unknown";
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  let payload: ReplyPayload;
  try {
    payload = (await req.json()) as ReplyPayload;
  } catch {
    return new Response(
      JSON.stringify({ ok: false, error: "Invalid JSON body" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const queueId = payload.queueId;
  const fromEmail = (payload.fromEmail ?? "").trim();

  if (!queueId) {
    return new Response(
      JSON.stringify({ ok: false, error: "queueId is required" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  if (!fromEmail) {
    return new Response(
      JSON.stringify({ ok: false, error: "fromEmail is required" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  // 1) Load the queue row
  const { data: queueRow, error: queueError } = await supabaseAdmin
    .from("campaign_send_queue")
    .select("id, campaign_id, lead_id, reply_status")
    .eq("id", queueId)
    .maybeSingle();

  if (queueError) {
    console.error("ingest-reply-event: queue lookup error:", queueError);
    return new Response(
      JSON.stringify({ ok: false, error: "Queue lookup failed" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  if (!queueRow) {
    return new Response(
      JSON.stringify({ ok: false, error: "Queue row not found" }),
      { status: 404, headers: { "Content-Type": "application/json" } },
    );
  }

  // Load campaign to get org_id
  const { data: campaign, error: campErr } = await supabaseAdmin
    .from("campaigns")
    .select("id, org_id")
    .eq("id", queueRow.campaign_id)
    .maybeSingle();

  if (campErr || !campaign) {
    console.error("ingest-reply-event: campaign lookup failed");
  }

  const subject = payload.subject ?? null;
  const body = payload.body ?? null;
  const replyType = classifyReply(body, subject);

  // 2) Insert reply event including org_id
  const { error: insertError } = await supabaseAdmin
    .from("campaign_reply_events")
    .insert({
      queue_id: queueRow.id,
      campaign_id: queueRow.campaign_id,
      org_id: campaign?.org_id ?? null,
      lead_id: queueRow.lead_id,
      from_email: fromEmail,
      subject,
      body,
      reply_type: replyType,
      meta: payload.meta ?? {},
    });

  if (insertError) {
    console.error("ingest-reply-event: insert reply error:", insertError);
    return new Response(
      JSON.stringify({ ok: false, error: "Failed to log reply" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  // 3) Auto-mark queue row as replied
  const { error: updateError } = await supabaseAdmin
    .from("campaign_send_queue")
    .update({
      reply_status: "replied",
      replied_at: new Date().toISOString(),
      last_inbound_message: body,
    })
    .eq("id", queueRow.id);

  if (updateError) {
    console.error("ingest-reply-event: update queue error:", updateError);
    return new Response(
      JSON.stringify({
        ok: false,
        error: "Reply logged but failed to mark queue row",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  return new Response(
    JSON.stringify({
      ok: true,
      replyType,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
});

