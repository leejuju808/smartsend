// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

async function graphDelta(token: string, deltaUrl?: string) {
  const url = deltaUrl ?? "https://graph.microsoft.com/v1.0/me/mailFolders('Inbox')/messages/delta";
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.json();
}

Deno.serve(async () => {
  const { data: accounts } = await supabase
    .from("connected_accounts")
    .select("id, provider, email, access_token")
    .eq("provider", "outlook");

  if (!accounts?.length) return new Response("no outlook");

  let processed = 0;

  for (const acc of accounts) {
    if (!acc.access_token) continue;

    const { data: state } = await supabase
      .from("mail_sync_state")
      .select("id, outlook_delta_token")
      .eq("account_id", acc.id)
      .maybeSingle();

    let deltaUrl = state?.outlook_delta_token ?? undefined;
    const page = await graphDelta(acc.access_token, deltaUrl);

    for (const m of page.value ?? []) {
      if (m["@removed"]) continue; // deletions

      const headers = m.internetMessageHeaders?.reduce((o: any, h: any) => (o[h.name]=h.value, o), {}) ?? {};
      const subject = m.subject ?? "";
      const from = m.from?.emailAddress?.address ?? "";
      const to = m.toRecipients?.[0]?.emailAddress?.address ?? "";
      const messageId = headers["Message-ID"] ?? null;
      const inReplyTo = headers["In-Reply-To"] ?? null;

      // Load body
      const bodyText = (m.body?.contentType === "text") ? m.body.content :
        (m.body?.contentType === "html" ? (m.body.content as string).replace(/<[^>]+>/g, " ") : "");

      // Map to thread via inReplyTo → send_logs
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

      const { data: t } = await supabase.rpc("upsert_thread_for_inbound", {
        p_campaign: campaignId,
        p_lead: leadId,
        p_from_email: from,
        p_to_email: to
      });
      threadId = threadId ?? t;

      const { data: insertedMsg, error: insertError } = await supabase.from("inbox_messages").insert({
        thread_id: threadId,
        campaign_id: campaignId,
        account_id: acc.id,
        lead_id: leadId,
        from_email: from,
        to_email: to,
        subject,
        body_text: bodyText ?? null,
        message_id,
        in_reply_to: inReplyTo,
        received_at: m.receivedDateTime ?? new Date().toISOString(),
        direction: 'in',
        raw: { headers }
      }).select("id").single();

      if (insertError || !insertedMsg) continue;

      // Immediate heuristics
      const ooo = (headers["Auto-Submitted"]?.toLowerCase().startsWith("auto-replied")) ||
                  headers["X-Autoreply"] || /out of office|automatic reply|autoreply|vacation/i.test(subject);
      const bounce = /undeliverable|delivery failed|mailbox full|5\.\d+\.\d+|550 /i.test(bodyText ?? "");

      if (ooo || bounce) {
        await supabase.from("inbox_messages").update({
          ai_label: ooo ? "ooo" : "bounce",
          ai_confidence: 0.99,
          classified_at: new Date().toISOString()
        }).eq("id", insertedMsg.id);
      }

      processed++;
    }

    // Advance delta link
    const newToken = page["@odata.deltaLink"] ?? page["@odata.nextLink"];
    if (newToken) {
      if (state) {
        await supabase.from("mail_sync_state").update({
          outlook_delta_token: newToken, updated_at: new Date().toISOString()
        }).eq("id", state.id);
      } else {
        await supabase.from("mail_sync_state").insert({
          account_id: acc.id, outlook_delta_token: newToken
        });
      }
    }
  }

  return new Response(JSON.stringify({ processed }), { headers: { "Content-Type": "application/json" } });
});

