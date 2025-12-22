// SmartSend Queue Dispatcher Edge Function
// Processes outbound_queue with rate limiting, retries, and warmup

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const BATCH_SIZE = Number(Deno.env.get("BATCH_SIZE") ?? "50");
const PROVIDER_API_KEY = Deno.env.get("PROVIDER_API_KEY"); // e.g., Resend key

// Calculate exponential backoff delay in minutes
function backoffDelay(attempts: number): number {
  return Math.min(Math.pow(2, attempts), 64);
}

// Send email via Gmail using gmail-send edge function
async function sendGmail(job: any): Promise<{ ok: boolean; error?: string }> {
  if (!job.org_id) {
    return { ok: false, error: "Missing org_id for Gmail send" };
  }

  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/gmail-send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({
        org_id: job.org_id,
        from_email: job.from_email || job.from || "SmartSend AI",
        to_email: job.to_email,
        subject: job.subject,
        html: job.body || job.body_html || "",
      }),
    });

    if (!res.ok) {
      const errorText = await res.text();
      return { ok: false, error: `Gmail send failed: ${errorText}` };
    }

    const result = await res.json();
    return { ok: result.ok || false, error: result.error };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Unknown Gmail send error" };
  }
}

// Send email via Outlook API (placeholder)
async function sendOutlook(job: any): Promise<{ ok: boolean; error?: string }> {
  // TODO: Implement real Outlook sending
  console.log("Would send Outlook email to:", job.to_email);
  return { ok: true };
}

// Send email via Resend API
async function sendResend(job: any): Promise<{ ok: boolean; error?: string; message_id?: string }> {
  if (!PROVIDER_API_KEY) {
    return { ok: false, error: "PROVIDER_API_KEY not configured" };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${PROVIDER_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: "SmartSend AI <noreply@smartsend.ai>", // TODO: Get from org settings
        to: job.to_email,
        subject: job.subject,
        html: job.body,
      })
    });

    if (!res.ok) {
      const error = await res.text();
      return { ok: false, error: `Resend error: ${error}` };
    }

    const data = await res.json();
    return { ok: true, message_id: data.id };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}

// Check if org has exceeded send limits
async function checkSendLimits(org_id: string, connector: string): Promise<boolean> {
  const { data: limit } = await supabase
    .from("send_limits")
    .select("*")
    .eq("org_id", org_id)
    .maybeSingle();

  if (!limit) return true; // No limits configured, allow sending

  // Check warmup
  if (limit.warmup_enabled && limit.warmup_start_date) {
    const daysSinceStart = Math.floor(
      (Date.now() - new Date(limit.warmup_start_date).getTime()) / (1000 * 60 * 60 * 24)
    );
    if (daysSinceStart < limit.warmup_days) {
      // During warmup, gradually increase limits
      const progress = daysSinceStart / limit.warmup_days;
      const effectiveDayLimit = Math.floor(limit.max_per_day * progress);
      // Check if we've exceeded warmup limit
      const { count } = await supabase
        .from("outbound_queue")
        .select("*", { count: "exact", head: true })
        .eq("org_id", org_id)
        .eq("connector", connector)
        .eq("status", "sent")
        .gte("sent_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
      
      if ((count || 0) >= effectiveDayLimit) {
        return false;
      }
    }
  }

  // Check per-minute limit
  const { count: minuteCount } = await supabase
    .from("outbound_queue")
    .select("*", { count: "exact", head: true })
    .eq("org_id", org_id)
    .eq("connector", connector)
    .eq("status", "sent")
    .gte("sent_at", new Date(Date.now() - 60 * 1000).toISOString());

  if ((minuteCount || 0) >= limit.max_per_minute) {
    return false;
  }

  // Check per-hour limit
  const { count: hourCount } = await supabase
    .from("outbound_queue")
    .select("*", { count: "exact", head: true })
    .eq("org_id", org_id)
    .eq("connector", connector)
    .eq("status", "sent")
    .gte("sent_at", new Date(Date.now() - 60 * 60 * 1000).toISOString());

  if ((hourCount || 0) >= limit.max_per_hour) {
    return false;
  }

  // Check per-day limit
  const { count: dayCount } = await supabase
    .from("outbound_queue")
    .select("*", { count: "exact", head: true })
    .eq("org_id", org_id)
    .eq("connector", connector)
    .eq("status", "sent")
    .gte("sent_at", new Date().toISOString().split('T')[0]);

  if ((dayCount || 0) >= limit.max_per_day) {
    return false;
  }

  return true;
}

Deno.serve(async (_req) => {
  try {
    // 1. Fetch pending jobs that are due
    const { data: jobs, error: fetchError } = await supabase
      .from("outbound_queue")
      .select("*")
      .eq("status", "pending")
      .lte("scheduled_at", new Date().toISOString())
      .order("scheduled_at", { ascending: true })
      .limit(BATCH_SIZE);

    if (fetchError) {
      console.error("Error fetching jobs:", fetchError);
      return new Response(
        JSON.stringify({ ok: false, error: fetchError.message }), 
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!jobs || jobs.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, processed: 0, throttled: 0 }), 
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    let processed = 0;
    let throttled = 0;
    const results: Array<{ id: string; ok: boolean; error?: string }> = [];

    for (const job of jobs) {
      // 2. Check if already being processed (mark as sending)
      const { data: locked } = await supabase
        .from("outbound_queue")
        .update({ status: "sending" })
        .eq("id", job.id)
        .eq("status", "pending")
        .select()
        .maybeSingle();

      if (!locked) {
        // Another worker grabbed this job
        continue;
      }

      // 3. Check send limits
      if (job.org_id) {
        const canSend = await checkSendLimits(job.org_id, job.connector);
        if (!canSend) {
          // Throttle: reschedule for next minute
          await supabase
            .from("outbound_queue")
            .update({
              status: "pending",
              scheduled_at: new Date(Date.now() + 60 * 1000).toISOString()
            })
            .eq("id", job.id);
          throttled++;
          continue;
        }
      }

      // 4. Attempt to send
      try {
        let sendResult: { ok: boolean; error?: string; message_id?: string };

        switch (job.connector) {
          case "gmail":
            sendResult = await sendGmail(job);
            break;
          case "outlook":
            sendResult = await sendOutlook(job);
            break;
          case "resend":
            sendResult = await sendResend(job);
            break;
          default:
            sendResult = { ok: false, error: `Unknown connector: ${job.connector}` };
        }

        if (sendResult.ok) {
          // Mark as sent
          await supabase
            .from("outbound_queue")
            .update({
              status: "sent",
              sent_at: new Date().toISOString(),
              last_error: null
            })
            .eq("id", job.id);
          
          processed++;
          results.push({ id: job.id, ok: true });
        } else {
          // Handle failure with exponential backoff
          const attempts = (job.attempts || 0) + 1;
          const exceeded = attempts >= (job.max_attempts || 5);

          if (exceeded) {
            // Max attempts reached
            await supabase
              .from("outbound_queue")
              .update({
                status: "failed",
                attempts,
                last_error: sendResult.error,
                last_attempt_at: new Date().toISOString()
              })
              .eq("id", job.id);
            
            results.push({ id: job.id, ok: false, error: sendResult.error });
          } else {
            // Retry with exponential backoff
            const delayMinutes = backoffDelay(attempts);
            const nextAttempt = new Date(Date.now() + delayMinutes * 60 * 1000);

            await supabase
              .from("outbound_queue")
              .update({
                status: "pending",
                attempts,
                last_error: sendResult.error,
                last_attempt_at: new Date().toISOString(),
                scheduled_at: nextAttempt.toISOString()
              })
              .eq("id", job.id);
            
            results.push({ id: job.id, ok: false, error: sendResult.error });
          }
        }
      } catch (error) {
        // Unexpected error
        const attempts = (job.attempts || 0) + 1;
        const exceeded = attempts >= (job.max_attempts || 5);

        await supabase
          .from("outbound_queue")
          .update({
            status: exceeded ? "failed" : "pending",
            attempts,
            last_error: error instanceof Error ? error.message : "Unknown error",
            last_attempt_at: new Date().toISOString(),
            scheduled_at: exceeded 
              ? job.scheduled_at 
              : new Date(Date.now() + backoffDelay(attempts) * 60 * 1000).toISOString()
          })
          .eq("id", job.id);
        
        results.push({ id: job.id, ok: false, error: error instanceof Error ? error.message : "Unknown error" });
      }
    }

    return new Response(
      JSON.stringify({ ok: true, processed, throttled, results }), 
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Unexpected error:", error);
    return new Response(
      JSON.stringify({ ok: false, error: error instanceof Error ? error.message : "Unknown error" }), 
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
