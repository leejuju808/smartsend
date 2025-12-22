// deno.json has "serve" permissions; use service role secret via env
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  const auth = req.headers.get("Authorization") || "";
  const secret = Deno.env.get("CRON_SECRET")!;
  if (auth !== `Bearer ${secret}`) return new Response("unauthorized", { status: 401 });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const { data, error } = await supabase.rpc("schedule_followups_for_all_campaigns", { p_limit: 2000 });
  if (error) return new Response(JSON.stringify({ ok:false, error: error.message }), { status: 500 });

  return new Response(JSON.stringify({ ok:true, queued: data }), { headers: { "content-type":"application/json" }});
});



