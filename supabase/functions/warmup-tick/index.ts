import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const sb = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const SECRET = Deno.env.get("WARMUP_SECRET")!;
const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID");
const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET");
const MICROSOFT_CLIENT_ID = Deno.env.get("MICROSOFT_CLIENT_ID");
const MICROSOFT_CLIENT_SECRET = Deno.env.get("MICROSOFT_CLIENT_SECRET");

// Helper: Refresh Gmail token if needed
async function refreshGmailToken(refreshToken: string): Promise<{
  access_token: string;
  expires_in: number;
  refresh_token?: string;
}> {
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    throw new Error("GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET required for Gmail");
  }
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    client_secret: GOOGLE_CLIENT_SECRET,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
  const resp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  if (!resp.ok) throw new Error(`Token refresh failed: ${await resp.text()}`);
  return await resp.json();
}

// Helper: Refresh Outlook token if needed
async function refreshOutlookToken(refreshToken: string): Promise<{
  access_token: string;
  expires_in: number;
  refresh_token?: string;
}> {
  if (!MICROSOFT_CLIENT_ID || !MICROSOFT_CLIENT_SECRET) {
    throw new Error("MICROSOFT_CLIENT_ID and MICROSOFT_CLIENT_SECRET required for Outlook");
  }
  const params = new URLSearchParams({
    client_id: MICROSOFT_CLIENT_ID,
    client_secret: MICROSOFT_CLIENT_SECRET,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    scope: "https://graph.microsoft.com/Mail.Send",
  });
  const resp = await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  if (!resp.ok) throw new Error(`Token refresh failed: ${await resp.text()}`);
  return await resp.json();
}

// Helper: Build RFC822 MIME message for Gmail
function buildGmailMime(from: string, to: string, subject: string, body: string): string {
  const boundary = `smartsend_${crypto.randomUUID().replace(/-/g, "")}`;
  const textBody = body.replace(/<[^>]*>/g, " ");
  const headers = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
  ].join("\r\n");
  const emailContent = `${headers}\r\n\r\n--${boundary}\r\nContent-Type: text/plain; charset="UTF-8"\r\n\r\n${textBody}\r\n\r\n--${boundary}\r\nContent-Type: text/html; charset="UTF-8"\r\n\r\n${body}\r\n\r\n--${boundary}--`;
  return btoa(emailContent).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// Helper: Send via Gmail
async function sendViaGmail(
  sender: { id: string; email: string; access_token: string; refresh_token: string | null; expires_at: string | null },
  to: string,
  subject: string,
  body: string
): Promise<void> {
  let accessToken = sender.access_token;
  
  // Refresh token if needed
  if (sender.expires_at && new Date(sender.expires_at).getTime() - Date.now() < 60000 && sender.refresh_token) {
    const refreshed = await refreshGmailToken(sender.refresh_token);
    accessToken = refreshed.access_token;
    await sb.from("sender_profiles").update({
      access_token: refreshed.access_token,
      expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
      ...(refreshed.refresh_token ? { refresh_token: refreshed.refresh_token } : {}),
    }).eq("id", sender.id);
  }

  const raw = buildGmailMime(sender.email, to, subject, body);
  const resp = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ raw }),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Gmail send failed: ${text}`);
  }
}

// Helper: Send via Outlook
async function sendViaOutlook(
  sender: { id: string; email: string; access_token: string; refresh_token: string | null; expires_at: string | null },
  to: string,
  subject: string,
  body: string
): Promise<void> {
  let accessToken = sender.access_token;
  
  // Refresh token if needed
  if (sender.expires_at && new Date(sender.expires_at).getTime() - Date.now() < 60000 && sender.refresh_token) {
    const refreshed = await refreshOutlookToken(sender.refresh_token);
    accessToken = refreshed.access_token;
    await sb.from("sender_profiles").update({
      access_token: refreshed.access_token,
      expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
      ...(refreshed.refresh_token ? { refresh_token: refreshed.refresh_token } : {}),
    }).eq("id", sender.id);
  }

  const resp = await fetch("https://graph.microsoft.com/v1.0/me/sendMail", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message: {
        subject,
        body: {
          contentType: "HTML",
          content: body,
        },
        toRecipients: [{ emailAddress: { address: to } }],
      },
      saveToSentItems: true,
    }),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Outlook send failed: ${text}`);
  }
}

Deno.serve(async (req) => {
  // Check secret header
  if (req.headers.get("x-ss-secret") !== SECRET) {
    return new Response("unauthorized", { status: 401 });
  }

  try {
    // Get active warmup sessions
    const { data: sessions, error: sessionsError } = await sb
      .from("warmup_sessions")
      .select("id, sender_id, daily_target, total_sent, last_sent_at")
      .eq("active", true);

    if (sessionsError) throw sessionsError;
    if (!sessions?.length) return new Response(JSON.stringify({ ok: true, message: "no active sessions" }), {
      headers: { "Content-Type": "application/json" },
    });

    // Get healthy sender profiles (health_score > 60)
    const { data: senders, error: sendersError } = await sb
      .from("sender_profiles")
      .select("id, email, health_score, provider, access_token, refresh_token, expires_at")
      .gt("health_score", 60);

    if (sendersError) throw sendersError;
    if (!senders?.length || senders.length < 2) {
      return new Response(JSON.stringify({ ok: true, message: "not enough healthy senders" }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    const pool = senders.map((s) => s.email);
    const results: any[] = [];

    // Process each warmup session
    for (const s of sessions) {
      const me = senders.find((x) => x.id === s.sender_id);
      if (!me) continue;

      // Choose random other inboxes
      const others = pool.filter((e) => e !== me.email);
      if (!others.length) continue;
      
      const shuffled = others.sort(() => Math.random() - 0.5);
      const picks = shuffled.slice(0, Math.min(s.daily_target, others.length));

      let successCount = 0;
      let bounceCount = 0;

      // Send warmup emails
      for (const to of picks) {
        try {
          const subject = `👋 Quick hello from ${me.email.split("@")[0]}`;
          const body = `Hey! Just keeping the inbox warm — hope your day's great.`;

          // Send via appropriate provider
          if (me.provider === "gmail") {
            await sendViaGmail(me, to, subject, body);
          } else if (me.provider === "outlook") {
            await sendViaOutlook(me, to, subject, body);
          } else {
            throw new Error(`Unsupported provider: ${me.provider}`);
          }

          // Log success
          await sb.from("warmup_logs").insert({
            session_id: s.id,
            to_email: to,
            subject,
            body,
            status: "sent",
          });

          successCount++;
        } catch (err) {
          // Log failure (potential bounce)
          await sb.from("warmup_logs").insert({
            session_id: s.id,
            to_email: to,
            subject: `👋 Quick hello from ${me.email.split("@")[0]}`,
            body: `Hey! Just keeping the inbox warm — hope your day's great.`,
            status: "failed",
          });
          bounceCount++;
        }
      }

      // Update session counters
      await sb
        .from("warmup_sessions")
        .update({
          total_sent: s.total_sent + picks.length,
          last_sent_at: new Date().toISOString(),
          daily_target: Math.min(s.daily_target + 5, 50), // Ramp up, cap at 50
        })
        .eq("id", s.id);

      // Update health score: +2 for success, -5 for bounces
      if (successCount > 0 || bounceCount > 0) {
        const { data: currentProfile } = await sb
          .from("sender_profiles")
          .select("health_score")
          .eq("id", me.id)
          .single();

        if (currentProfile) {
          let newHealth = (currentProfile.health_score || 60) + (successCount * 2) - (bounceCount * 5);
          newHealth = Math.max(0, Math.min(100, newHealth));

          await sb
            .from("sender_profiles")
            .update({ health_score: newHealth })
            .eq("id", me.id);
        }
      }

      results.push({
        sender: me.email,
        sent: picks.length,
        success: successCount,
        bounces: bounceCount,
      });
    }

    return new Response(JSON.stringify({ ok: true, results }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});

