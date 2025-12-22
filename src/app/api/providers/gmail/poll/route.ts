import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getGmailClient, refreshTokenIfNeeded } from "@/lib/gmail";

export async function POST() {
  const supa = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: accounts, error } = await supa
    .from("connected_accounts")
    .select("id, email, access_token, refresh_token, token_expiry");
    
  if (error) return new NextResponse(error.message, { status: 500 });

  let inserted = 0;

  for (const acc of accounts ?? []) {
    try {
      // Refresh token if needed
      const accessToken = await refreshTokenIfNeeded(acc, supa);
      
      const gmail = await getGmailClient({
        access_token: accessToken,
        refresh_token: acc.refresh_token,
        token_expiry: acc.token_expiry,
      });

      // Get recent messages not from us (last 24h)
      const list = await gmail.users.messages.list({
        userId: "me",
        q: "newer_than:1d -from:me",
        maxResults: 50,
      });

      for (const m of list.data.messages ?? []) {
        // Skip if we already stored it
        const exists = await supa
          .from("provider_messages")
          .select("id")
          .eq("provider", "gmail")
          .eq("provider_message_id", m.id!)
          .maybeSingle();

        if (exists.data) continue;

        const full = await gmail.users.messages.get({
          userId: "me",
          id: m.id!,
          format: "full",
        });

        const payload = full.data;
        const headers = (payload.payload?.headers ?? []) as Array<{
          name: string;
          value: string;
        }>;

        const subject =
          headers.find((h) => h.name.toLowerCase() === "subject")?.value ?? null;
        const from =
          headers.find((h) => h.name.toLowerCase() === "from")?.value ?? "";
        const date =
          headers.find((h) => h.name.toLowerCase() === "date")?.value ??
          new Date().toISOString();

        // Extract plain text
        function partsToText(part: any): string {
          if (!part) return "";
          if (part.mimeType === "text/plain" && part.body?.data) {
            return Buffer.from(part.body.data, "base64").toString("utf8");
          }
          if (part.parts) {
            return part.parts.map(partsToText).join("\n");
          }
          return "";
        }

        const body_text = partsToText(payload.payload);

        // Resolve lead by email
        const fromEmail = (from.match(/<([^>]+)>/)?.[1] ?? from)
          .trim()
          .toLowerCase();
        
        const { data: lead, error: lErr } = await supa
          .from("leads")
          .select("id")
          .eq("email", fromEmail)
          .maybeSingle();

        if (lErr || !lead) continue;

        // Thread id: map Gmail threadId to internal uuid per lead
        let thread_id: string | null = null;
        const provider_thread_id = payload.threadId ?? null;

        if (provider_thread_id) {
          const { data: pm } = await supa
            .from("provider_messages")
            .select("email_message_id")
            .eq("provider", "gmail")
            .eq("provider_thread_id", provider_thread_id)
            .limit(1)
            .maybeSingle();

          if (pm?.email_message_id) {
            const em = await supa
              .from("email_messages")
              .select("thread_id")
              .eq("id", pm.email_message_id)
              .single();
            thread_id = em.data?.thread_id ?? null;
          }
        }

        if (!thread_id) thread_id = crypto.randomUUID();

        // Insert inbound email
        const { data: em, error: emErr } = await supa
          .from("email_messages")
          .insert({
            thread_id,
            lead_id: lead.id,
            direction: "in",
            subject,
            body_text,
            sent_at: new Date(date).toISOString(),
            is_read: false,
            provider_message_id: m.id!,
          })
          .select("id")
          .single();

        if (emErr) continue;

        await supa.from("provider_messages").insert({
          provider: "gmail",
          provider_message_id: m.id!,
          provider_thread_id: provider_thread_id,
          email_message_id: em.id,
          lead_id: lead.id,
          account_id: acc.id,
        });

        inserted++;
      }
    } catch (e: any) {
      console.error(`Error polling account ${acc.id}:`, e);
      // Continue with next account
    }
  }

  return NextResponse.json({ inserted });
}

