import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const sb = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

export async function handler() {
  try {
    const { error } = await sb.rpc("recalc_all_warmups");
    
    if (error) {
      console.error("Error recalculating warmups:", error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { "content-type": "application/json" }
      });
    }
    
    console.log("✅ warmup recalculated for all accounts");
    return new Response(JSON.stringify({ ok: true }), {
      headers: { "content-type": "application/json" }
    });
  } catch (err) {
    console.error("Unexpected error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { "content-type": "application/json" }
    });
  }
}

Deno.serve(handler);
