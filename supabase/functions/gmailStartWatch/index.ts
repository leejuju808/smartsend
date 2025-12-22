import { getMailbox, ensureGmailAccess, saveMailbox } from "../_shared/token.ts";

// Body: { mailboxId: string }
Deno.serve(async (req) => {
  try {
    const { mailboxId } = await req.json();
    const m = await getMailbox(mailboxId);
    const access = await ensureGmailAccess(m);

    // Start watch on INBOX label
    const topicName = Deno.env.get("GCP_PUBSUB_TOPIC")!; // e.g., projects/your-gcp-project/topics/gmail-push
    const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/watch", {
      method: "POST",
      headers: { "Authorization": `Bearer ${access}`, "Content-Type": "application/json" },
      body: JSON.stringify({ topicName, labelIds: ["INBOX"] })
    });
    const j = await res.json();
    if (!res.ok) throw new Error(JSON.stringify(j));

    // j: { historyId, expiration }
    await saveMailbox({
      id: m.id,
      gmail_history_id: String(j.historyId || m.gmail_history_id || ""),
      gmail_watch_expire_at: j.expiration ? new Date(Number(j.expiration)).toISOString() : null
    });

    return new Response(JSON.stringify({ ok: true, watch: j }), { headers: { "Content-Type":"application/json" }});
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
  }
});

