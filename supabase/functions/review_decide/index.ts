import { serve } from "https://deno.land/std@0.181.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const { review_id, decided_label, user_id } = await req.json();
  const { error } = await supabase.rpc("apply_reply_review_decision", {
    p_review_id: review_id,
    p_decided_label: decided_label,
    p_user_id: user_id,
  });

  if (error) {
    return new Response(JSON.stringify({ ok: false, error: error.message }), {
      headers: { "Content-Type": "application/json" },
      status: 400,
    });
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: { "Content-Type": "application/json" },
  });
});

