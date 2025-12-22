import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async () => {
  const supa = createClient(supabaseUrl, supabaseKey);

  const { data, error } = await supa.rpc("rpc_domain_roll_source");
  if (error) {
    console.error("rpc_domain_roll_source failed", error);
    return json({ ok: false, error: error.message }, 500);
  }

  if (!data?.length) return json({ ok: true, msg: "no-sends" });

  for (const row of data as any[]) {
    const domain = row.domain?.toLowerCase();
    if (!domain) continue;

    for (const window of ["1d", "7d", "30d"] as const) {
      const payload = {
        account_id: row.account_id,
        domain,
        window,
        sends: row[`${window}_sends`] ?? 0,
        opens: row[`${window}_opens`] ?? 0,
        clicks: row[`${window}_clicks`] ?? 0,
        replies: row[`${window}_replies`] ?? 0,
        bounces: row[`${window}_bounces`] ?? 0,
        complaints: row[`${window}_complaints`] ?? 0,
      };

      const { error: upErr } = await supa
        .from("domain_metrics")
        .upsert(payload, { onConflict: "account_id,domain,window" });

      if (upErr) {
        console.error("domain_metrics upsert failed", upErr, payload);
        return json({ ok: false, error: upErr.message }, 500);
      }
    }
  }

  return json({ ok: true, updated: data.length });
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

