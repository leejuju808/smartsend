import { NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

const MAX_BATCH = 25;

export async function POST() {
  const supa = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY! // needs write across tables
  );

  // 1) pull queue
  const { data: queue, error: qErr } = await supa
    .from("ai_check_queue")
    .select("id, message_id, lead_id, campaign_id")
    .is("processed_at", null)
    .order("enqueued_at", { ascending: true })
    .limit(MAX_BATCH);

  if (qErr) return new NextResponse(qErr.message, { status: 500 });

  if (!queue || queue.length === 0) return NextResponse.json({ processed: 0 });

  // fetch the messages
  const messageIds = queue.map((q) => q.message_id);
  const { data: msgs, error: mErr } = await supa
    .from("email_messages")
    .select("id, body_text, subject, direction, sent_at, lead_id")
    .in("id", messageIds);

  if (mErr) return new NextResponse(mErr.message, { status: 500 });

  const map = new Map(msgs?.map((m) => [m.id, m]) || []);

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

  // 2) classify
  const results: Array<{
    qid: string;
    isHuman: boolean;
    reasoning: string;
  }> = [];

  for (const item of queue) {
    const msg = map.get(item.message_id);
    if (!msg) continue;

    const text = `${msg.subject ?? ""}\n\n${msg.body_text ?? ""}`.slice(0, 6000);

    const prompt = `
You are a strict classifier for cold email replies.
Return JSON with keys: is_human_reply (boolean), reason (string).
Consider: personal pronouns, questions, specific references, unsubscribe/OOO, auto-replies, bounces.

Text:
${text}
    `.trim();

    try {
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              "You are a classifier for email replies. Return only valid JSON with is_human_reply (boolean) and reason (string).",
          },
          { role: "user", content: prompt },
        ],
        temperature: 0.0,
        response_format: { type: "json_object" },
      });

      const raw = completion.choices[0]?.message?.content ?? "";
      let isHuman = false;
      let reasoning = "n/a";

      try {
        const parsed = JSON.parse(raw);
        isHuman = !!parsed.is_human_reply;
        reasoning = String(parsed.reason ?? "");
      } catch {
        // fallback: simple heuristic
        isHuman =
          /thank|let'?s|schedule|interested|call|tomorrow|monday|tuesday|wednesday|thursday|friday/i.test(
            text
          ) &&
          !/out of office|auto-?reply|mailer-daemon|undeliverable/i.test(text);
        reasoning = "fallback heuristic (JSON parse failed)";
      }

      results.push({ qid: item.id, isHuman, reasoning });
    } catch (error) {
      console.error(`Error classifying message ${item.message_id}:`, error);
      // fallback heuristic on API error
      const text = `${msg.subject ?? ""}\n\n${msg.body_text ?? ""}`.slice(0, 6000);
      const isHuman =
        /thank|let'?s|schedule|interested|call|tomorrow|monday|tuesday|wednesday|thursday|friday/i.test(
          text
        ) && !/out of office|auto-?reply|mailer-daemon|undeliverable/i.test(text);
      results.push({
        qid: item.id,
        isHuman,
        reasoning: `API error: ${error instanceof Error ? error.message : "unknown"}`,
      });
    }
  }

  // 3) apply side-effects in a single transaction-like sequence
  // (Supabase-js doesn't do tx across HTTP; keep operations small)
  for (const r of results) {
    const qItem = queue.find((q) => q.id === r.qid);
    if (!qItem) continue;

    // mark queue processed with result
    await supa
      .from("ai_check_queue")
      .update({
        processed_at: new Date().toISOString(),
        result: { isHuman: r.isHuman, reasoning: r.reasoning },
      })
      .eq("id", qItem.id);

    if (!r.isHuman) continue;

    // update lead status -> replied
    // Try both text status (if column is text) and enum (if it's enum)
    await supa
      .from("leads")
      .update({ status: "replied" })
      .eq("id", qItem.lead_id);

    // cancel future sends for this lead - try both campaign_sends and send_queue
    // Update campaign_sends if it exists
    const { error: csErr } = await supa
      .from("campaign_sends")
      .update({ status: "canceled" })
      .eq("lead_id", qItem.lead_id)
      .in("status", ["queued", "sending", "scheduled"]);

    // Update send_queue if it exists (ignore error if table doesn't exist)
    const { error: sqErr } = await supa
      .from("send_queue")
      .update({ status: "canceled" })
      .eq("lead_id", qItem.lead_id)
      .in("status", ["queued", "scheduled", "pending"]);

    // log it
    await supa.from("campaign_logs").insert({
      campaign_id: qItem.campaign_id,
      lead_id: qItem.lead_id,
      event: "reply_detected",
      meta: { source: "ai", qid: qItem.id, reasoning: r.reasoning },
    });
  }

  return NextResponse.json({ processed: results.length, results });
}

