import { serve } from "https://deno.land/std@0.216.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  const { campaign_id, org_id, message_id, event_type, meta } = await req.json();
  if (!campaign_id || !org_id || !event_type) return new Response("Bad Request", { status: 400 });

  const supa = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { error } = await supa.from("email_events").insert([{ org_id, campaign_id, message_id, event_type, meta }]);
  if (error) return new Response(error.message, { status: 500 });
  return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
});

