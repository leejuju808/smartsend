// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import OpenAI from "npm:openai@4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;

const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

type DraftRequest = {
  thread_id?: string;
  message_id?: string;
  tone?: string;
  slot_minutes?: number;
};

type MeetingIntent = {
  summary?: string | null;
  lead_tz?: string | null;
  my_tz?: string | null;
  cal_link?: string | null;
  slots?: Array<Record<string, any>> | null;
};

function formatSlotLines(intent: MeetingIntent | null, slotMinutes: number): string {
  if (!intent?.slots || !Array.isArray(intent.slots) || intent.slots.length === 0) {
    return "• (no parsed slots — propose 2 business times)";
  }

  const leadTz = intent.lead_tz || "America/New_York";
  const lines: string[] = [];

  for (const slot of intent.slots.slice(0, 2)) {
    const startIso = typeof slot?.start_iso === "string" ? slot.start_iso : null;
    if (!startIso) continue;
    const start = new Date(startIso);
    if (Number.isNaN(start.getTime())) continue;
    const label = start.toLocaleString("en-US", {
      timeZone: leadTz,
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
    lines.push(`• ${label} (${leadTz})`);
    if (lines.length >= 2) break;
  }

  if (lines.length === 0) {
    return "• (no parsed slots — propose 2 business times)";
  }

  return lines.join("\n");
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  try {
    const { thread_id, message_id, tone = "concise", slot_minutes = 30 } =
      (await req.json().catch(() => ({}))) as DraftRequest;

    if (!thread_id && !message_id) {
      return new Response("Missing thread_id or message_id", { status: 400 });
    }

    const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    const { data: msg, error: messageError } = await sb
      .from("inbox_messages")
      .select(
        "id, thread_id, campaign_id, lead_id, direction, subject, body_text, body_html, ai_label, created_at",
      )
      .eq(message_id ? "id" : "thread_id", message_id ?? thread_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (messageError || !msg) {
      return new Response("Message not found", { status: 404 });
    }

    if (msg.direction !== "inbound") {
      return new Response("Not inbound", { status: 400 });
    }

    const [{ data: intent }, { data: campaign, error: campaignError }] = await Promise.all([
      sb
        .from("meeting_intents")
        .select("summary, lead_tz, my_tz, cal_link, slots")
        .eq("thread_id", msg.thread_id)
        .maybeSingle(),
      sb
        .from("campaigns")
        .select("id, name, meta, user_id, billing_account_id")
        .eq("id", msg.campaign_id)
        .single(),
    ]);

    if (campaignError) {
      return new Response("Campaign not found", { status: 404 });
    }

    let billingAccountId = campaign?.billing_account_id ?? null;
    if (!billingAccountId && campaign?.user_id) {
      const { data: fallbackAccount, error: fallbackError } = await sb
        .from("billing_accounts")
        .select("id")
        .eq("user_id", campaign.user_id)
        .maybeSingle();
      if (fallbackError) {
        console.error("billing account lookup failed", fallbackError);
      }
      billingAccountId = fallbackAccount?.id ?? null;
    }

    if (!billingAccountId) {
      return new Response("Billing account required", { status: 402 });
    }

    const { data: entitlements, error: entError } = await sb.rpc("get_entitlements", {
      p_user_id: campaign?.user_id ?? null,
    });
    if (entError) {
      console.error("get_entitlements failed", entError);
      throw new Error(entError.message);
    }

    const usedAi = Number(entitlements?.used_ai_actions ?? 0);
    const aiCap = Number(entitlements?.monthly_ai_actions ?? 0);
    if (aiCap <= 0 || usedAi >= aiCap) {
      return new Response(JSON.stringify({ ok: false, reason: "quota_exceeded" }), {
        status: 402,
        headers: { "content-type": "application/json" },
      });
    }

    const baseText = msg.body_text || msg.body_html || msg.subject || "";
    const text = baseText.slice(0, 6000);
    const slotLines = formatSlotLines(intent as MeetingIntent, slot_minutes ?? 30);

    const systemPrompt = `You write short, helpful email replies for a cold outreach conversation.
- Keep it ${tone} and friendly.
- If the sender proposes meeting times or asks to schedule, confirm 1–2 options (below) and offer a calendar link if present.
- Avoid fluff. Max ~150 words. One clear CTA.
- Keep subject simple (<=60 chars).`;

    const userPrompt = `Original inbound (trimmed):
"""
${text}
"""

Context:
- Campaign: ${campaign?.name ?? "-"}
- Meeting summary: ${intent?.summary ?? "n/a"}
- Calendar link: ${intent?.cal_link ?? "n/a"}
- Suggested options (${slot_minutes} min each):
${slotLines}

Return JSON ONLY:
{"subject":"...","body":"..."} (plain text body, no HTML)`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.2,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });

    let draftSubject = "Re: Quick intro";
    let draftBody = "Thanks for the note!";

    try {
      const raw = completion.choices?.[0]?.message?.content ?? "{}";
      const parsed = JSON.parse(raw);
      if (typeof parsed.subject === "string" && parsed.subject.trim().length > 0) {
        draftSubject = parsed.subject.slice(0, 200);
      }
      if (typeof parsed.body === "string" && parsed.body.trim().length > 0) {
        draftBody = parsed.body;
      }
    } catch {
      // fallback to defaults
    }

    const insertPayload = {
      thread_id: msg.thread_id,
      source_message_id: msg.id,
      campaign_id: msg.campaign_id,
      lead_id: msg.lead_id,
      author_user_id: null,
      kind: "ai",
      subject: draftSubject,
      body: draftBody,
      meta: {
        model: "gpt-4o-mini",
        tone,
        slot_minutes,
        usage: completion.usage ?? null,
      },
    };

    const { error: bumpError } = await sb.rpc("bump_usage", {
      p_account: billingAccountId,
      p_kind: "ai",
      p_amount: 1,
    });
    if (bumpError) {
      console.error("bump_usage failed", bumpError);
      throw new Error(bumpError.message);
    }

    const { data: savedDraft, error: insertError } = await sb
      .from("reply_drafts")
      .insert(insertPayload)
      .select("*")
      .single();

    if (insertError || !savedDraft) {
      console.error("reply-draft insert error", insertError);
      throw new Error(insertError?.message ?? "Insert failed");
    }

    await sb.rpc("log_event", {
      p_campaign: msg.campaign_id,
      p_thread: msg.thread_id,
      p_lead: msg.lead_id,
      p_user: null,
      p_kind: "draft_generated",
      p_note: "AI reply draft generated",
      p_meta: insertPayload.meta,
    });

    return new Response(JSON.stringify(savedDraft), {
      headers: { "content-type": "application/json" },
    });
  } catch (err) {
    const message = (err as Error).message ?? "Internal Error";
    return new Response(message, { status: 500 });
  }
});

