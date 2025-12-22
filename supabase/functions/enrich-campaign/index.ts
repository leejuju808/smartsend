import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error("Missing Supabase env vars");
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const auth = req.headers.get("Authorization");
  if (!auth) {
    return new Response("Unauthorized", { status: 401 });
  }

  let body: { campaign_id?: string; force?: boolean; limit?: number };
  try {
    body = await req.json();
  } catch (err) {
    console.error("Invalid JSON", err);
    return new Response("Invalid JSON body", { status: 400 });
  }

  const { campaign_id, force = false, limit = 1000 } = body ?? {};

  if (!campaign_id) {
    return new Response("Missing campaign_id", { status: 400 });
  }

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return new Response("Server misconfigured", { status: 500 });
  }

  const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: auth } },
  });

  const { data, error } = await sb.rpc("enrich_missing_for_campaign", {
    p_campaign: campaign_id,
    p_force: !!force,
    p_limit: limit,
  });

  if (error) {
    console.error("enrich_missing_for_campaign error", error);
    const message = error.message || "Enrichment failed";
    return new Response(message, { status: 400 });
  }

  return new Response(JSON.stringify(data), {
    headers: { "content-type": "application/json" },
  });
});





