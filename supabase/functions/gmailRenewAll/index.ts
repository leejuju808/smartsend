import { sbAdmin } from "../_shared/token.ts";

Deno.serve(async () => {
  const sb = sbAdmin();
  const soon = new Date(Date.now() + 24*3600*1000);
  const { data: boxes } = await sb
    .from("mailboxes")
    .select("id, gmail_watch_expire_at")
    .eq("provider","gmail");
  for (const b of boxes || []) {
    const exp = b.gmail_watch_expire_at ? new Date(b.gmail_watch_expire_at) : null;
    if (!exp || exp < soon) {
      await fetch(`${Deno.env.get("SUPABASE_URL")!}/functions/v1/gmailStartWatch`, {
        method: "POST",
        headers: { "Content-Type":"application/json" },
        body: JSON.stringify({ mailboxId: b.id })
      });
    }
  }
  return new Response("OK");
});

