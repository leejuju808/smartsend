// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const sb = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } }
);

type ProviderAccount = {
  id: string;
  account_id: string;
  provider: string;
  email: string;
  tokens: {
    access_token?: string;
  } | null;
  poll: {
    cursor?: Record<string, unknown> | null;
  } | null;
};

const GRAPH = "https://graph.microsoft.com/v1.0";

Deno.serve(async () => {
  const { data: accts, error } = await sb
    .from("provider_accounts")
    .select("id,account_id,provider,email,tokens:provider_tokens(*), poll:provider_poll_state(*)")
    .eq("provider", "outlook");

  if (error) {
    console.error("Failed to load provider accounts", error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  let ingested = 0;

  for (const a of (accts ?? []) as ProviderAccount[]) {
    const access = a.tokens?.access_token;
    if (!access) continue;

    const since = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
    const url = `${GRAPH}/me/messages?$top=50&$filter=receivedDateTime ge ${since}`;

    const listRes = await fetch(url, {
      headers: { Authorization: `Bearer ${access}` }
    });

    if (!listRes.ok) {
      console.error("outlook list failed", await listRes.text());
      continue;
    }

    const li = await listRes.json();

    for (const m of li.value ?? []) {
      const exists = await sb
        .from("inbound_messages")
        .select("id")
        .eq("provider", "outlook")
        .eq("provider_msg_id", m.id)
        .maybeSingle();
      if (exists.data) continue;

      const from = m.from?.emailAddress?.address?.toLowerCase();
      const to =
        m.toRecipients?.[0]?.emailAddress?.address?.toLowerCase() ??
        m.to?.[0]?.emailAddress?.address?.toLowerCase() ??
        m.sender?.emailAddress?.address?.toLowerCase() ??
        null;

      if (!from || !to) continue;

      const { data: lead } = await sb
        .from("leads")
        .select("id")
        .eq("email", from)
        .maybeSingle();

      const { data: ident } = await sb
        .from("send_identities")
        .select("id")
        .eq("email", to)
        .maybeSingle();

      const payload = {
        provider: "outlook",
        provider_msg_id: m.id as string,
        provider_thread_id: m.conversationId as string | null,
        account_id: a.account_id,
        identity_id: ident?.id ?? null,
        lead_id: lead?.id ?? null,
        from_email: from,
        to_email: to,
        subject: m.subject ?? null,
        snippet: (m.bodyPreview || "").slice(0, 180),
        text_body: m.body?.contentType === "text" ? (m.body?.content ?? null) : null,
        html_body: m.body?.contentType === "html" ? (m.body?.content ?? null) : null,
        headers: {},
        campaign_id: null,
        send_queue_id: null,
        in_reply_to: null,
        references_ids: [] as string[],
        received_at: m.receivedDateTime ?? new Date().toISOString()
      };

      const insertRes = await sb.from("inbound_messages").insert(payload);
      if (insertRes.error) {
        console.error("Failed to insert outlook inbound", insertRes.error);
        continue;
      }
      ingested++;
    }

    await sb.from("provider_poll_state").upsert({
      provider_account_id: a.id,
      provider: "outlook",
      cursor: {},
      updated_at: new Date().toISOString()
    });
  }

  return new Response(JSON.stringify({ ingested }), {
    headers: { "content-type": "application/json" }
  });
});
