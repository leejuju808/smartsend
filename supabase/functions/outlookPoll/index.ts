import { sbAdmin, ensureGraphAccess } from "../_shared/token.ts";

async function upsertFromGraph(m: any, teamId: string, email: string, access: string) {
  // minimal projection
  const subject = m.subject ?? "";
  const fromEmail = m.from?.emailAddress?.address ?? "";
  const toList = (m.toRecipients ?? []).map((r: any) => r.emailAddress?.address).filter(Boolean);
  const bodyPreview = m.bodyPreview ?? "";
  const threadId = m.conversationId ?? "";
  const messageId = m.id;

  await fetch(`${Deno.env.get("SUPABASE_URL")!}/functions/v1/classifyEmail`, {
    method:"POST", headers: { "Content-Type":"application/json" },
    body: JSON.stringify({
      teamId,
      campaignId: null,
      leadId: null,
      provider: "outlook",
      threadId,
      messageId,
      fromEmail,
      toEmail: toList,
      subject,
      bodyText: bodyPreview
    })
  });
}

Deno.serve(async () => {
  const sb = sbAdmin();
  // Get all Outlook mailboxes
  const { data: boxes } = await sb.from("mailboxes").select("*").eq("provider","outlook");
  if (!boxes?.length) return new Response(JSON.stringify({ ok: true, processed: 0 }), { headers: { "Content-Type":"application/json" } });

  let processed = 0;
  for (const mb of boxes) {
    try {
      const access = await ensureGraphAccess(mb);
      let url = mb.outlook_delta_link || "https://graph.microsoft.com/v1.0/me/mailFolders/Inbox/messages/delta?$select=id,subject,from,toRecipients,bodyPreview,conversationId,receivedDateTime";

      // page through delta
      while (url) {
        const r = await fetch(url, { headers: { "Authorization": `Bearer ${access}` }});
        const j = await r.json();
        if (!r.ok) throw new Error(JSON.stringify(j));

        const values = j.value || [];
        for (const msg of values) {
          // Only process newly received items (you may filter by isRead etc.)
          await upsertFromGraph(msg, mb.team_id, mb.email, access);
          processed++;
        }

        // nextLink for paging, deltaLink for checkpoint
        const next = j["@odata.nextLink"];
        const delta = j["@odata.deltaLink"];
        if (next) {
          url = next;
        } else if (delta) {
          url = "";
          await sb.from("mailboxes").update({ outlook_delta_link: delta, updated_at: new Date().toISOString() }).eq("id", mb.id);
        } else {
          url = "";
        }
      }
    } catch (_e) {
      // swallow individual mailbox errors; continue
      continue;
    }
  }

  return new Response(JSON.stringify({ ok: true, processed }), { headers: { "Content-Type":"application/json" } });
});

