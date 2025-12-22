import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

Deno.serve(async () => {
  try {
    const today = new Date().toISOString().slice(0,10);
    const r1 = await sb.rpc("rollup_domain_health", { p_day: today });
    const r2 = await sb.rpc("auto_throttle_mailboxes");
    return new Response(JSON.stringify({ ok: true, rolled_up: r1.data ?? 0, throttled: r2.data ?? 0 }), { headers: { "content-type":"application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ ok:false, error: String(e) }), { status: 500 });
  }
});

