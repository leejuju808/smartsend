import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getGmailClient, buildMime as buildGmailMime, toBase64Url, refreshTokenIfNeeded } from "@/lib/gmail";
import { ensureAccessToken } from "@/lib/outlook";

const BATCH = 20;

export async function POST() {
  const supa = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Pull queued jobs with provider info
  const { data: jobs, error } = await supa
    .from("outbox")
    .select(`
      id, workspace_id, account_id, lead_id, thread_id, to_email, subject, body_text, attempt, max_attempts,
      created_at, status, connected_accounts!inner(provider, email, access_token, refresh_token, token_expiry)
    `)
    .eq("status", "queued")
    .order("created_at", { ascending: true })
    .limit(BATCH);

  if (error) return new NextResponse(error.message, { status: 500 });

  if (!jobs?.length) return NextResponse.json({ processed: 0 });

  let sent = 0;

  for (const j of jobs) {
    const acc = (j as any).connected_accounts as {
      provider: "gmail" | "outlook";
      email: string;
      access_token: string;
      refresh_token: string;
      token_expiry: string | null;
    };

    await supa
      .from("outbox")
      .update({ status: "sending", attempt: j.attempt + 1 })
      .eq("id", j.id);

    try {
      if (acc.provider === "gmail") {
        // Gmail path
        const accessToken = await refreshTokenIfNeeded(
          { access_token: acc.access_token, refresh_token: acc.refresh_token, token_expiry: acc.token_expiry, id: j.account_id },
          supa
        );
        
        const gmail = await getGmailClient({
          access_token: accessToken,
          refresh_token: acc.refresh_token,
          token_expiry: acc.token_expiry,
        });

        const raw = buildGmailMime({
          from: acc.email,
          to: j.to_email,
          subject: j.subject ?? undefined,
          text: j.body_text,
        });

        const encodedRaw = toBase64Url(raw);
        
        // If thread_id exists in email_messages, look it up in provider_messages to get Gmail threadId
        let gmailThreadId: string | undefined = undefined;
        if (j.thread_id) {
          // Get email_message_ids for this thread
          const { data: threadMessages } = await supa
            .from("email_messages")
            .select("id")
            .eq("thread_id", j.thread_id);
          
          if (threadMessages && threadMessages.length > 0) {
            const messageIds = threadMessages.map(m => m.id);
            const { data: pm } = await supa
              .from("provider_messages")
              .select("provider_thread_id")
              .eq("provider", "gmail")
              .in("email_message_id", messageIds)
              .limit(1)
              .maybeSingle();
            
            if (pm?.provider_thread_id) {
              gmailThreadId = pm.provider_thread_id;
            }
          }
        }
        
        const res = await gmail.users.messages.send({
          userId: "me",
          requestBody: { 
            raw: encodedRaw,
            threadId: gmailThreadId
          },
        });

        const provider_message_id = res.data.id!;
        const provider_thread_id = res.data.threadId ?? null;

        // Insert email_messages (outgoing)
        const { data: em, error: emErr } = await supa
          .from("email_messages")
          .insert({
            thread_id: j.thread_id ?? crypto.randomUUID(),
            lead_id: j.lead_id,
            direction: "out",
            subject: j.subject ?? null,
            body_text: j.body_text,
            sent_at: new Date().toISOString(),
            is_read: true,
            provider_message_id: provider_message_id,
          })
          .select("id, thread_id")
          .single();

        if (emErr) throw emErr;

        await supa.from("provider_messages").insert({
          provider: "gmail",
          provider_message_id,
          provider_thread_id,
          email_message_id: em.id,
          lead_id: j.lead_id,
          account_id: j.account_id,
        });

        await supa
          .from("outbox")
          .update({
            status: "sent",
            sent_at: new Date().toISOString(),
          })
          .eq("id", j.id);

        // Backfill thread_id if outbox.thread_id was null
        if (!j.thread_id && em.thread_id) {
          await supa.from("outbox").update({ thread_id: em.thread_id }).eq("id", j.id);
        }

      } else if (acc.provider === "outlook") {
        // Outlook path
        const accessToken = await ensureAccessToken(acc, async (t) => {
          await supa.from("connected_accounts").update({
            access_token: t.access_token,
            refresh_token: t.refresh_token ?? acc.refresh_token,
            token_expiry: t.token_expiry
          }).eq("id", j.account_id);
        });

        // Outlook send via Graph
        const res = await fetch("https://graph.microsoft.com/v1.0/me/sendMail", {
          method: "POST",
          headers: { 
            Authorization: `Bearer ${accessToken}`, 
            "Content-Type": "application/json" 
          },
          body: JSON.stringify({
            message: {
              subject: j.subject ?? "",
              body: { contentType: "Text", content: j.body_text },
              toRecipients: [{ emailAddress: { address: j.to_email } }],
            },
            saveToSentItems: true
          }),
        });

        if (!res.ok) throw new Error(await res.text());

        // Insert email_messages (outgoing)
        const { data: em, error: emErr } = await supa
          .from("email_messages")
          .insert({
            thread_id: j.thread_id ?? crypto.randomUUID(),
            lead_id: j.lead_id,
            direction: "out",
            subject: j.subject ?? null,
            body_text: j.body_text,
            sent_at: new Date().toISOString(),
            is_read: true
          })
          .select("id, thread_id")
          .single();

        if (emErr) throw emErr;

        await supa.from("provider_messages").insert({
          provider: "outlook",
          provider_message_id: `sent:${em.id}`, // Graph doesn't return message id here; you can fetch SentItems if you need the real id
          provider_thread_id: null,
          email_message_id: em.id,
          lead_id: j.lead_id,
          account_id: j.account_id
        });

        await supa
          .from("outbox")
          .update({
            status: "sent",
            sent_at: new Date().toISOString(),
          })
          .eq("id", j.id);

        // Backfill thread_id if outbox.thread_id was null
        if (!j.thread_id && em.thread_id) {
          await supa.from("outbox").update({ thread_id: em.thread_id }).eq("id", j.id);
        }
      }

      sent++;
    } catch (e: any) {
      const fail = j.attempt + 1 >= j.max_attempts ? "failed" : "queued";
      await supa
        .from("outbox")
        .update({
          status: fail,
          last_error: String(e?.message ?? e),
        })
        .eq("id", j.id);
    }
  }

  return NextResponse.json({ processed: jobs.length, sent });
}

