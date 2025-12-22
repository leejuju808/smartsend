import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

async function classifyReply(subject: string, body: string): Promise<{ is_human_reply: boolean; reason: string }> {
  const text = `${subject}\n\n${body}`.toLowerCase();
  const autoIndicators = [
    "out of office",
    "auto-reply",
    "autoresponder",
    "delivery status notification",
    "mail delivery subsystem",
    "undeliverable",
    "no longer works here",
    "do not reply",
    "this is an automated message",
  ];
  for (const k of autoIndicators) if (text.includes(k)) return { is_human_reply: false, reason: `heuristic:${k}` };

  const humanCues = [/^thanks/i, /\bcall\b|\bphone\b/i, /\binterested\b|\bnot interested\b/i, /\bhi\b|\bhello\b|\bhey\b/i];
  if (humanCues.some((r) => r.test(text))) return { is_human_reply: true, reason: "heuristic:cues" };

  try {
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${Deno.env.get("OPENAI_API_KEY")}` },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "You are a strict classifier. Return JSON only." },
          { role: "user", content: `Classify if this is a real human reply to a cold email. Return JSON: {\"is_human_reply\": boolean, \"reason\": string}.\n\nSubject: ${subject}\n\nBody: ${body.slice(0, 4000)}` },
        ],
        temperature: 0,
      }),
    });
    if (resp.ok) {
      const json = await resp.json();
      const content = json.choices?.[0]?.message?.content ?? "{}";
      const parsed = JSON.parse(content);
      if (typeof parsed.is_human_reply === "boolean") return parsed;
    }
  } catch (_) { /* ignore */ }

  return { is_human_reply: false, reason: "default:false" };
}

serve(async (req) => {
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });
  const secret = req.headers.get("x-reply-secret") ?? "";
  if (secret !== (Deno.env.get("REPLY_WEBHOOK_SECRET") ?? "")) return new Response("Unauthorized", { status: 401 });

  try {
    const payload = await req.json();
    const { workspace_id, campaign_id, lead_id, from_email, subject = "", body_plain = "" } = payload;
    if (!workspace_id || !from_email) return new Response(JSON.stringify({ error: "workspace_id and from_email required" }), { status: 400 });

    let targetLeadId = lead_id as string | null;
    if (!targetLeadId) {
      const { data: lead, error } = await supabase
        .from("leads")
        .select("id,status")
        .eq("workspace_id", workspace_id)
        .eq("email", String(from_email).toLowerCase())
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (!lead) return new Response(JSON.stringify({ matched: false, reason: "lead_not_found" }), { status: 200 });
      targetLeadId = lead.id;
    }

    const { is_human_reply, reason } = await classifyReply(subject, body_plain);

    await supabase.from("campaign_logs").insert({
      workspace_id,
      campaign_id: campaign_id ?? null,
      lead_id: targetLeadId,
      type: "inbound_email",
      meta: { subject, reason, is_human_reply },
    });

    if (!is_human_reply) return new Response(JSON.stringify({ matched: true, is_human_reply, reason }), { status: 200 });

    const { error: upErr } = await supabase.from("leads").update({ status: "replied" }).eq("id", targetLeadId);
    if (upErr) throw upErr;

    await supabase
      .from("send_queue")
      .update({ status: "canceled" })
      .eq("lead_id", targetLeadId)
      .in("status", ["queued", "scheduled", "retry_wait"]);

    await supabase.from("campaign_logs").insert({
      workspace_id,
      campaign_id: campaign_id ?? null,
      lead_id: targetLeadId,
      type: "auto_mark_replied",
      meta: { reason },
    });

    return new Response(JSON.stringify({ matched: true, is_human_reply, reason }), { status: 200 });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e?.message ?? e) }), { status: 500 });
  }
});

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

async function classifyReply(subject: string, body: string): Promise<{ is_human_reply: boolean; reason: string }> {
  // Lightweight heuristic first (cheap, fast). Then optional OpenAI check.
  const text = `${subject}


${body}`.toLowerCase();
  const autoIndicators = [
    "out of office",
    "auto-reply",
    "autoresponder",
    "delivery status notification",
    "mail delivery subsystem",
    "undeliverable",
    "no longer works here",
    "do not reply",
    "this is an automated message",
  ];
  for (const k of autoIndicators) if (text.includes(k)) return { is_human_reply: false, reason: `heuristic:${k}` };

  // Simple "looks like a human" cues
  const humanCues = [/^thanks/i, /\bcall\b|\bphone\b/i, /\binterested\b|\bnot interested\b/i, /\bhi\b|\bhello\b|\bhey\b/i];
  if (humanCues.some((r) => r.test(text))) return { is_human_reply: true, reason: "heuristic:cues" };

  // Optional: OpenAI classification (comment out if avoiding API usage)
  try {
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${Deno.env.get("OPENAI_API_KEY")}` },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "You are a strict classifier. Return JSON only." },
          { role: "user", content: `Classify if this is a real human reply to a cold email. Return JSON: {\"is_human_reply\": boolean, \"reason\": string}.

Subject: ${subject}
Body: ${body.slice(0, 4000)}` },
        ],
        temperature: 0,
      }),
    });
    if (resp.ok) {
      const json = await resp.json();
      const content = json.choices?.[0]?.message?.content ?? "{}";
      const parsed = JSON.parse(content);
      if (typeof parsed.is_human_reply === "boolean") return parsed;
    }
  } catch (_) { /* fall back */ }

  return { is_human_reply: false, reason: "default:false" };
}

serve(async (req) => {
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });
  const secret = req.headers.get("x-reply-secret") ?? "";
  if (secret !== (Deno.env.get("REPLY_WEBHOOK_SECRET") ?? "")) return new Response("Unauthorized", { status: 401 });

  try {
    // Expected payload from your email provider webhook/proxy
    // { workspace_id, campaign_id?, lead_id?, thread_id?, from_email, to_email, subject, body_plain }
    const payload = await req.json();
    const { workspace_id, campaign_id, lead_id, from_email, subject = "", body_plain = "" } = payload;
    if (!workspace_id || !from_email) return new Response(JSON.stringify({ error: "workspace_id and from_email required" }), { status: 400 });

    // Find lead by email if not provided
    let targetLeadId = lead_id as string | null;
    if (!targetLeadId) {
      const { data: lead, error } = await supabase
        .from("leads")
        .select("id,status")
        .eq("workspace_id", workspace_id)
        .eq("email", String(from_email).toLowerCase())
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (!lead) return new Response(JSON.stringify({ matched: false, reason: "lead_not_found" }), { status: 200 });
      targetLeadId = lead.id;
    }

    const { is_human_reply, reason } = await classifyReply(subject, body_plain);

    // Log inbound
    await supabase.from("campaign_logs").insert({
      workspace_id,
      campaign_id: campaign_id ?? null,
      lead_id: targetLeadId,
      type: "inbound_email",
      meta: { subject, reason, is_human_reply },
    });

    if (!is_human_reply) return new Response(JSON.stringify({ matched: true, is_human_reply, reason }), { status: 200 });

    // 1) Mark lead as replied
    const { error: upErr } = await supabase.from("leads").update({ status: "replied" }).eq("id", targetLeadId);
    if (upErr) throw upErr;

    // 2) Cancel future sends for this lead
    await supabase
      .from("send_queue")
      .update({ status: "canceled" })
      .eq("lead_id", targetLeadId)
      .in("status", ["queued", "scheduled", "retry_wait"]);

    // 3) Log action
    await supabase.from("campaign_logs").insert({
      workspace_id,
      campaign_id: campaign_id ?? null,
      lead_id: targetLeadId,
      type: "auto_mark_replied",
      meta: { reason },
    });

    return new Response(JSON.stringify({ matched: true, is_human_reply, reason }), { status: 200 });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e?.message ?? e) }), { status: 500 });
  }
});


