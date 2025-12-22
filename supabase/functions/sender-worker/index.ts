// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

// ----- Tiny template render: {{first_name}} etc.
function renderTemplate(tpl: string | null, data: Record<string, any>): string {
  if (!tpl) return "";
  return tpl.replace(/\{\{\s*([a-zA-Z0-9_\.]+)\s*\}\}/g, (_, key) => {
    const parts = key.split(".");
    let val: any = data;
    for (const p of parts) val = val?.[p];
    return (val ?? "").toString();
  });
}

// Base64url for Gmail
function base64url(input: string): string {
  return btoa(unescape(encodeURIComponent(input)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

// ----- Provider adapters
async function sendViaGmail(token: string, rawRfc822: string): Promise<{ id: string; threadId: string | null }> {
  const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ raw: base64url(rawRfc822) })
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`Gmail send failed: ${res.status} ${JSON.stringify(json)}`);

  let threadId = (json.threadId as string | undefined) ?? null;

  if ((!threadId) && json.id) {
    try {
      const metaRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${json.id}?format=metadata`, {
        headers: { "Authorization": `Bearer ${token}` }
      });
      if (metaRes.ok) {
        const meta = await metaRes.json();
        threadId = (meta.threadId as string | undefined) ?? threadId;
      }
    } catch (_err) {
      // best-effort; ignore
    }
  }

  return { id: json.id as string, threadId };
}

async function sendViaOutlook(
  token: string,
  msg: { to: string; subject: string; html: string; messageId: string }
): Promise<{ id: string; threadId: string | null }> {
  const res = await fetch("https://graph.microsoft.com/v1.0/me/sendMail", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      message: {
        subject: msg.subject,
        body: { contentType: "HTML", content: msg.html },
        toRecipients: [{ emailAddress: { address: msg.to } }],
        internetMessageHeaders: [
          { name: "Message-ID", value: msg.messageId },
          { name: "References", value: msg.messageId }
        ]
      },
      saveToSentItems: true
    })
  });

  // Many teams instead use /me/messages to create + send MIME via /me/messages/{id}/send.
  // Simpler path: use SMTP with OAuth2 if enabled. If Graph MIME support is limited, switch to SMTP.
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Outlook send failed: ${res.status} ${text}`);
  }
  // Graph doesn't return an id here; in production use create+send flow to capture internetMessageId
  return { id: "", threadId: null };
}

// Build raw email (RFC 5322). Simple HTML alternative part.
function buildRfc822(fromEmail: string, toEmail: string, subject: string, html: string, headers: Record<string,string> = {}) {
  const boundary = "b-" + crypto.randomUUID();
  const baseHeaders = {
    From: fromEmail,
    To: toEmail,
    Subject: subject,
    "MIME-Version": "1.0",
    "Content-Type": `multipart/alternative; boundary="${boundary}"`
  };
  const allHeaders = { ...baseHeaders, ...headers };
  const head = Object.entries(allHeaders).map(([k, v]) => `${k}: ${v}`).join("\r\n");

  const body =
`--${boundary}
Content-Type: text/plain; charset=UTF-8

${subject}

--${boundary}
Content-Type: text/html; charset=UTF-8

${html}

--${boundary}--`;

  return `${head}\r\n\r\n${body}`;
}

function backoffMs(attempts: number) {
  const seq = [60_000, 5*60_000, 25*60_000, 2*60*60_000, 6*60*60_000];
  return seq[Math.min(attempts, seq.length - 1)];
}

Deno.serve(async () => {
  // 1) Fetch due items from the view
  const { data: queueItems, error: queueErr } = await supabase
    .from("vw_sendable_items")
    .select("id, campaign_id, lead_id, step_id, variant_id, account_id, mailbox_id, attempts, subject, body_html, body, tracking_token")
    .limit(25);

  if (queueErr) return new Response(queueErr.message, { status: 500 });
  if (!queueItems?.length) return new Response("no work");

  // 2) Fetch related data in batch
  const queueIds = queueItems.map(q => q.id);
  const leadIds = [...new Set(queueItems.map(q => q.lead_id).filter(Boolean))];
  const stepIds = [...new Set(queueItems.map(q => q.step_id).filter(Boolean))];
  const variantIds = [...new Set(queueItems.map(q => q.variant_id).filter(Boolean))];
  const accountIds = [...new Set(queueItems.map(q => q.account_id || q.mailbox_id).filter(Boolean))];
  const campaignAccountIds = [...new Set(queueItems.map(q => q.account_id).filter(Boolean))];

  const [leadsRes, stepsRes, variantsRes, accountsRes, accountPauseRes] = await Promise.all([
    leadIds.length ? supabase.from("leads").select("*").in("id", leadIds) : { data: [] },
    stepIds.length ? supabase.from("campaign_steps").select("id, subject_template, body_html_template, paused").in("id", stepIds) : { data: [] },
    variantIds.length
      ? supabase.from("nudge_variants").select("id, preset_id, name, status").in("id", variantIds)
      : { data: [] },
    accountIds.length ? supabase.from("connected_accounts").select("id, provider, email, access_token, refresh_token, provider_domain, paused").in("id", accountIds) : { data: [] },
    campaignAccountIds.length ? supabase.from("accounts").select("id, paused").in("id", campaignAccountIds) : { data: [] }
  ]);

  const presetIds = [...new Set((variantsRes.data || []).map((v: any) => v.preset_id).filter(Boolean))];
  const presetsRes = presetIds.length
    ? await supabase.from("nudge_presets").select("id, key").in("id", presetIds)
    : { data: [] };

  const leadsMap = new Map((leadsRes.data || []).map(l => [l.id, l]));
  const stepsMap = new Map((stepsRes.data || []).map(s => [s.id, s]));
  const presetMap = new Map((presetsRes.data || []).map((p: any) => [p.id, p]));
  const variantsMap = new Map(
    (variantsRes.data || []).map((v: any) => [
      v.id,
      {
        ...v,
        preset_key: v.preset_id ? presetMap.get(v.preset_id)?.key ?? null : null,
      },
    ])
  );
  const accountsMap = new Map((accountsRes.data || []).map(a => [a.id, a]));
  const accountPauseMap = new Map((accountPauseRes.data || []).map(a => [a.id, a]));

  // 3) Combine data
  const dueItems = queueItems.map(item => ({
    ...item,
    lead: leadsMap.get(item.lead_id),
    step: stepsMap.get(item.step_id),
    variant: variantsMap.get(item.variant_id),
    account: accountsMap.get(item.account_id || item.mailbox_id),
    accountPause: item.account_id ? accountPauseMap.get(item.account_id) : null
  }));

  let sent = 0, failed = 0;

  for (const item of dueItems) {
    const accountId = item.account_id || item.mailbox_id;
    const variantInactive =
      item.variant_id &&
      item.variant &&
      item.variant.status &&
      item.variant.status !== "active";
    const stepPaused = item.step_id && item.step && item.step.paused === true;
    const accountPaused =
      (item.account && item.account.paused === true) ||
      (item.account_id && item.accountPause && item.accountPause.paused === true);

    if (variantInactive || stepPaused || accountPaused) {
      const reason = variantInactive
        ? "guard_variant_paused"
        : stepPaused
        ? "guard_step_paused"
        : "guard_account_paused";
      await supabase.from("send_queue").update({
        status: "skipped",
        last_error: reason
      }).eq("id", item.id);

      await supabase.from("send_logs").insert({
        queue_id: item.id,
        campaign_id: item.campaign_id,
        account_id: accountId,
        lead_id: item.lead_id,
        step_id: item.step_id || null,
        variant_id: item.variant_id || null,
        status: "skipped",
        error_text: reason,
        tracking_token: item.tracking_token || null
      });
      continue;
    }

    // Lock: mark sending to avoid double work (best-effort)
    await supabase.from("send_queue")
      .update({ status: "sending" })
      .eq("id", item.id)
      .eq("status", "queued");

    const toEmail = item.lead?.email;
    const fromEmail = item.account?.email;
    
    if (!toEmail || !fromEmail) {
      failed++;
      await supabase.from("send_queue").update({
        status: "failed",
        attempts: (item.attempts ?? 0) + 1,
        last_error: "missing to/from"
      }).eq("id", item.id);
      continue;
    }

    // Get step template
    const step = item.step;
    const subjectTemplate = step?.subject_template || "";
    const bodyHtmlTemplate = step?.body_html_template || "";

    // Prefer effective fields (from rewrites) if present, else fallback to original
    let subject = item.subject_effective ?? item.subject || "";
    let html = item.body_html_effective ?? item.body_html ?? item.body || "";

    if (!subject || !html) {
      // Render templates using render-merge function if needed
      try {
        const renderRes = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/render-merge`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}` },
          body: JSON.stringify({
            campaign_id: item.campaign_id,
            lead_id: item.lead_id,
            subject_template: subjectTemplate,
            html_template: bodyHtmlTemplate
          })
        });
        const renderData = await renderRes.json();
        if (renderData.ok) {
          subject = subject || renderData.subject;
          html = html || renderData.html;
        } else {
          const tokens = {
            lead: item.lead,
            campaign_id: item.campaign_id
          };
          subject = subject || renderTemplate(subjectTemplate, tokens);
          html = html || renderTemplate(bodyHtmlTemplate, tokens);
        }
      } catch (_renderErr) {
        const tokens = {
          lead: item.lead,
          campaign_id: item.campaign_id
        };
        subject = subject || renderTemplate(subjectTemplate, tokens);
        html = html || renderTemplate(bodyHtmlTemplate, tokens);
      }
    }

    const domain = Deno.env.get("MESSAGE_ID_DOMAIN") ?? "m.smartsend.ai";
    const messageId = `<q_${item.id}@${domain}>`;

    if (item.account_id) {
      const { error: mapErr } = await supabase.from("send_message_ids").upsert({
        queue_id: item.id,
        account_id: item.account_id,
        message_id: messageId
      });
      if (mapErr) {
        console.error("send_message_ids upsert failed", { queue_id: item.id, error: mapErr.message });
      }
    } else {
      console.warn("send_queue row missing account_id for message mapping", item.id);
    }

    const headers: Record<string,string> = {
      "Message-ID": messageId,
      "References": messageId,
      "X-SmartSend-Campaign": String(item.campaign_id),
      "X-SmartSend-Lead": String(item.lead_id),
      "X-SmartSend-Step": String(item.step_id || "")
    };

    // Build MIME
    const mime = buildRfc822(fromEmail, toEmail, subject, html, headers);

    try {
      let providerMessageId = "";
      let providerThreadId: string | null = null;
      const provider = item.account?.provider || "gmail";
      const accessToken = item.account?.access_token;
      
      if (!accessToken) {
        throw new Error("Missing access token");
      }

      if (provider === "gmail") {
        const gmailResult = await sendViaGmail(accessToken, mime);
        providerMessageId = gmailResult.id;
        providerThreadId = gmailResult.threadId ?? null;
      } else if (provider === "outlook") {
        const outlookResult = await sendViaOutlook(accessToken, {
          to: toEmail,
          subject,
          html,
          messageId
        });
        providerMessageId = outlookResult.id;
        providerThreadId = outlookResult.threadId ?? null;
      } else {
        throw new Error(`Unsupported provider: ${provider}`);
      }

      if (item.account_id) {
        const { error: updateErr } = await supabase.from("send_message_ids")
          .update({
            provider_msg_id: providerMessageId || null,
            provider_thread_id: providerThreadId || null
          })
          .eq("queue_id", item.id);
        if (updateErr) {
          console.error("send_message_ids provider update failed", { queue_id: item.id, error: updateErr.message });
        }
      }

      // Write send_logs
      await supabase.from("send_logs").insert({
        queue_id: item.id,
        campaign_id: item.campaign_id,
        account_id: accountId,
        lead_id: item.lead_id,
        step_id: item.step_id || null,
        variant_id: item.variant_id || null,
        provider_message_id: providerMessageId || null,
        status: "sent",
        sent_at: new Date().toISOString(),
        tracking_token: item.tracking_token || null
      });

      // Update queue
      await supabase.from("send_queue").update({
        status: "sent",
        sent_at: new Date().toISOString(),
        message_id: messageId,
        provider_message_id: providerMessageId || null,
        attempts: (item.attempts ?? 0) + 1,
        last_error: null
      }).eq("id", item.id);

      // Block 14400: Set source_campaign_id on contact if it's currently null
      // This attaches the contact to the first campaign that touched them via SmartSend
      if (item.lead_id && item.campaign_id) {
        await supabase
          .from("contacts")
          .update({ source_campaign_id: item.campaign_id })
          .eq("id", item.lead_id)
          .is("source_campaign_id", null);
      }

      // Block 8920: Update pipeline_stage when first outbound is sent (new → contacted)
      if (item.lead_id && item.campaign_id && accountId) {
        // Note: lead_id in send_queue might be contact_id, verify the mapping
        const contactId = item.lead_id; // Assuming lead_id maps to contact_id
        await supabase.rpc("update_pipeline_stage_on_outbound", {
          p_account_id: accountId,
          p_campaign_id: item.campaign_id,
          p_contact_id: contactId,
        }).catch((err) => {
          // Don't fail the send if pipeline update fails
          console.error("Failed to update pipeline_stage on outbound:", err);
        });
      }

      // TODO (optional): create/link thread, e.g. upsert inbox_threads by (lead_id, campaign_id)
      sent++;

      const variantMeta = item.variant_id ? variantsMap.get(item.variant_id) : null;
      const presetKey = variantMeta?.preset_key ?? null;
      if (presetKey && item.account_id) {
        await supabase.from("email_sends").insert({
          account_id: item.account_id,
          campaign_id: item.campaign_id,
          lead_id: item.lead_id,
          message_id: null,
          preset_key: presetKey,
          variant_id: item.variant_id,
          subject,
          to_email: toEmail,
          status: "sent",
          meta: {
            variant_name: variantMeta?.name ?? null,
            queue_id: item.id,
            provider_message_id: providerMessageId || null,
          },
        });
      }
    } catch (err) {
      const attempts = (item.attempts ?? 0) + 1;
      const delay = backoffMs(attempts);
      const next = new Date(Date.now() + delay).toISOString();

      await supabase.from("send_queue").update({
        status: "queued",
        attempts,
        last_error: String(err?.message ?? err),
        next_attempt_at: next
      }).eq("id", item.id);

      await supabase.from("send_logs").insert({
        queue_id: item.id,
        campaign_id: item.campaign_id,
        account_id: accountId,
        lead_id: item.lead_id,
        step_id: item.step_id || null,
        variant_id: item.variant_id || null,
        status: "error",
        error_text: String(err?.message ?? err),
        tracking_token: item.tracking_token || null
      });

      failed++;
    }
  }

  return new Response(JSON.stringify({ sent, failed }), { headers: { "Content-Type": "application/json" } });
});

