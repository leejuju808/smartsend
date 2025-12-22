import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const sb = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } }
);

Deno.serve(async (req) => {
  const { limit = 10 } = await req.json().catch(() => ({}));

  const { data: rows, error } = await sb.rpc("list_due_campaigns", { p_limit: limit });
  if (error) {
    return new Response(error.message, { status: 500 });
  }

  let total = 0;
  for (const row of rows ?? []) {
    const { data, error: planErr } = await sb.rpc("plan_and_enqueue_drip", {
      p_campaign_id: row.id,
    });

    if (!planErr) {
      total += data ?? 0;
    }
  }

  return new Response(
    JSON.stringify({
      planned: total,
      campaigns: rows?.length ?? 0,
    }),
    { headers: { "content-type": "application/json" } }
  );
});


