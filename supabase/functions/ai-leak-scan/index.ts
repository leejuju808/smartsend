import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async () => {
  const s = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data, error } = await s.from('v_ai_leak_candidates').select('*').limit(5000);
  if (error) return json({ ok: false, error: error.message }, 500);
  return json({ ok: true, count: data?.length ?? 0, samples: (data || []).slice(0, 50) });
});

function json(b: any, st = 200) {
  return new Response(JSON.stringify(b), {
    status: st,
    headers: { 'Content-Type': 'application/json' }
  });
}
