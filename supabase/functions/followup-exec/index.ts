import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import OpenAI from "openai";
import { createHash } from "crypto";

const SB_URL = Deno.env.get("SUPABASE_URL");
const SRK = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const SEND_NOW_URL = Deno.env.get("SEND_NOW_URL");
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");

if (!SB_URL || !SRK) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables");
}

if (!OPENAI_API_KEY) {
  throw new Error("Missing OPENAI_API_KEY environment variable");
}

if (!SEND_NOW_URL) {
  throw new Error("Missing SEND_NOW_URL environment variable");
}

const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

function hashKey(threadId: string, nudgeNo: number, subject: string, body: string) {
  return createHash("sha256")
    .update(`${threadId}:${nudgeNo}:${subject}:${body}`)
    .digest("hex");
}

Deno.serve(async () => {
  const sb = createClient(SB_URL, SRK);

  const { data: tasks, error: taskError } = await sb
    .from("followup_tasks")
    .select(
      "id, scheduled_at, campaign_id, thread_id, lead_id, last_inbound_id, nudge_no, status, reason, attempts, meta"
    )
    .lte("scheduled_at", new Date().toISOString())
    .eq("status", "queued")
    .order("scheduled_at", { ascending: true })
    .limit(25);

  if (taskError) {
    console.error("followup-exec taskError", taskError);
    return new Response(JSON.stringify({ ok: false, processed: 0, error: taskError.message }), {
      status: 500,
      headers: { "content-type": "application/json" }
    });
  }

  const results: Array<{ id: string; ok: boolean; error?: string; skipped?: boolean; reason?: string; deferred?: boolean }> = [];

  for (const task of tasks ?? []) {
    const { data: lockedRows, error: updateError } = await sb
      .from("followup_tasks")
      .update({ status: "running" })
      .eq("id", task.id)
      .eq("status", "queued")
      .select("id");

    if (updateError) {
      console.error("followup-exec updateRunning", updateError);
      results.push({ id: task.id, ok: false, error: updateError.message });
      continue;
    }

    if (!lockedRows || lockedRows.length === 0) {
      // already claimed by another worker
      continue;
    }

    let sendAttemptKey: string | null = null;
    try {

      const { data: lastInbound, error: inboundError } = await sb
        .from("inbox_messages")
        .select("subject, body_text, body_html, created_at")
        .eq("id", task.last_inbound_id)
        .single();

      if (inboundError) throw inboundError;

      const { data: campaign, error: campaignError } = await sb
        .from("campaigns")
        .select("id, name, from_account_id")
        .eq("id", task.campaign_id)
        .single();

      if (campaignError) throw campaignError;

      const inboundText = [lastInbound?.subject ?? "", lastInbound?.body_text ?? lastInbound?.body_html ?? ""]
        .join("\n")
        .slice(0, 6000);

      const tone = task.meta?.tone ?? "warm";

      const systemPrompt = `You write short, friendly follow-up emails for cold outreach threads.
- Tone: ${tone}. Max ~90 words. One clear CTA.
- Nudge politely referencing the prior note; do not guilt trip.
- If earlier message had a question, restate it briefly.
Return JSON ONLY: {"subject":"...","body":"..."}`;

      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        temperature: 0.2,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Previous inbound:\n${inboundText}` }
        ]
      });

      let draft = {
        subject: "Quick follow-up",
        body: "Just checking in on my last note."
      } as { subject?: string; body?: string };

      try {
        const parsed = completion.choices?.[0]?.message?.content;
        if (parsed) {
          const json = JSON.parse(parsed);
          draft = {
            subject: typeof json.subject === "string" ? json.subject : draft.subject,
            body: typeof json.body === "string" ? json.body : draft.body
          };
        }
      } catch (parseError) {
        console.warn("followup-exec parseError", parseError);
      }

      const subjectForKey = draft.subject ?? "";
      const bodyForKey = draft.body ?? "";
      const idempotencyKey = hashKey(task.thread_id, task.nudge_no ?? 0, subjectForKey, bodyForKey);

      if (task.meta?.auto_send) {
        const { error: attemptError } = await sb.from("send_attempts").insert({
          idempotency_key: idempotencyKey,
          campaign_id: task.campaign_id,
          thread_id: task.thread_id,
          lead_id: task.lead_id,
          provider: "gmail",
          status: "pending",
          meta: {
            source: "followup-exec",
            task_id: task.id,
            nudge_no: task.nudge_no ?? 0
          }
        });

        if (attemptError) {
          if ((attemptError as any).code === "23505") {
            await sb.rpc("rpc_finalize_followup_task", {
              p_task_id: task.id,
              p_status: "skipped",
              p_reason: "duplicate_send",
              p_last_error: null
            });

            results.push({ id: task.id, ok: true, skipped: true, reason: "duplicate_send" });
            continue;
          }

          throw attemptError;
        }

        sendAttemptKey = idempotencyKey;
      }

      const { error: draftError } = await sb.from("reply_drafts").insert({
        thread_id: task.thread_id,
        source_message_id: task.last_inbound_id,
        campaign_id: task.campaign_id,
        lead_id: task.lead_id,
        kind: "ai",
        subject: draft.subject?.slice(0, 200),
        body: draft.body,
        meta: {
          model: "gpt-4o-mini",
          kind: "followup",
          nudge_no: task.nudge_no,
          tone,
          labels: task.meta?.labels ?? []
        }
      });

      if (draftError) throw draftError;

      const { error: needsReplyError } = await sb
        .from("inbox_threads")
        .update({ needs_reply: true })
        .eq("id", task.thread_id);

      if (needsReplyError) throw needsReplyError;

      if (task.meta?.auto_send) {
        try {
          const res = await fetch(SEND_NOW_URL, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              campaign_id: task.campaign_id,
              lead_id: task.lead_id,
              from_account_id: campaign?.from_account_id,
              step_no: 1,
              subject: draft.subject,
              body: draft.body,
              provider: "gmail",
              jitter_seconds: Math.floor(Math.random() * 8 * 60),
              thread_id: task.thread_id,
              nudge_no: task.nudge_no ?? 0,
              idempotency_key: sendAttemptKey ?? idempotencyKey
            })
          });
          if (!res.ok) {
            const errText = await res.text().catch(() => res.statusText);
            console.warn("followup-exec sendError", errText);
            if (sendAttemptKey) {
              await sb
                .from("send_attempts")
                .update({ status: "error" })
                .eq("idempotency_key", sendAttemptKey);
            }
            await sb.rpc("rpc_finalize_followup_task", {
              p_task_id: task.id,
              p_status: "failed",
              p_reason: errText || "send_now_failed",
              p_last_error: errText || "send_now_failed"
            });
            results.push({ id: task.id, ok: false, error: errText || "send_now_failed" });
            continue;
          }
          if (res.ok) {
            const payload = await res.json().catch(() => ({}));
            if (payload?.delayed) {
              const rawDelay = payload.delay_seconds;
              const delaySec = typeof rawDelay === "number" && Number.isFinite(rawDelay)
                ? Math.max(60, Math.trunc(rawDelay))
                : 600;

              const reschedule = await sb.rpc("rpc_reschedule_followup_task", {
                p_task_id: task.id,
                p_delay_seconds: delaySec,
                p_reason: "rate_limited"
              });
              if (reschedule.error) {
                console.warn("followup-exec reschedule error", reschedule.error);
              }

              await sb
                .from("activity_events")
                .insert({
                  campaign_id: task.campaign_id,
                  thread_id: task.thread_id,
                  lead_id: task.lead_id,
                  kind: "followup_deferred",
                  note: `rate-limited; retry in ${Math.round(delaySec / 60)}m`,
                  meta: {
                    capacity: payload.capacity ?? null,
                    refill_per_sec: payload.refill_per_sec ?? null,
                    tokens_left: payload.tokens_left ?? null
                  }
                })
                .catch((activityErr) => {
                  console.warn("followup-exec deferred activityError", activityErr);
                });

              results.push({ id: task.id, ok: true, deferred: true, delaySec });
              continue;
            }
          }
        } catch (sendError) {
          console.warn("followup-exec sendError", sendError);
          if (sendAttemptKey) {
            await sb
              .from("send_attempts")
              .update({ status: "error" })
              .eq("idempotency_key", sendAttemptKey);
          }
          const sendErrorText = sendError instanceof Error ? sendError.message : String(sendError);
          await sb.rpc("rpc_finalize_followup_task", {
            p_task_id: task.id,
            p_status: "failed",
            p_reason: sendErrorText,
            p_last_error: sendErrorText
          });
          results.push({ id: task.id, ok: false, error: sendErrorText });
          continue;
        }
      }

      const { error: statusError } = await sb.rpc("rpc_finalize_followup_task", {
        p_task_id: task.id,
        p_status: "done",
        p_reason: task.meta?.auto_send ? "auto_sent" : "drafted",
        p_last_error: null
      });

      if (statusError) throw statusError;

      const { error: activityError } = await sb.from("activity_events").insert({
        campaign_id: task.campaign_id,
        thread_id: task.thread_id,
        lead_id: task.lead_id,
        kind: task.meta?.auto_send ? "followup_sent" : "followup_drafted",
        note: `nudge #${task.nudge_no}`,
        meta: { auto_send: !!task.meta?.auto_send }
      });

      if (activityError) {
        console.warn("followup-exec activityError", activityError);
      }

      results.push({ id: task.id, ok: true });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      console.error("followup-exec error", task.id, reason);

      if (sendAttemptKey) {
        await sb
          .from("send_attempts")
          .update({ status: "error" })
          .eq("idempotency_key", sendAttemptKey);
      }

      await sb
        .from("followup_tasks")
        .update({ status: "failed", reason })
        .eq("id", task.id);

      results.push({ id: task.id, ok: false, error: reason });
    }
  }

  const skipped = results.filter((r) => r.skipped).length;
  return new Response(JSON.stringify({ ok: true, processed: results.length, skipped, results }), {
    headers: { "content-type": "application/json" }
  });
});


