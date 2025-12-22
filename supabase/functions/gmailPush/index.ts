import { sbAdmin, getMailbox, ensureGmailAccess } from "../_shared/token.ts";

// Pub/Sub pushes { message: { data: base64(json) } }
type PushMsg = { emailAddress: string; historyId: string };

Deno.serve(async (req) => {
  try {
    const body = await req.json();
    const b64 = body?.message?.data;
    if (!b64) return new Response("no message", { status: 400 });

    const decoded = JSON.parse(atob(b64)) as PushMsg;
    const email = decoded.emailAddress;
    const historyId = decoded.historyId;

    // find mailbox by email (we enforce unique(provider,email))
    const sb = sbAdmin();
    const { data: m } = await sb.from("mailboxes").select("*").eq("provider","gmail").eq("email", email).single();

    if (!m) return new Response("mailbox not found", { status: 200 }); // ack anyway

    // store latest history id (for safety), then trigger sync
    await sb.from("mailboxes").update({ gmail_history_id: historyId, updated_at: new Date().toISOString() }).eq("id", m.id);

    // fire & forget sync
    await fetch(`${Deno.env.get("SUPABASE_URL")!}/functions/v1/gmailSync`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!}`, "Content-Type":"application/json" },
      body: JSON.stringify({ mailboxId: m.id })
    });

    return new Response("OK");
  } catch (e) {
    return new Response("OK"); // Always ack to avoid retries; log if you have logging
  }
});

