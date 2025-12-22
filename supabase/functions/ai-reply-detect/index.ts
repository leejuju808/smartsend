import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import OpenAI from "openai";
import { createClient } from "jsr:@supabase/supabase-js@2";

const openai = new OpenAI({ apiKey: Deno.env.get("OPENAI_API_KEY")! });

const SYSTEM = `
Classify an email reply. Return STRICT JSON:
{
 "intent": "replied|out_of_office|not_interested|scheduling|question|neutral|unclear",
 "subtype": string|null,
 "confidence": number,         // 0..1
 "ooo_return_date": string|null,         // ISO date if a single "back on" date is stated
 "ooo_window_start": string|null,        // ISO timestamp if a window/range is implied
 "ooo_window_end": string|null           // ISO timestamp end of unavailability if implied
}
Rules:
- Parse phrases like "until Nov 18", "back Monday", "out 11/10–11/14".
- If only a day name is given, assume the next occurrence of that day.
- Keep ISO 8601. If timezone is unclear, do not guess offset; just return date without time.
`.trim();

Deno.serve(async (req) => {
  try {
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const payload = await req.json().catch(() => ({}));
    const messageId = payload?.message_id as string | undefined;
    if (!messageId) {
      return new Response("missing message_id", { status: 400 });
    }

    const { data: msg, error: msgError } = await sb
      .from("inbox_messages")
      .select("id, thread_id, lead_id, campaign_id, body_text, body_html, workspace_id")
      .eq("id", messageId)
      .single();
    if (msgError || !msg) {
      return new Response("message not found", { status: 404 });
    }

    // Block 292: Deduct credits for AI reply scan
    let workspaceId = msg.workspace_id;
    if (!workspaceId && msg.lead_id) {
      // Fallback: get workspace_id from lead
      const { data: lead } = await sb
        .from("leads")
        .select("workspace_id")
        .eq("id", msg.lead_id)
        .single();
      workspaceId = lead?.workspace_id;
    }

    if (workspaceId) {
      await sb.rpc("deduct_credits", {
        workspace_id_input: workspaceId,
        amount: 1,
        reason_input: "ai_reply_scan",
      }).catch((err) => {
        // Don't fail the scan if credit deduction fails
        console.warn("Failed to deduct credits for AI scan:", err);
      });
    }

    const raw = (msg.body_text || msg.body_html || "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 8000);

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: raw },
      ],
    });

    let intent = "unclear";
    let subtype: string | null = null;
    let confidence = 0;
    let oooReturnDate: string | null = null;
    let oooWindowStart: string | null = null;
    let oooWindowEnd: string | null = null;

    try {
      const parsed = JSON.parse(completion.choices[0]?.message?.content || "{}");
      if (typeof parsed.intent === "string") intent = parsed.intent;
      if (typeof parsed.subtype === "string") subtype = parsed.subtype;
      if (Number.isFinite(Number(parsed.confidence))) confidence = Number(parsed.confidence);
      if (typeof parsed.ooo_return_date === "string") oooReturnDate = parsed.ooo_return_date;
      if (typeof parsed.ooo_window_start === "string") oooWindowStart = parsed.ooo_window_start;
      if (typeof parsed.ooo_window_end === "string") oooWindowEnd = parsed.ooo_window_end;
    } catch {
      // ignore parse issues; defaults already set
    }

    await sb.from("reply_events").insert({
      campaign_id: msg.campaign_id,
      thread_id: msg.thread_id,
      message_id: msg.id,
      lead_id: msg.lead_id,
      label: intent,
      confidence,
      meta: {
        subtype,
        ooo_return_date: oooReturnDate,
        ooo_window_start: oooWindowStart,
        ooo_window_end: oooWindowEnd,
      },
    });

    const { error: detErr } = await sb.from("reply_detections").insert({
      campaign_id: msg.campaign_id,
      lead_id: msg.lead_id,
      thread_id: msg.thread_id,
      classifier: "llm",
      intent,
      confidence,
      evidence: {
        subtype,
        ooo_return_date: oooReturnDate,
        ooo_window_start: oooWindowStart,
        ooo_window_end: oooWindowEnd,
      },
    });
    if (detErr) {
      console.warn("reply_detections insert failed", detErr.message);
    }

    let resumeAt: string | null = null;
    if (intent === "out_of_office") {
      const nextBusinessMorning = (iso: string | null, bumpDay = true) => {
        if (!iso) return null;
        const d = new Date(iso);
        if (Number.isNaN(d.getTime())) return null;
        const result = new Date(d);
        if (bumpDay) {
          result.setUTCDate(result.getUTCDate() + 1);
        }
        while ([0, 6].includes(result.getUTCDay())) {
          result.setUTCDate(result.getUTCDate() + 1);
        }
        result.setUTCHours(9, 0, 0, 0);
        return result.toISOString();
      };

      resumeAt = nextBusinessMorning(oooWindowEnd);
      if (!resumeAt && oooReturnDate) {
        resumeAt = nextBusinessMorning(oooReturnDate, false);
      }
      if (!resumeAt) {
        const fallback = new Date();
        fallback.setDate(fallback.getDate() + 3);
        resumeAt = fallback.toISOString();
      }

      await sb.rpc("pause_lead_automation", {
        p_thread_id: msg.thread_id,
        p_resume_at: resumeAt,
      });
    }

    const REPLY_LABELS = new Set(["replied"]);
    if (REPLY_LABELS.has(intent) && confidence >= 0.65) {
      await sb.rpc("autopause_on_reply", {
        p_thread: msg.thread_id,
        p_lead: msg.lead_id,
        p_campaign: msg.campaign_id,
      });
    }

    // Block 485: Update intent score based on reply detection
    if (msg.lead_id) {
      const INTEREST_INTENTS = new Set(["scheduling", "replied"]);
      const signalType = INTEREST_INTENTS.has(intent) && confidence >= 0.65
        ? "reply_interest"
        : "reply";

      // Call intent-score-update function asynchronously (don't block response)
      fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/intent-score-update`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        },
        body: JSON.stringify({
          lead_id: msg.lead_id,
          signal_type: signalType,
        }),
      }).catch((err) => {
        console.warn("[ai-reply-detect] Failed to update intent score:", err);
      });
    }

    return new Response(
      JSON.stringify({
        intent,
        subtype,
        confidence,
        ooo_return_date: oooReturnDate,
        ooo_window_start: oooWindowStart,
        ooo_window_end: oooWindowEnd,
        resume_at: resumeAt,
      }),
      { headers: { "content-type": "application/json" } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return new Response(`err: ${message}`, { status: 500 });
  }
});
