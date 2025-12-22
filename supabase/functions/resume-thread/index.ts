import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth:{persistSession:false} });

Deno.serve(async (req) => {
  try {
    const { thread_id, enqueue_next = false } = await req.json();
    if (!thread_id) return new Response("thread_id required", { status: 400 });
    const { data, error } = await sb.rpc("resume_campaign_for_thread", { p_thread: thread_id, p_enqueue_next: !!enqueue_next });
    if (error) throw error;
    return new Response(JSON.stringify({ ok:true, enqueued: data ?? 0 }), { headers:{ "content-type":"application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ ok:false, error:String(e) }), { status: 500, headers:{ "content-type":"application/json" } });
  }
});








