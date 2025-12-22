import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { google } from "https://esm.sh/googleapis@127";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID")!;
const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

type Job = {
  id: string;
  user_id: string;
  to_email: string;
  to_name?: string | null;
  subject: string;
  html?: string | null;
  text?: string | null;
  attempts: number;
  max_attempts: number;
  lead_id?: string | null;
};

async function gmailClient(supabase: any, user_id: string) {
  const { data: integ, error } = await supabase
    .from("user_connections")
    .select("access_token, refresh_token, expires_at, email_address")
    .eq("user_id", user_id)
    .eq("provider", "gmail")
    .maybeSingle();

  if (error || !integ) throw new Error("No Gmail integration");
  if (!integ.refresh_token) throw new Error("Missing refresh token");

  // Check if token needs refresh (5 min buffer)
  const now = Date.now();
  const expiresAt = integ.expires_at ? new Date(integ.expires_at).getTime() : 0;
  let accessToken = integ.access_token;

  if (!accessToken || !expiresAt || now >= expiresAt - 5 * 60 * 1000) {
    // Refresh token
    const params = new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      grant_type: "refresh_token",
      refresh_token: integ.refresh_token,
    });

    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Token refresh failed: ${text}`);
    }

    const tokens = await res.json();
    accessToken = tokens.access_token;
    const newExpiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

    await supabase
      .from("user_connections")
      .update({
        access_token: accessToken,
        expires_at: newExpiresAt,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", user_id)
      .eq("provider", "gmail");
  }

  const oauth2 = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET);
  oauth2.setCredentials({ 
    access_token: accessToken, 
    refresh_token: integ.refresh_token 
  });

  const gmail = google.gmail({ version: "v1", auth: oauth2 });
  return { gmail, from_email: integ.email_address as string };
}

function makeRawEmail(params: {
  from: string;
  to: string;
  subject: string;
  html?: string | null;
  text?: string | null;
  fromName?: string | null;
}) {
  const fromHeader = params.fromName 
    ? `${params.fromName} <${params.from}>` 
    : params.from;

  const contentType = params.html ? `text/html` : `text/plain`;
  const body = params.html ?? params.text ?? "";

  const lines = [
    `From: ${fromHeader}`,
    `To: ${params.to}`,
    `Subject: ${params.subject}`,
    `MIME-Version: 1.0`,
    `Content-Type: ${contentType}; charset="UTF-8"`,
    "",
    body,
  ].join("\r\n");

  const b64 = btoa(unescape(encodeURIComponent(lines)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  return b64;
}

Deno.serve(async (req) => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const { limit = 25 } = await req.json().catch(() => ({ limit: 25 }));

    // 1) Fetch a small batch of due jobs with a transactional lock
    const { data: batch, error: qerr } = await supabase.rpc("claim_outbox_batch", {
      p_limit: limit,
    });

    if (qerr) throw qerr;

    let sentCount = 0;

    // Group by user to apply per-user throttle
    const byUser: Record<string, Job[]> = {};
    for (const j of (batch as Job[] ?? [])) {
      (byUser[j.user_id] ||= []).push(j);
    }

    for (const [user_id, jobs] of Object.entries(byUser)) {
      // Throttle checks
      const { data: settings } = await supabase
        .from("send_settings")
        .select("*")
        .eq("user_id", user_id)
        .maybeSingle();

      const maxPerHour = settings?.max_per_hour ?? 50;
      const dailyCap = settings?.daily_cap ?? 200;

      // Count last hour + today
      const { data: counts } = await supabase.rpc("sending_window_counts", {
        p_user: user_id,
      });

      if (counts && (counts.hour >= maxPerHour || counts.day >= dailyCap)) {
        // push all back 15 min
        await supabase
          .from("emails_outbox")
          .update({
            status: "queued",
            run_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
          })
          .in("id", jobs.map((j) => j.id));

        continue;
      }

      const { gmail, from_email } = await gmailClient(supabase, user_id);
      const fromName = settings?.from_name ?? undefined;

      for (const job of jobs) {
        try {
          // mark sending (idempotency)
          await supabase
            .from("emails_outbox")
            .update({ status: "sending" })
            .eq("id", job.id);

          const raw = makeRawEmail({
            from: from_email,
            fromName,
            to: job.to_name ? `${job.to_name} <${job.to_email}>` : job.to_email,
            subject: job.subject,
            html: job.html ?? undefined,
            text: job.text ?? undefined,
          });

          const res = await gmail.users.messages.send({
            userId: "me",
            requestBody: { raw },
          });

          await supabase
            .from("emails_outbox")
            .update({
              status: "sent",
              sent_at: new Date().toISOString(),
              message_id: res.data.id ?? null,
              last_error: null,
            })
            .eq("id", job.id);

          sentCount++;
        } catch (e) {
          const attempts = job.attempts + 1;
          const backoffMin = Math.min(60, 2 ** attempts); // 2,4,8,16,32,60
          const errorMsg = (e as Error).message?.slice(0, 800) || String(e);
          const isHardBounce = attempts >= job.max_attempts && /550|552|554|550|5\.[0-9]\.[0-9]/i.test(errorMsg);

          // Update outbox
          await supabase
            .from("emails_outbox")
            .update({
              status: attempts >= job.max_attempts ? "failed" : "queued",
              attempts,
              run_at:
                attempts >= job.max_attempts
                  ? null
                  : new Date(Date.now() + backoffMin * 60 * 1000).toISOString(),
              last_error: errorMsg,
              provider_status: isHardBounce ? "bounce" : attempts >= job.max_attempts ? "soft" : undefined,
              provider_code: isHardBounce ? errorMsg.match(/55[0-9]|5\.[0-9]\.[0-9]/i)?.[0] : undefined,
            })
            .eq("id", job.id);

          // On hard bounce: mark thread as bounced and suppressed
          if (isHardBounce && job.lead_id) {
            const { data: thread } = await supabase
              .from("threads")
              .select("id")
              .eq("lead_id", job.lead_id)
              .maybeSingle();
            
            if (thread?.id) {
              await supabase
                .from("threads")
                .update({
                  delivery_status: "bounced",
                  suppressed: true,
                  last_bounce_at: new Date().toISOString(),
                  bounce_reason: errorMsg,
                })
                .eq("id", thread.id);
            }
          }
        }
      }
    }

    return new Response(
      JSON.stringify({ claimed: (batch?.length ?? 0), sent: sentCount }),
      {
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
    });
  }
});

