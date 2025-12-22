import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth:{persistSession:false} });

Deno.serve(async () => {
  const { data: msgs } = await sb.from("inbox_messages")
    .select("id")
    .eq("direction","inbound")
    .is("classified_at", null)
    .order("created_at", { ascending:false })
    .limit(100);

  for (const m of (msgs ?? [])) {
    await sb.from("jobs").insert({ type:"ai_classify_inbound", payload: { message_id: m.id } });
  }

  return new Response(JSON.stringify({ ok:true, enqueued: msgs?.length ?? 0 }), { headers:{ "content-type":"application/json" } });
});














