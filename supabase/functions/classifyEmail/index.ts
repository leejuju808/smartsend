// Deno Deploy — Supabase Edge Function

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type Inbound = {
  teamId: string;
  campaignId?: string | null;
  leadId?: string | null;
  subject?: string | null;
  bodyText?: string | null;
  bodyHtml?: string | null;
  fromEmail?: string | null;
  toEmail?: string[] | null;
  provider?: "gmail" | "outlook" | "smtp" | "other";
  threadId?: string | null;
  messageId?: string | null;
};

const OOO_PATTERNS = [
  "out of office", "auto-reply", "autoresponder", "automatic reply",
  "away from the office", "vacation reply"
];
const BOUNCE_PATTERNS = [
  "delivery has failed", "undeliverable", "delivery status notification",
  "address not found", "mailbox unavailable", "550 5.1.1"
];
const UNSUB_PATTERNS = ["unsubscribe", "remove me", "opt out", "stop emailing", "do not contact"];

function containsAny(hay: string, needles: string[]) {
  const lower = hay.toLowerCase();
  return needles.some(n => lower.includes(n));
}

async function aiIsHumanReply(text: string): Promise<boolean> {
  const key = Deno.env.get("OPENAI_API_KEY");
  if (!key) {
    // No AI available → conservative default: treat short conversational replies as human
    return text.trim().split(/\s+/).length >= 2 && !containsAny(text, [...OOO_PATTERNS, ...BOUNCE_PATTERNS]);
  }

  const prompt = `
Decide if the following email text is a genuine human reply to a cold email (not OOO, bounce, spam, or unsubscribe).

Respond with exactly "YES" or "NO".

Email:

"""${text.slice(0, 8000)}"""
  `.trim();

  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0,
    })
  });
  const data = await resp.json();
  const content = data?.choices?.[0]?.message?.content?.toString().trim().toUpperCase() || "NO";
  return content.includes("YES");
}

Deno.serve(async (req) => {
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const payload = await req.json() as Inbound;

    const body = (payload.bodyText || payload.bodyHtml || "").toString();
    const subj = (payload.subject || "").toString();
    const joined = `${subj}\n\n${body}`;

    const isOOO = containsAny(joined, OOO_PATTERNS);
    const isBounce = containsAny(joined, BOUNCE_PATTERNS);
    const isUnsub = containsAny(joined, UNSUB_PATTERNS);

    let label: string = "unknown";
    let human = false;

    if (isBounce) {
      label = "bounce";
    } else if (isOOO) {
      label = "ooo";
    } else if (isUnsub) {
      label = "unsubscribe";
    } else {
      human = await aiIsHumanReply(joined);
      label = human ? "human" : "unknown";
    }

    // Store the message (direction = inbound)
    const { data, error } = await supabase
      .from("email_messages")
      .insert({
        team_id: payload.teamId,
        campaign_id: payload.campaignId || null,
        lead_id: payload.leadId || null,
        provider: payload.provider || "other",
        thread_id: payload.threadId || null,
        message_id: payload.messageId || null,
        direction: "inbound",
        from_email: payload.fromEmail || null,
        to_email: payload.toEmail || null,
        subject: payload.subject || null,
        body_text: payload.bodyText || null,
        body_html: payload.bodyHtml || null,
        headers: null,
        classification_label: label,
        human_reply: human,
        ooo: isOOO,
        unsubscribe: isUnsub,
        bounce: isBounce,
        spam: false,
      })
      .select("id, human_reply, classification_label")
      .single();

    if (error) throw new Error(error.message);

    // If it was a real reply, trigger Stripe seat sync is NOT needed here; just lead status trigger fires.
    return new Response(JSON.stringify({ ok: true, result: data }), {
      headers: { "Content-Type": "application/json" }
    });

  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
  }
});
