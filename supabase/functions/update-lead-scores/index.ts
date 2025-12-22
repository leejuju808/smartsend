import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async () => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } }
  );

  const { error } = await supabase.rpc("update_lead_scores");

  if (error) {
    console.error("update_lead_scores RPC error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      {
        status: 500,
        headers: { "content-type": "application/json" }
      }
    );
  }

  return new Response(
    JSON.stringify({ success: true }),
    {
      status: 200,
      headers: { "content-type": "application/json" }
    }
  );
});


