import { saveMailbox, getMailbox } from "../_shared/token.ts";

Deno.serve(async (req) => {
  const { mailboxId, historyId } = await req.json();
  const m = await getMailbox(mailboxId);
  await saveMailbox({ id: m.id, gmail_history_id: String(historyId), updated_at: new Date().toISOString() as any });
  return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type":"application/json" }});
});

