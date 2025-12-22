// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import OpenAI from "npm:openai@4";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const openAiKey = Deno.env.get("OPENAI_API_KEY")!;

const openai = new OpenAI({ apiKey: openAiKey });

interface Slot {
  start_iso: string;
  end_iso: string;
}

interface ParsedIntent {
  summary?: string;
  slots?: Slot[];
}

function sanitizeSlots(slots: unknown, maxSlots: number): Slot[] {
  if (!Array.isArray(slots)) return [];

  const sanitized: Slot[] = [];

  for (const entry of slots) {
    if (typeof entry !== "object" || entry === null) continue;
    const start = (entry as Record<string, unknown>).start_iso;
    const end = (entry as Record<string, unknown>).end_iso;
    if (typeof start === "string" && typeof end === "string") {
      sanitized.push({ start_iso: start, end_iso: end });
    }
    if (sanitized.length >= maxSlots) break;
  }

  return sanitized;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const messageId: string | undefined = body?.message_id;
    const maxSlots: number = Math.max(1, Math.min(Number(body?.max_slots ?? 5) || 5, 10));
    const slotMinutes: number = Math.max(15, Math.min(Number(body?.slot_minutes ?? 30) || 30, 240));

    if (!messageId) {
      return new Response("Missing message_id", { status: 400 });
    }

    const sb = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    const { data: msg, error: messageError } = await sb
      .from("inbox_messages")
      .select(
        "id, thread_id, campaign_id, lead_id, direction, subject, body_text, body_html, created_at",
      )
      .eq("id", messageId)
      .single();

    if (messageError || !msg) {
      return new Response("Message not found", { status: 404 });
    }

    if (msg.direction !== "inbound") {
      return new Response("Not inbound", { status: 400 });
    }

    const [{ data: lead }, { data: campaign, error: campaignError }] = await Promise.all([
      sb
        .from("leads")
        .select("id, tz")
        .eq("id", msg.lead_id)
        .maybeSingle(),
      sb
        .from("campaigns")
        .select("id, from_account_id, meta, user_id, billing_account_id")
        .eq("id", msg.campaign_id)
        .maybeSingle(),
    ]);

    if (campaignError) {
      return new Response("Campaign not found", { status: 404 });
    }

    let accountRecord: any | null = null;
    if (campaign?.from_account_id) {
      const { data: acct } = await sb
        .from("connected_accounts")
        .select("id, meta")
        .eq("id", campaign.from_account_id)
        .maybeSingle();
      accountRecord = acct;
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

    const leadTz = (lead as any)?.tz || "America/New_York";
    const myTz = (accountRecord?.meta as any)?.tz || "America/Los_Angeles";
    const calLink =
      (accountRecord?.meta as any)?.cal_link ||
      (campaign?.meta as any)?.cal_link ||
      null;

    const textSource = msg.body_text || msg.body_html || msg.subject || "";
    const text = textSource.slice(0, 6000);

    const referenceInstant = msg.created_at ?? new Date().toISOString();

    const systemPrompt = `You are a scheduling parser. Extract up to ${maxSlots} concrete meeting time candidates from the user's message.
- Prefer the sender's timezone: "${leadTz}".
- If time period (morning/afternoon/evening) is vague, choose sensible business times (09:00, 11:00, 14:00, 16:00).
- Duration default: ${slotMinutes} minutes.
- Resolve references like "next Tuesday", "tomorrow", explicit dates, and ranges ("early next week") into concrete dates (assume the message timestamp is NOW in ${leadTz}: ${referenceInstant}).
- Return JSON ONLY:
{"summary":"...","slots":[{"start_iso":"YYYY-MM-DDTHH:MM:SSZ","end_iso":"YYYY-MM-DDTHH:MM:SSZ"}]}
All times MUST be in UTC (Z).`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: text },
      ],
      response_format: { type: "json_object" },
    });

    let parsed: ParsedIntent = {};

    try {
      const content = completion.choices?.[0]?.message?.content ?? "{}";
      parsed = JSON.parse(content);
    } catch (err) {
      console.error("meeting-parse JSON parse error", err);
      parsed = {};
    }

    const payload = {
      thread_id: msg.thread_id,
      campaign_id: msg.campaign_id,
      lead_id: msg.lead_id,
      source_message_id: msg.id,
      lead_tz: leadTz,
      my_tz: myTz,
      cal_link: calLink,
      summary: typeof parsed.summary === "string" ? parsed.summary : "",
      slots: sanitizeSlots(parsed.slots, maxSlots),
      meta: {
        model: "gpt-4o-mini",
        slot_minutes: slotMinutes,
        usage: completion.usage ?? null,
      },
    };

    const { error: upsertError } = await sb
      .from("meeting_intents")
      .upsert(payload, { onConflict: "thread_id" });

    if (upsertError) {
      console.error("meeting-parse upsert error", upsertError);
      return new Response("Persist failed", { status: 500 });
    }

    try {
      await sb.rpc("log_event", {
        p_campaign: msg.campaign_id,
        p_thread: msg.thread_id,
        p_lead: msg.lead_id,
        p_user: null,
        p_kind: "meeting_slots_parsed",
        p_note: payload.summary ?? "",
        p_meta: payload.meta ?? {},
      });
    } catch (logErr) {
      console.error("meeting-parse log_event failed", logErr);
    }

    const { error: bumpError } = await sb.rpc("bump_usage", {
      p_account: billingAccountId,
      p_kind: "ai",
      p_amount: 1,
    });
    if (bumpError) {
      console.error("bump_usage failed", bumpError);
      throw new Error(bumpError.message);
    }

    return new Response(JSON.stringify(payload), {
      headers: { "content-type": "application/json" },
    });
  } catch (err) {
    console.error("meeting-parse error", err);
    return new Response((err as Error).message ?? "Internal Error", { status: 500 });
  }
});

