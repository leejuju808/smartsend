// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendEmail } from "../_shared/sendEmail.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const CLAIM = 100;
const MAX_ATTEMPTS = 5;

async function claimRetryBatch() {
  const { data, error } = await supabase.rpc("claim_retry_batch", { p_limit: CLAIM });
  if (error) {
    console.error("claim_retry_batch error", error);
    return [];
  }
  return data ?? [];
}

export async function handler() {
  const batch = await claimRetryBatch();
  if (!batch.length) return new Response("No retries due", { status: 200 });

  for (const row of batch) {
    try {
      // Pre-send guard: check if recipient is suppressed (Block 117)
      const recipientEmail = row.to || row.to_email || "";
      const { data: suppressed } = await supabase.rpc('is_suppressed', {
        p_account: row.account_id,
        p_email: recipientEmail
      });
      if (suppressed === true) {
        await supabase.from("send_queue").update({
          status: "dead_letter",
          locked_at: null,
          last_error: "suppressed:precheck"
        }).eq("id", row.id);
        continue;
      }

      const result = await sendEmail({ 
        provider: row.provider, 
        to: row.to || row.to_email || "", 
        subject: row.subject || "", 
        body_html: row.body_html || row.body || row.html || "", 
        account_id: row.account_id,
        campaign_id: row.campaign_id,
        queue_id: row.id,
        retry: true 
      });

      if (result.success) {
        await supabase.from("send_queue").update({
          status: "sent", 
          locked_at: null, 
          last_error: null
        }).eq("id", row.id);
      } else {
        const n = result.normalized;
        const attempts = (row.attempt_count ?? row.attempts ?? 0) + 1;

        if (n.action === 'suppress_recipient' || n.action === 'dead_letter' || attempts >= MAX_ATTEMPTS) {
          // Auto-suppress on hard bounce (Block 117)
          if (n.action === 'suppress_recipient') {
            const recipientEmail = row.to || row.to_email || "";
            await supabase.rpc('suppress_email', {
              p_scope: 'account',
              p_account: row.account_id,
              p_email: recipientEmail,
              p_provider: row.provider,
              p_reason: 'invalid_recipient',
              p_notes: 'Auto-suppressed by hard bounce'
            }).catch((err) => {
              console.error("Failed to suppress email:", err);
            });
          }
          await supabase.from("send_queue").update({
            status: "dead_letter", 
            locked_at: null, 
            last_error: `suppressed:${result.error}`, 
            attempt_count: attempts
          }).eq("id", row.id);
          await supabase.from("send_fail_logs").insert({
            queue_id: row.id, 
            account_id: row.account_id, 
            provider: row.provider,
            error_code: result.code, 
            error_message: result.error, 
            attempt: attempts, 
            is_transient: !(n.permanent)
          });
        } else if (n.action === 'pause_account') {
          // Pause the account's sending (soft flag) and dead-letter this message
          await supabase.from("accounts").update({ 
            sending_paused: true, 
            paused_reason: n.kind 
          }).eq("id", row.account_id);
          await supabase.from("send_queue").update({
            status: "dead_letter", 
            locked_at: null, 
            last_error: `${n.kind}:${result.error}`, 
            attempt_count: attempts
          }).eq("id", row.id);
          await supabase.from("send_fail_logs").insert({
            queue_id: row.id, 
            account_id: row.account_id, 
            provider: row.provider,
            error_code: result.code, 
            error_message: result.error, 
            attempt: attempts, 
            is_transient: false
          });
        } else if (n.action === 'escalate') {
          // Tag and dead-letter
          await supabase.from("send_queue").update({
            status: "dead_letter", 
            locked_at: null, 
            last_error: `ESCALATE:${n.kind}:${result.error}`, 
            attempt_count: attempts
          }).eq("id", row.id);
          await supabase.from("send_fail_logs").insert({
            queue_id: row.id, 
            account_id: row.account_id, 
            provider: row.provider,
            error_code: result.code, 
            error_message: result.error, 
            attempt: attempts, 
            is_transient: false
          });
        } else {
          // Default: retry with smart retry windows (Block 119)
          const { data: nextAt, error: nextErr } = await supabase.rpc('compute_next_retry_at', {
            p_account: row.account_id,
            p_provider: row.provider,
            p_recipient: recipientEmail,
            p_attempt: attempts,
            p_error_kind: n.kind // e.g., 'rate_limit','temporary_deferral','server_error'
          });
          const next_attempt_at = nextAt ?? new Date(Date.now() + 15 * 60_000).toISOString(); // fallback 15m
          
          await supabase.from("send_queue").update({
            status: "retry_scheduled",
            locked_at: null,
            last_error: `${n.kind}:${result.error}`,
            attempt_count: attempts,
            next_attempt_at
          }).eq("id", row.id);
          await supabase.from("send_fail_logs").insert({
            queue_id: row.id, 
            account_id: row.account_id, 
            provider: row.provider,
            error_code: result.code, 
            error_message: result.error, 
            attempt: attempts, 
            is_transient: !(n.permanent)
          });
        }
      }
    } catch (e) {
      const attempts = (row.attempt_count ?? row.attempts ?? 0) + 1;
      const recipientEmail = row.to || row.to_email || "";
      const { data: nextAt } = await supabase.rpc('compute_next_retry_at', {
        p_account: row.account_id,
        p_provider: row.provider,
        p_recipient: recipientEmail,
        p_attempt: attempts,
        p_error_kind: 'server_error'
      });
      const next_attempt_at = nextAt ?? new Date(Date.now() + 15 * 60_000).toISOString(); // fallback 15m
      
      await supabase.from("send_queue").update({
        status: attempts >= MAX_ATTEMPTS ? "dead_letter" : "retry_scheduled",
        locked_at: null,
        last_error: e instanceof Error ? e.message : String(e),
        attempt_count: attempts,
        next_attempt_at
      }).eq("id", row.id);
    }
  }

  return new Response(`Retried ${batch.length}`, { status: 200 });
}

Deno.serve(handler);

