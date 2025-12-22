import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const url = Deno.env.get("SUPABASE_URL")!;
const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  const supa = createClient(url, key);
  try {
    const { account_id, survivor_lead_id, mergee_lead_id, overrides } = await req.json();
    const { data, error } = await supa.rpc("rpc_merge_leads", {
      p_account_id: account_id,
      p_survivor: survivor_lead_id,
      p_mergee: mergee_lead_id,
      p_overrides: overrides || {},
    });
    if (error) return json({ ok: false, error: error.message }, 500);
    return json({ ok: true, job_id: data });
  } catch (e) {
    return json({ ok: false, error: String(e) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

