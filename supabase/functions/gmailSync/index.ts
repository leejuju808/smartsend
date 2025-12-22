import { getMailbox, ensureGmailAccess } from "../_shared/token.ts";

Deno.serve(async (req) => {
  try {
    const { mailboxId } = await req.json();
    const m = await getMailbox(mailboxId);
    const access = await ensureGmailAccess(m);

    // 1) Fetch history changes since last history id
    const histUrl = new URL("https://gmail.googleapis.com/gmail/v1/users/me/history");
    histUrl.searchParams.set("startHistoryId", m.gmail_history_id || "1");
    histUrl.searchParams.set("labelId", "INBOX");
    histUrl.searchParams.set("historyTypes", "messageAdded");
    let added: string[] = [];
    let nextPage: string|undefined;

    do {
      if (nextPage) histUrl.searchParams.set("pageToken", nextPage);
      const r = await fetch(histUrl, { headers: { "Authorization": `Bearer ${access}` }});
      const j = await r.json();
      if (!r.ok) throw new Error(JSON.stringify(j));
      (j.history || []).forEach((h: any) => {
        (h.messagesAdded || []).forEach((ma: any) => {
          const id = ma.message.id as string;
          added.push(id);
        });
      });
      nextPage = j.nextPageToken;
      if (j.historyId) {
        // store highest known history id back on mailbox
        await fetch(`${Deno.env.get("SUPABASE_URL")!}/functions/v1/mailboxUpdateHistory`, {
          method: "POST",
          headers: { "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!}`, "Content-Type":"application/json" },
          body: JSON.stringify({ mailboxId: m.id, historyId: String(j.historyId) })
        });
      }
    } while (nextPage);

    // 2) For each message id, fetch payload + insert via classifyEmail
    for (const msgId of Array.from(new Set(added))) {
      const mr = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${msgId}?format=metadata`, {
        headers: { "Authorization": `Bearer ${access}` }
      });
      const meta = await mr.json();
      if (!mr.ok) continue;

      // fetch body as needed
      const fr = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${msgId}?format=full`, {
        headers: { "Authorization": `Bearer ${access}` }
      });
      const full = await fr.json();
      if (!fr.ok) continue;

      const headers: Record<string,string> = {};
      for (const h of full.payload?.headers || []) headers[h.name.toLowerCase()] = h.value;

      const from = headers["from"] || "";
      const toHdr = headers["to"] || "";
      const subject = headers["subject"] || "";
      const toList = toHdr.split(",").map(s => s.trim());

      // get decoded plain text body
      let bodyText = "";
      function walk(part: any) {
        if (!part) return;
        if (part.mimeType === "text/plain" && part.body?.data) {
          bodyText += atob(part.body.data.replace(/-/g, "+").replace(/_/g, "/"));
        }
        (part.parts || []).forEach(walk);
      }
      walk(full.payload);

      // Try map to lead/campaign (you can improve this later using thread mapping)
      const threadId = full.threadId;
      // Call classifier (Block 25)
      await fetch(`${Deno.env.get("SUPABASE_URL")!}/functions/v1/classifyEmail`, {
        method:"POST",
        headers: { "Content-Type":"application/json" },
        body: JSON.stringify({
          teamId: m.team_id,
          campaignId: null,
          leadId: null,
          provider: "gmail",
          threadId,
          messageId: msgId,
          fromEmail: from,
          toEmail: toList,
          subject,
          bodyText
        })
      });
    }

    return new Response(JSON.stringify({ ok: true, processed: added.length }), { headers: { "Content-Type":"application/json" }});
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
  }
});

