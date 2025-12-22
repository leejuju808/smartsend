import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  
  // Auto-resume: only if pause_reason='ooo' and pause_until is set and today >= pause_until
  const { data: resumed, error } = await sb
    .from("campaign_contacts")
    .update({ 
      is_paused: false, 
      pause_reason: null, 
      pause_until: null,
      ooo_return_date: null // clear return date on resume
    })
    .eq("pause_reason", "ooo")
    .not("pause_until", "is", null)
    .lte("pause_until", today)
    .select("id, campaign_id, contact_id");
  
  if (error) {
    return new Response(JSON.stringify({ ok: false, error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
  
  return new Response(JSON.stringify({ 
    ok: true, 
    resumed_count: resumed?.length || 0,
    resumed_contacts: resumed || []
  }), {
    headers: { "Content-Type": "application/json" }
  });
});
