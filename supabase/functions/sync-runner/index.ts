import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth:{persistSession:false} });

Deno.serve(async () => {
  const { data: accs } = await sb.from("connected_accounts")
    .select("id,provider,from_email")
    .in("provider", ["gmail", "outlook"]);

  let summary:any[] = [];
  for (const a of (accs ?? [])) {
    try {
      const endpoint = a.provider === "gmail" ? "sync-gmail" : "sync-outlook";
      const r = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/${endpoint}`, {
        method:"POST",
        headers:{ "content-type":"application/json" },
        body: JSON.stringify({ account_id: a.id })
      }).then(r=>r.json());
      summary.push({ account: a.id, provider: a.provider, fetched: r.fetched ?? 0 });
    } catch (e) {
      summary.push({ account: a.id, provider: a.provider, error: String(e) });
    }
  }
  return new Response(JSON.stringify({ ok:true, summary }), { headers:{ "content-type":"application/json" } });
});

