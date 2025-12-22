// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } }
);

async function popBatch(limit = 25) {
  // Naive lock: mark 'queued' → 'dispatched' for due rows
  const { data, error } = await supabase.rpc("pop_due_queue_batch", { p_limit: limit });
  if (error) throw error;
  return data ?? [];
}

Deno.serve(async () => {
  try {
    // 1) claim work
    const batch = await popBatch(25);

    // 2) send each (pseudo) + log
    for (const job of batch) {
      try {
        // 1) render
        const r = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/render-step`, {
          method: "POST",
          headers: { "content-type":"application/json", "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}` },
          body: JSON.stringify({ campaign_id: job.campaign_id, lead_id: job.lead_id, step_no: job.step_no })
        });
        const jr = await r.json();
        if (!jr.ok) throw new Error("render failed");

        // 2) get lead email and check if unsubscribed or suppressed
        const { data: lead } = await supabase.from("leads").select("email, unsubscribed, suppressed").eq("id", job.lead_id).maybeSingle();
        if (!lead?.email) throw new Error("no lead email");
        if (lead?.unsubscribed) {
          // Optional: mark queue item canceled
          await supabase.from("send_queue").update({ status: 'canceled', last_error: 'unsubscribed' }).eq("id", job.id);
          continue;
        }
        if (lead?.suppressed) {
          await supabase.from("send_queue").update({ status: 'canceled', last_error: 'suppressed' }).eq("id", job.id);
          continue;
        }

        // 2.5) Check if thread has stopped_by_reply
        const { data: thread } = await supabase
          .from("inbox_threads")
          .select("stopped_by_reply")
          .eq("campaign_id", job.campaign_id)
          .eq("lead_id", job.lead_id)
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        
        if (thread?.stopped_by_reply) {
          await supabase.from("send_queue").update({ status: 'canceled', last_error: 'reply-stop' }).eq("id", job.id);
          continue;
        }

        // 3) provider send
        const sendRes = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/send-email`, {
          method: "POST",
          headers: { "content-type":"application/json", "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}` },
          body: JSON.stringify({
            account_id: job.account_id,
            to: lead.email,
            subject: jr.subject,
            html: jr.body_html
          })
        });
        const sendJ = await sendRes.json();
        if (sendJ?.delayed) {
          const delayMs = 60_000 + Math.floor(Math.random() * 60_000);
          const nextAttemptAt = new Date(Date.now() + delayMs).toISOString();

          await supabase
            .from("send_queue")
            .update({
              status: 'queued',
              last_error: 'rate_limited',
              next_attempt_at: nextAttemptAt,
              updated_at: new Date().toISOString()
            })
            .eq("id", job.id);

          await supabase
            .rpc("mark_queue_retry", { p_id: job.id, p_err: 'rate_limited' })
            .catch(() => null);

          continue;
        }
        if (!sendJ.ok) {
          const msg = String(sendJ.error || "");
          if (msg.includes("retryable:")) {
            await supabase.rpc("mark_queue_retry", { p_id: job.id, p_err: msg });
            await supabase.from("send_queue").update({ status: 'queued' }).eq("id", job.id);
            continue; // move on
          }
          throw new Error(msg);
        }

        // 4) success logs with provider IDs
        await supabase.from("send_logs").insert({
          queue_id: job.id,
          campaign_id: job.campaign_id,
          account_id: job.account_id,
          lead_id: job.lead_id,
          step_no: job.step_no,
          status: 'sent',
          subject_rendered: jr.subject,
          body_rendered: jr.body_html,
          provider_message_id: sendJ.provider_message_id ?? null,
          provider_thread_id: sendJ.provider_thread_id ?? null
        });

        // 4.5) Log timeline event for email sent
        await supabase.from("lead_timeline_events").insert({
          lead_id: job.lead_id,
          event_type: "email_sent",
          metadata: {
            campaign_id: job.campaign_id,
            subject: jr.subject,
            step_no: job.step_no,
            message_id: sendJ.provider_message_id ?? null
          }
        }).catch((err) => {
          console.error("Failed to log timeline event:", err);
          // Don't fail the send if timeline logging fails
        });

        // 5) Create/attach thread entry for outbound
        if (sendJ.provider_thread_id) {
          // Get account provider
          const { data: account } = await supabase
            .from("connected_accounts")
            .select("provider, from_email")
            .eq("id", job.account_id)
            .maybeSingle();

          if (account) {
            const { data: thread } = await supabase
              .from("inbox_threads")
              .upsert({
                campaign_id: job.campaign_id,
                account_id: job.account_id,
                lead_id: job.lead_id,
                provider: account.provider || 'gmail',
                provider_thread_id: sendJ.provider_thread_id,
                subject: jr.subject
              }, { 
                onConflict: 'account_id,provider_thread_id',
                ignoreDuplicates: false
              })
              .select('id')
              .maybeSingle();

            if (thread?.id) {
              await supabase.from("inbox_messages").insert({
                thread_id: thread.id,
                direction: 'outbound',
                from_email: account.from_email ?? null,
                to_email: lead.email,
                subject: jr.subject,
                body_html: jr.body_html,
                provider_message_id: sendJ.provider_message_id ?? null
              });
            }
          }
        }

        await supabase.from("send_queue").update({ status: 'sent', last_error: null }).eq("id", job.id);

        // Bill usage: 1 email sent
        try {
          const accRes = await supabase.rpc("billing_account_for_campaign", { p_campaign: job.campaign_id });
          const accountId = accRes.data as string | null;
          if (accountId) {
            await supabase.rpc("check_and_add_usage", {
              p_account: accountId,
              p_metric: "emails_sent",
              p_qty: 1,
              p_soft_only: true,
              p_commit: true
            });
          }
        } catch (usageErr) {
          console.error("Failed to track usage:", usageErr);
          // Don't fail the send if usage tracking fails
        }

      } catch (err) {
        // Hard failure => mark failed (visible in UI)
        await supabase.from("send_queue").update({
          status: 'failed',
          last_error: String(err).slice(0, 500),
          attempts: (job.attempts ?? 0) + 1
        }).eq("id", job.id);
      }
    }

    return new Response(JSON.stringify({ ok: true, processed: batch.length }), { headers: { "content-type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), { status: 500, headers: { "content-type": "application/json" } });
  }
});
