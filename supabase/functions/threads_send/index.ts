// supabase/functions/threads_send/index.ts
// Send reply via Gmail/Outlook provider
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GMAIL_SEND_URL = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send";
const OUTLOOK_SEND_URL = "https://graph.microsoft.com/v1.0/me/sendMail";

function base64UrlEncode(input: string): string {
  const b64 = btoa(unescape(encodeURIComponent(input)));
  return b64.replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

async function sendGmail(raw: string, accessToken: string): Promise<{ id: string }> {
  const res = await fetch(GMAIL_SEND_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ raw: base64UrlEncode(raw) }),
  });

  if (!res.ok) {
    const error = await res.text();
    throw new Error(`Gmail send failed: ${error}`);
  }

  const json = await res.json();
  return { id: json.id || "" };
}

async function sendOutlook(raw: string, accessToken: string): Promise<{ id: string }> {
  // Outlook uses Graph API with message object
  // For now, we'll parse the MIME and construct the Graph payload
  // This is a simplified version - in production, properly parse MIME
  const lines = raw.split("\r\n");
  let inBody = false;
  const headers: Record<string, string> = {};
  let bodyHtml = "";

  for (const line of lines) {
    if (line === "" && !inBody) {
      inBody = true;
      continue;
    }
    if (!inBody && line.includes(":")) {
      const [key, ...valueParts] = line.split(":");
      headers[key.toLowerCase().trim()] = valueParts.join(":").trim();
    } else if (inBody) {
      bodyHtml += line + "\n";
    }
  }

  const message = {
    message: {
      subject: headers.subject || "",
      body: {
        contentType: "HTML",
        content: bodyHtml,
      },
      toRecipients: (headers.to || "").split(",").map((email: string) => ({
        emailAddress: { address: email.trim() },
      })),
      ...(headers.cc ? {
        ccRecipients: headers.cc.split(",").map((email: string) => ({
          emailAddress: { address: email.trim() },
        })),
      } : {}),
      ...(headers.bcc ? {
        bccRecipients: headers.bcc.split(",").map((email: string) => ({
          emailAddress: { address: email.trim() },
        })),
      } : {}),
    },
  };

  const res = await fetch(OUTLOOK_SEND_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(message),
  });

  if (!res.ok) {
    const error = await res.text();
    throw new Error(`Outlook send failed: ${error}`);
  }

  // Outlook doesn't return a message ID immediately, generate one
  return { id: crypto.randomUUID() };
}

Deno.serve(async (req) => {
  try {
    const { createClient } = await import("jsr:@supabase/supabase-js@2");
    const supa = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { global: { fetch } }
    );

    const payload = await req.json();
    const {
      org_id,
      thread_id,
      connection_id,
      to,
      cc,
      bcc,
      subject,
      html,
      quote_html,
    } = payload;

    if (!org_id || !thread_id || !connection_id || !to || !subject || !html) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400 }
      );
    }

    // Load connection + thread
    const { data: conn, error: cErr } = await supa
      .from("email_connections")
      .select("*")
      .eq("id", connection_id)
      .eq("org_id", org_id)
      .single();

    if (cErr || !conn) {
      return new Response(
        JSON.stringify({ error: "Connection not found" }),
        { status: 404 }
      );
    }

    const { data: thread, error: tErr } = await supa
      .from("email_threads")
      .select("*")
      .eq("id", thread_id)
      .eq("org_id", org_id)
      .single();

    if (tErr || !thread) {
      return new Response(
        JSON.stringify({ error: "Thread not found" }),
        { status: 404 }
      );
    }

    // Refresh token if needed (for Gmail)
    let accessToken = conn.access_token || "";
    if (conn.provider === "gmail" && conn.refresh_token && conn.token_expiry) {
      const expired = new Date(conn.token_expiry) <= new Date();
      if (expired) {
        const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID");
        const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET");

        if (GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET) {
          const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
              client_id: GOOGLE_CLIENT_ID,
              client_secret: GOOGLE_CLIENT_SECRET,
              grant_type: "refresh_token",
              refresh_token: conn.refresh_token,
            }),
          });

          if (tokenRes.ok) {
            const tokenJson = await tokenRes.json();
            accessToken = tokenJson.access_token;
            const newExpiry = new Date(
              Date.now() + (tokenJson.expires_in ?? 3600) * 1000
            ).toISOString();

            await supa
              .from("email_connections")
              .update({
                access_token: accessToken,
                token_expiry: newExpiry,
                updated_at: new Date().toISOString(),
              })
              .eq("id", conn.id);
          }
        }
      }
    }

    // Compose MIME string (very simple)
    const boundary = "bndry_" + crypto.randomUUID();
    const quoted = quote_html ? `\n<hr/>\n${quote_html}` : "";
    const htmlContent = html + quoted;

    const headers = [
      `From: ${conn.account_name || conn.account_email} <${conn.account_email}>`,
      `To: ${Array.isArray(to) ? to.join(", ") : to}`,
      ...(cc && Array.isArray(cc) && cc.length ? [`Cc: ${cc.join(", ")}`] : []),
      ...(bcc && Array.isArray(bcc) && bcc.length ? [`Bcc: ${bcc.join(", ")}`] : []),
      `Subject: ${subject || ""}`,
      "MIME-Version: 1.0",
      `Content-Type: multipart/alternative; boundary="${boundary}"`,
    ].join("\r\n");

    const htmlPart = `--${boundary}\r\nContent-Type: text/html; charset=UTF-8\r\n\r\n${htmlContent}\r\n--${boundary}--`;
    const rawMime = `${headers}\r\n\r\n${htmlPart}`;

    // Outbox enqueue (optimistic)
    const { data: outbox, error: oErr } = await supa
      .from("email_outbox")
      .insert({
        org_id,
        thread_id,
        connection_id,
        to_emails: Array.isArray(to) ? to : [to],
        cc_emails: cc && Array.isArray(cc) ? cc : [],
        bcc_emails: bcc && Array.isArray(bcc) ? bcc : [],
        subject,
        body_html: html,
        raw_mime: rawMime,
      })
      .select("*")
      .single();

    if (oErr) {
      return new Response(
        JSON.stringify({ error: oErr.message }),
        { status: 500 }
      );
    }

    try {
      let providerRes: { id: string };

      if (conn.provider === "gmail") {
        providerRes = await sendGmail(rawMime, accessToken);
      } else if (conn.provider === "outlook") {
        providerRes = await sendOutlook(rawMime, accessToken);
      } else {
        throw new Error("Unsupported provider");
      }

      // Mark outbox sent + write message + update thread
      await supa
        .from("email_outbox")
        .update({
          status: "sent",
          provider_message_id: providerRes.id || null,
          sent_at: new Date().toISOString(),
        })
        .eq("id", outbox.id);

      await supa.from("email_messages").insert({
        org_id,
        thread_id,
        direction: "out",
        from_email: conn.account_email,
        from_name: conn.account_name,
        to_emails: Array.isArray(to) ? to : [to],
        cc_emails: cc && Array.isArray(cc) ? cc : [],
        bcc_emails: bcc && Array.isArray(bcc) ? bcc : [],
        sent_at: new Date().toISOString(),
        snippet: html?.replace(/<[^>]+>/g, "").slice(0, 160) || null,
        body_html: html,
      });

      await supa
        .from("email_threads")
        .update({
          last_outgoing_at: new Date().toISOString(),
          status: "replied",
          updated_at: new Date().toISOString(),
        })
        .eq("id", thread_id)
        .eq("org_id", org_id);

      return new Response(
        JSON.stringify({ ok: true, id: providerRes.id || null }),
        { headers: { "Content-Type": "application/json" } }
      );
    } catch (e) {
      await supa
        .from("email_outbox")
        .update({ status: "failed", error: String(e) })
        .eq("id", outbox.id);
      return new Response(String(e), { status: 500 });
    }
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
  }
});

