// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

type Account = { id: string; provider: string; email: string; access_token: string | null };

async function gmailHistoryList(token: string, startHistoryId?: string) {
  const url = new URL("https://gmail.googleapis.com/gmail/v1/users/me/history");
  url.searchParams.set("historyTypes", "messageAdded");
  url.searchParams.set("maxResults", "100");
  if (startHistoryId) url.searchParams.set("startHistoryId", startHistoryId);
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`history: ${res.status} ${await res.text()}`);
  return res.json();
}

async function gmailGetMessage(token: string, id: string) {
  const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`message: ${res.status} ${await res.text()}`);
  return res.json();
}

function hdr(headers: any[], name: string) {
  return headers.find((h: any) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? null;
}

function decodeBody(parts: any[]): { html?: string; text?: string } {
  let html = "", text = "";
  const walk = (p: any) => {
    if (p.mimeType === "text/html" && p.body?.data) {
      html += atob(p.body.data.replace(/-/g, "+").replace(/_/g, "/"));
    } else if (p.mimeType === "text/plain" && p.body?.data) {
      text += atob(p.body.data.replace(/-/g, "+").replace(/_/g, "/"));
    }
    (p.parts ?? []).forEach(walk);
  };
  (parts ?? []).forEach(walk);
  return { html: html || undefined, text: text || undefined };
}

Deno.serve(async () => {
  // Pull all Gmail accounts with tokens
  const { data: accounts } = await supabase
    .from("connected_accounts")
    .select("id, provider, email, access_token")
    .eq("provider", "gmail");

  if (!accounts?.length) return new Response("no gmail accounts");

  let processed = 0;

  for (const acc of accounts as Account[]) {
    if (!acc.access_token) continue;

    // Load sync state
    const { data: state } = await supabase
      .from("mail_sync_state")
      .select("id, gmail_history_id")
      .eq("account_id", acc.id)
      .maybeSingle();

    let startHistoryId = state?.gmail_history_id ?? undefined;
    const history = await gmailHistoryList(acc.access_token, startHistoryId);

    const messageIds: string[] = [
      ...(history?.history ?? [])
        .flatMap((h: any) => (h.messagesAdded ?? []).map((m: any) => m.message.id))
    ];

    for (const mid of messageIds) {
      const msg = await gmailGetMessage(acc.access_token, mid);
      const headers = msg.payload?.headers ?? [];
      const subject = hdr(headers, "Subject") ?? "";
      const from = hdr(headers, "From") ?? "";
      const to = hdr(headers, "To") ?? "";
      const messageId = hdr(headers, "Message-Id");
      const inReplyTo = hdr(headers, "In-Reply-To");
      const autoSubmitted = hdr(headers, "Auto-Submitted");
      const xAutoReply = hdr(headers, "X-Autoreply") ?? hdr(headers, "X-Autorespond");
      const diagnostic = hdr(headers, "Diagnostic-Code");
      const status = hdr(headers, "Status");

      const { html, text } = decodeBody(msg.payload?.parts ?? []);
      const bodyText = text ?? (html ? html.replace(/<[^>]+>/g, " ") : "");

      // Attempt mapping via previous send (inReplyTo)
      let campaignId = null, leadId = null, threadId = null;

      if (inReplyTo) {
        const { data: log } = await supabase
          .from("send_logs")
          .select("campaign_id, lead_id, thread_id")
          .eq("provider_message_id", inReplyTo)
          .maybeSingle();
        campaignId = log?.campaign_id ?? null;
        leadId = log?.lead_id ?? null;
        threadId = log?.thread_id ?? null;
      }

      // Thread fallback
      const { data: t } = await supabase.rpc("upsert_thread_for_inbound", {
        p_campaign: campaignId,
        p_lead: leadId,
        p_from_email: from,
        p_to_email: to
      });
      threadId = threadId ?? t;

      // Insert inbound message
      const { data: insertedMsg, error } = await supabase.from("inbox_messages").insert({
        thread_id: threadId,
        campaign_id: campaignId,
        account_id: acc.id,
        lead_id: leadId,
        from_email: from,
        to_email: to,
        subject,
        body_html: html ?? null,
        body_text: bodyText ?? null,
        message_id: messageId,
        in_reply_to: inReplyTo,
        received_at: new Date(Number(msg.internalDate)).toISOString(),
        direction: 'in',
        raw: {
          headers: Object.fromEntries(headers.map((h: any)=>[h.name,h.value])),
          snippet: msg.snippet
        }
      }).select("id").single();

      if (error || !insertedMsg) continue;

      // Heuristics: OOO / Bounce immediate labeling (before LLM)
      const headersJson = Object.fromEntries(headers.map((h: any)=>[h.name,h.value]));
      const ooo =
        (headersJson["Auto-Submitted"]?.toLowerCase().startsWith("auto-replied")) ||
        !!xAutoReply || /out of office|automatic reply|autoreply|away until|vacation/i.test(subject);

      const bounce =
        (status && /^[245]\.\d+\.\d+/.test(status)) ||
        (diagnostic && /(user unknown|mailbox unavailable|policy|quota|relay)/i.test(diagnostic)) ||
        /undeliverable|delivery failed|mailbox full|5\.1\./i.test(bodyText);

      if (ooo || bounce) {
        await supabase.from("inbox_messages").update({
          ai_label: ooo ? "ooo" : "bounce",
          ai_confidence: 0.99,
          classified_at: new Date().toISOString()
        }).eq("id", insertedMsg.id);

        // Optional precise snooze for OOO
        if (ooo && threadId) {
          const m = /back (?:on|by|after)?\s*([A-Za-z]{3,9}\s+\d{1,2}(?:,\s*\d{4})?|\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)/i.exec(
            `${subject}\n${bodyText}`
          );
          if (m?.[1]) {
            try {
              // naive parse attempt (leave robust parse to a later slice)
              const parsedDate = new Date(Date.parse(m[1]));
              if (!isNaN(parsedDate.getTime())) {
                await supabase.from("inbox_threads").update({
                  snooze_until: parsedDate.toISOString()
                }).eq("id", threadId as string);
              }
            } catch (e) {
              // Ignore parse errors
            }
          }
        }
      }

      processed++;
    }

    // Advance historyId if provided
    if (history?.historyId) {
      if (state) {
        await supabase.from("mail_sync_state").update({
          gmail_history_id: String(history.historyId),
          updated_at: new Date().toISOString()
        }).eq("id", state.id);
      } else {
        await supabase.from("mail_sync_state").insert({
          account_id: acc.id,
          gmail_history_id: String(history.historyId)
        });
      }
    }
  }

  return new Response(JSON.stringify({ processed }), { headers: { "Content-Type": "application/json" } });
});

