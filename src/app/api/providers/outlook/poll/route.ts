import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { ensureAccessToken } from "@/lib/outlook";

export async function POST() {
  const supa = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  const { data: accounts, error } = await supa
    .from("connected_accounts")
    .select("id, workspace_id, email, access_token, refresh_token, token_expiry")
    .eq("provider", "outlook");
  if (error) return new NextResponse(error.message, { status: 500 });

  let inserted = 0;

  for (const acc of accounts ?? []) {
    const token = await ensureAccessToken(acc, async (t) => {
      await supa.from("connected_accounts").update({
        access_token: t.access_token,
        refresh_token: t.refresh_token ?? acc.refresh_token,
        token_expiry: t.token_expiry
      }).eq("id", acc.id);
    });

    // Pull last 24h not from me
    const cutoffDate = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const res = await fetch(
      `https://graph.microsoft.com/v1.0/me/messages?$top=50&$select=id,subject,receivedDateTime,from,bodyPreview,conversationId&$filter=receivedDateTime ge ${cutoffDate}`,
      {
        headers: { Authorization: `Bearer ${token}` }
      }
    );
    if (!res.ok) continue;
    const json = await res.json() as { value?: any[] };

    for (const m of json.value ?? []) {
      const provider_message_id = m.id as string;

      // skip if we already stored
      const exists = await supa
        .from("provider_messages")
        .select("id")
        .eq("provider", "outlook")
        .eq("provider_message_id", provider_message_id)
        .maybeSingle();
      if (exists.data) continue;

      const fromEmail = (m.from?.emailAddress?.address ?? "").toLowerCase();
      if (!fromEmail || fromEmail === acc.email.toLowerCase()) continue; // skip self

      const { data: lead } = await supa
        .from("leads")
        .select("id")
        .eq("email", fromEmail)
        .maybeSingle();
      if (!lead) continue;

      // try to map conversationId to our thread_id
      let thread_id: string | null = null;
      const convId = m.conversationId as string | undefined;

      if (convId) {
        const { data: pm } = await supa
          .from("provider_messages")
          .select("email_message_id")
          .eq("provider", "outlook")
          .eq("provider_thread_id", convId)
          .limit(1)
          .maybeSingle();
        if (pm?.email_message_id) {
          const t = await supa
            .from("email_messages")
            .select("thread_id")
            .eq("id", pm.email_message_id)
            .single();
          thread_id = t.data?.thread_id ?? null;
        }
      }
      if (!thread_id) thread_id = crypto.randomUUID();

      const { data: em, error: emErr } = await supa
        .from("email_messages")
        .insert({
          thread_id,
          lead_id: lead.id,
          direction: "in",
          subject: m.subject ?? null,
          body_text: m.bodyPreview ?? null,
          sent_at: m.receivedDateTime ?? new Date().toISOString(),
          is_read: false,
          provider_message_id
        })
        .select("id")
        .single();
      if (emErr) continue;

      await supa.from("provider_messages").insert({
        provider: "outlook",
        provider_message_id,
        provider_thread_id: convId ?? null,
        email_message_id: em.id,
        lead_id: lead.id,
        account_id: acc.id
      });

      inserted++;
    }
  }

  return NextResponse.json({ inserted });
}

