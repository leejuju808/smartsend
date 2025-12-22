import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SRK = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  try {
    const { campaign_id, lead_id, n = 5, base_iso } = await req.json();

    if (!campaign_id || !lead_id) {
      return new Response("Missing params", { status: 400 });
    }

    const sb = createClient(SB_URL, SRK);

    const base = base_iso ? new Date(base_iso).toISOString() : undefined;

    const { data, error } = await sb.rpc("preview_next_windows", {
      p_campaign: campaign_id,
      p_lead: lead_id,
      p_n: n,
      p_base: base,
    });

    if (error) {
      throw new Error(error.message);
    }

    return new Response(JSON.stringify({ windows: data }), {
      headers: { "content-type": "application/json" },
    });
  } catch (error) {
    return new Response((error as Error).message, { status: 500 });
  }
});






