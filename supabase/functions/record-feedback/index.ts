import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { message_id, label, confidence, notes } = await req.json();

  const { error } = await supabase.from("ai_feedback").insert({
    message_id,
    label,
    confidence,
    notes,
    source: "user",
  });

  return new Response(
    JSON.stringify({ ok: !error, error }),
    { headers: { "Content-Type": "application/json" } },
  );
});



















