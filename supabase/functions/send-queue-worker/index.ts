import "jsr:@supabase/functions-js/edge-runtime.d.ts";

type QueueRow = {
  id: string;
  mailbox_id: string;
  subject: string | null;
  body: string | null;
  scheduled_at: string;
  status: string;
  attempts: number;
  max_attempts: number;
  backoff_seconds: number;
  meta: Record<string, unknown>;
  lead_id?: string | null;
  thread_id?: string | null;
};

type Mailbox = {
  id: string;
  provider: "gmail" | "outlook" | "smtp" | "dev";
  daily_limit: number;
  hourly_limit: number;
  per_minute_limit: number;
  sent_today: number;
  last_reset_at: string;
  is_active: boolean;
  from_email?: string | null;
  display_name?: string | null;
  smtp?: any;
  send_start?: string | null;
  send_end?: string | null;
};

const JSON_HEADERS = (key: string) => ({
  apikey: key,
  Authorization: `Bearer ${key}`,
  "Content-Type": "application/json",
});

function nowIso() {
  return new Date().toISOString();
}

async function log(supaUrl: string, key: string, payload: any) {
  await fetch(`${supaUrl}/rest/v1/send_logs`, {
    method: "POST",
    headers: JSON_HEADERS(key),
    body: JSON.stringify(payload),
  });
}

function nextBackoff(attempts: number) {
  // 30s, 2m, 5m, 15m, 30m (cap)
  const steps = [30, 120, 300, 900, 1800];
  return steps[Math.min(attempts, steps.length - 1)];
}

// Provider adapters
async function sendViaProvider(
  mb: Mailbox,
  q: QueueRow,
): Promise<{ ok: boolean; error?: string }> {
  switch (mb.provider) {
    case "dev":
      // pretend send; great for end-to-end wiring
      return { ok: true };
    case "smtp":
      // For simplicity, leave a TODO; next slices can wire a SMTP micro-send
      return { ok: false, error: "SMTP not configured in this slice" };
    case "gmail":
    case "outlook":
      return { ok: false, error: "OAuth provider coming in next slice" };
    default:
      return { ok: false, error: "Unknown provider" };
  }
}

Deno.serve(async () => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const headers = JSON_HEADERS(serviceKey);

  // 1) Load active mailboxes
  const mbRes = await fetch(
    `${supabaseUrl}/rest/v1/mailboxes?select=*&is_active=eq.true`,
    { headers },
  );
  const mailboxes: Mailbox[] = await mbRes.json();

  for (const mb of mailboxes) {
    const now = new Date();
    const hour = now.getHours() + now.getMinutes() / 60;
    let hourlyCount = 0;

    // Check daily send window
    if (mb.send_start && mb.send_end) {
      const start = parseFloat(mb.send_start.split(":")[0] + "." + (mb.send_start.split(":")[1] || "0"));
      const end = parseFloat(mb.send_end.split(":")[0] + "." + (mb.send_end.split(":")[1] || "0"));
      
      if (hour < start || hour > end) {
        await log(supabaseUrl, serviceKey, {
          mailbox_id: mb.id,
          event: "rate_limited",
          detail: "outside_send_window",
          meta: { hour, start, end }
        });
        continue;
      }
    }

    // Reset daily counter if crossed UTC day
    const last = new Date(mb.last_reset_at);
    if (last.getUTCDate() !== now.getUTCDate()) {
      await fetch(`${supabaseUrl}/rest/v1/mailboxes?id=eq.${mb.id}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ sent_today: 0, last_reset_at: nowIso() }),
      });
      mb.sent_today = 0;
    }

    // Respect daily limit
    if (mb.sent_today >= mb.daily_limit) {
      await log(supabaseUrl, serviceKey, {
        mailbox_id: mb.id,
        event: "rate_limited",
        detail: "daily_limit_reached",
      });
      continue;
    }

    // Check hourly limit by counting sends in this hour
    if (mb.hourly_limit) {
      const hourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
      const hourlyCountRes = await fetch(
        `${supabaseUrl}/rest/v1/send_logs?select=*&mailbox_id=eq.${mb.id}&event=eq.sent&created_at=gte.${encodeURIComponent(hourAgo)}`,
        { headers: JSON_HEADERS(serviceKey) }
      );
      const hourlyCountData = await hourlyCountRes.json() as any[];
      hourlyCount = hourlyCountData.length;

      if (hourlyCount >= mb.hourly_limit) {
        await log(supabaseUrl, serviceKey, {
          mailbox_id: mb.id,
          event: "rate_limited",
          detail: "hourly_limit_reached",
          meta: { hourlyCount, limit: mb.hourly_limit }
        });
        continue;
      }
    }

    // 2) Pull due jobs for this mailbox (scheduled_at <= now AND backoff_seconds = 0)
    const nowIsoStr = nowIso();
    // Calculate remaining capacity this hour
    const remainingHourly = mb.hourly_limit ? Math.max(0, mb.hourly_limit - hourlyCount) : mb.per_minute_limit;
    const batchSize = Math.min(mb.per_minute_limit, remainingHourly);
    
    const dueRes = await fetch(
      `${supabaseUrl}/rest/v1/send_queue?select=*&mailbox_id=eq.${mb.id}&status=eq.queued&scheduled_at=lte.${encodeURIComponent(nowIsoStr)}&backoff_seconds=eq.0&order=scheduled_at.asc&limit=${batchSize}`,
      { headers },
    );
    const jobs: QueueRow[] = await dueRes.json();

    // 3) Process each job
    for (const q of jobs) {
      // Skip if in backoff (redundant check, but safe)
      if (q.backoff_seconds && q.backoff_seconds > 0) continue;

      // Mark sending (optimistic lock)
      await fetch(
        `${supabaseUrl}/rest/v1/send_queue?id=eq.${q.id}&status=eq.queued`,
        {
          method: "PATCH",
          headers,
          body: JSON.stringify({ status: "sending" }),
        },
      );

      const result = await sendViaProvider(mb, q);

      if (result.ok) {
        // Mark sent
        const sentTime = nowIso();
        await fetch(`${supabaseUrl}/rest/v1/send_queue?id=eq.${q.id}`, {
          method: "PATCH",
          headers,
          body: JSON.stringify({ status: "sent", sent_at: sentTime, error: null }),
        });
        // Increment mailbox counter
        await fetch(`${supabaseUrl}/rest/v1/mailboxes?id=eq.${mb.id}`, {
          method: "PATCH",
          headers,
          body: JSON.stringify({ sent_today: mb.sent_today + 1 }),
        });
        mb.sent_today += 1;
        await log(supabaseUrl, serviceKey, {
          queue_id: q.id,
          mailbox_id: mb.id,
          event: "sent",
          detail: "ok",
        });
      } else {
        const attempts = q.attempts + 1;
        const shouldFail = attempts >= q.max_attempts;
        const backoff = shouldFail ? 0 : nextBackoff(attempts);
        const scheduled = shouldFail
          ? q.scheduled_at
          : new Date(Date.now() + backoff * 1000).toISOString();

        await fetch(`${supabaseUrl}/rest/v1/send_queue?id=eq.${q.id}`, {
          method: "PATCH",
          headers,
          body: JSON.stringify({
            status: shouldFail ? "failed" : "queued",
            attempts,
            error: result.error ?? "send_error",
            backoff_seconds: backoff,
            scheduled_at: scheduled,
          }),
        });

        await log(supabaseUrl, serviceKey, {
          queue_id: q.id,
          mailbox_id: mb.id,
          event: shouldFail ? "failed" : "retry_scheduled",
          detail: result.error ?? "send_error",
          meta: { attempts, backoff },
        });
      }
    }
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: { "Content-Type": "application/json" },
  });
});
