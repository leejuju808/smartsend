import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { encode as encodeBase64Url } from "https://deno.land/std@0.224.0/encoding/base64url.ts";

type SendResult = { ok: true; provider_id?: string } | { ok: false; code?: string; error?: string; retryable?: boolean };

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) {
    return new Response("Missing Supabase env", { status: 500 });
  }

  const sb = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  let body: {
    thread_id: string;
    identity_id?: string;
    template_id?: string;
    subject?: string;
    html?: string;
  } | null = null;

  try {
    body = (await req.json().catch(() => null)) as typeof body;
  } catch {
    body = null;
  }

  if (!body?.thread_id) {
    return new Response("Missing thread_id", { status: 400 });
  }

  try {
    const { data: thread, error: threadErr } = await sb
      .from("reply_threads")
      .select("id, account_id, lead_id, campaign_id, identity_id, last_message_at")
      .eq("id", body.thread_id)
      .single();

    if (threadErr || !thread) {
      return new Response("Thread not found", { status: 404 });
    }

    const { data: lastInbound, error: inboundErr } = await sb
      .from("inbound_messages")
      .select(
        `
          id,
          provider,
          provider_msg_id,
          provider_thread_id,
          subject,
          from_email,
          to_email,
          headers,
          references_ids,
          received_at
        `
      )
      .eq("thread_id", thread.id)
      .order("received_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (inboundErr || !lastInbound) {
      return new Response("No inbound to reply to", { status: 409 });
    }

    const identityId = body.identity_id ?? thread.identity_id;
    if (!identityId) {
      return new Response("Missing identity_id", { status: 400 });
    }

    const { data: ident, error: identErr } = await sb
      .from("send_identities")
      .select(
        `
          id,
          account_id,
          email,
          provider,
          provider_account_id,
          provider_accounts:provider_account_id (
            id,
            provider,
            email
          ),
          tokens:provider_tokens!provider_account_id (
            access_token,
            refresh_token,
            expires_at
          )
        `
      )
      .eq("id", identityId)
      .single();

    if (identErr || !ident) {
      return new Response("Identity not found", { status: 400 });
    }

    if (ident.account_id !== thread.account_id) {
      return new Response("Identity mismatch", { status: 403 });
    }

    const providerAccount = Array.isArray(ident.provider_accounts)
      ? ident.provider_accounts[0]
      : ident.provider_accounts;
    const tokenRow = Array.isArray(ident.tokens) ? ident.tokens[0] : ident.tokens;

    if (!providerAccount?.provider || !tokenRow?.access_token) {
      return new Response("Identity missing provider token", { status: 400 });
    }

    let subject =
      body.subject ??
      (lastInbound.subject?.toLowerCase().startsWith("re:")
        ? lastInbound.subject ?? ""
        : `Re: ${lastInbound.subject ?? ""}`);

    let html = body.html ?? "";

    if (body.template_id) {
      const { data: tmpl, error: tmplErr } = await sb
        .from("reply_templates")
        .select("subject, body, account_id")
        .eq("id", body.template_id)
        .single();

      if (tmplErr || !tmpl) {
        return new Response("Template missing", { status: 400 });
      }

      if (tmpl.account_id !== thread.account_id) {
        return new Response("Template mismatch", { status: 403 });
      }

      const { data: rendered, error: renderErr } = await sb.rpc("render_reply_template", {
        p_text: tmpl.body,
        p_lead: thread.lead_id,
        p_identity: ident.id,
      });

      if (renderErr) {
        return new Response(renderErr.message || "Failed to render template", { status: 500 });
      }

      html = (rendered as string | null) ?? "";
      if (tmpl.subject) {
        subject = tmpl.subject;
      }
    }

    const quoted = `<br><br><div style="border-left:2px solid #ddd;padding-left:8px;margin-top:8px;">
    <div style="font-size:12px;color:#666;">On ${new Date(lastInbound.received_at).toLocaleString()}, ${lastInbound.from_email} wrote:</div>
  </div>`;

    if (!html) {
      html = `Thanks for the reply!${quoted}`;
    }

    const to = lastInbound.from_email;
    if (!to) {
      return new Response("Inbound missing from_email", { status: 400 });
    }

    const headers = (lastInbound.headers ?? {}) as Record<string, unknown>;
    const inReplyTo =
      (typeof headers["message-id"] === "string" ? (headers["message-id"] as string) : null) ??
      (lastInbound.provider_msg_id ?? null);

    const refSource = lastInbound.references_ids;
    const referenceList = Array.isArray(refSource)
      ? (refSource as string[])
      : typeof refSource === "string"
      ? refSource.split(/\s+/).filter(Boolean)
      : [];
    const references = Array.from(
      new Set([...(referenceList as string[]), inReplyTo].filter((v): v is string => !!v))
    );

    const provider = (providerAccount.provider ?? ident.provider ?? "").toLowerCase();

    let sendResult: SendResult;
    if (provider === "gmail") {
      sendResult = await sendGmailReply({
        accessToken: tokenRow.access_token,
        fromEmail: providerAccount.email ?? ident.email,
        to,
        subject,
        html,
        inReplyTo,
        references,
        threadId: lastInbound.provider_thread_id ?? undefined,
      });
    } else if (provider === "outlook") {
      sendResult = await sendOutlookReply({
        accessToken: tokenRow.access_token,
        fromEmail: providerAccount.email ?? ident.email,
        to,
        subject,
        html,
        inReplyTo,
        references,
      });
    } else {
      return new Response("Unsupported provider", { status: 400 });
    }

    if (!sendResult.ok) {
      return new Response(JSON.stringify(sendResult), {
        status: 502,
        headers: { "content-type": "application/json" },
      });
    }

    const insertRes = await sb.from("outbound_messages").insert({
      provider,
      provider_msg_id: sendResult.provider_id ?? null,
      account_id: thread.account_id,
      identity_id: ident.id,
      thread_id: thread.id,
      lead_id: thread.lead_id,
      campaign_id: thread.campaign_id,
      to_email: to,
      subject,
      html_body: html,
      headers: { "in-reply-to": inReplyTo, references },
    });

    if (insertRes.error) {
      console.error("Failed to log outbound message", insertRes.error);
    }

    const updateThread = await sb
      .from("reply_threads")
      .update({
        identity_id: ident.id,
        last_message_at: new Date().toISOString(),
      })
      .eq("id", thread.id);

    if (updateThread.error) {
      console.error("Failed to update reply thread", updateThread.error);
    }

    const slaRes = await sb.rpc("mark_first_response_met", { p_thread: thread.id });
    if (slaRes.error) {
      console.error("Failed to mark SLA met", slaRes.error);
    }

    return new Response(
      JSON.stringify({ ok: true, provider_id: sendResult.provider_id ?? null }),
      { headers: { "content-type": "application/json" } }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("reply-send error", error);
    return new Response(message, { status: 500 });
  }
});

function buildRfc822(input: {
  from: string;
  to: string;
  subject: string;
  html: string;
  inReplyTo?: string | null;
  references?: string[];
}) {
  const boundary = `mixed_${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`;
  const headers = [
    `From: ${input.from}`,
    `To: ${input.to}`,
    `Subject: ${input.subject}`,
    input.inReplyTo ? `In-Reply-To: ${input.inReplyTo}` : null,
    input.references?.length ? `References: ${input.references.join(" ")}` : null,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
  ]
    .filter(Boolean)
    .join("\n");

  const raw = `${headers}

--${boundary}
Content-Type: text/html; charset="UTF-8"
Content-Transfer-Encoding: 7bit

${input.html}

--${boundary}--`;

  const bytes = new TextEncoder().encode(raw);
  return encodeBase64Url(bytes);
}

async function sendGmailReply(args: {
  accessToken: string;
  fromEmail: string;
  to: string;
  subject: string;
  html: string;
  inReplyTo?: string | null;
  references?: string[];
  threadId?: string;
}): Promise<SendResult> {
  const raw = buildRfc822({
    from: args.fromEmail,
    to: args.to,
    subject: args.subject,
    html: args.html,
    inReplyTo: args.inReplyTo ?? undefined,
    references: args.references,
  });

  const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${args.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      raw,
      threadId: args.threadId,
    }),
  });

  if (!response.ok) {
    const json = await response.json().catch(() => ({}));
    return {
      ok: false,
      code: json?.error?.status ?? "unknown",
      error: json?.error?.message ?? response.statusText,
      retryable: response.status >= 500,
    };
  }

  const json = await response.json().catch(() => ({}));
  return { ok: true, provider_id: json?.id ?? null };
}

async function sendOutlookReply(args: {
  accessToken: string;
  fromEmail: string;
  to: string;
  subject: string;
  html: string;
  inReplyTo?: string | null;
  references?: string[];
}): Promise<SendResult> {
  const headers = [
    ...(args.inReplyTo ? [{ name: "In-Reply-To", value: args.inReplyTo }] : []),
    ...(args.references?.length ? [{ name: "References", value: args.references.join(" ") }] : []),
  ];

  const response = await fetch("https://graph.microsoft.com/v1.0/me/sendMail", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${args.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message: {
        subject: args.subject,
        body: {
          contentType: "HTML",
          content: args.html,
        },
        toRecipients: [{ emailAddress: { address: args.to } }],
        from: { emailAddress: { address: args.fromEmail } },
        internetMessageHeaders: headers,
      },
      saveToSentItems: true,
    }),
  });

  if (!response.ok) {
    const json = await response.json().catch(() => ({}));
    return {
      ok: false,
      code: json?.error?.code ?? "unknown",
      error: json?.error?.message ?? response.statusText,
      retryable: response.status >= 500,
    };
  }

  return { ok: true, provider_id: crypto.randomUUID() };
}

