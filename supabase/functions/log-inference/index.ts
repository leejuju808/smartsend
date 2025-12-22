import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const payload = await req.json();
  const { error } = await supabase.from("ai_live_inferences").insert(payload);

  if (error) {
    return new Response(JSON.stringify({ error }), { status: 400 });
  }

  return new Response(JSON.stringify({ ok: true }), { status: 200 });
});
















