// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("NEXT_PUBLIC_SUPABASE_URL");
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const CRON_SECRET = Deno.env.get("CRON_SECRET");

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing Supabase environment configuration for rewrite metrics cron.");
}

Deno.serve(async (req) => {
  if (CRON_SECRET && req.headers.get("x-cron-secret") !== CRON_SECRET) {
    return new Response("Unauthorized", { status: 401 });
  }

  if (!SUPABASE_URL || !SERVICE_KEY) {
    return new Response(JSON.stringify({ ok: false, error: "Supabase config missing" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }

  const sb = createClient(SUPABASE_URL, SERVICE_KEY);

  const sql = `
    select public.rewrite_variant_stats_recompute('7d');
    select public.rewrite_variant_stats_recompute('30d');
  `;

  const { error } = await sb.rpc("exec_sql", { sql });

  if (error) {
    const missingExecSql = error.message?.toLowerCase().includes("exec_sql");

    if (missingExecSql) {
      const sevenDay = await sb.rpc("rewrite_variant_stats_recompute", { p_window: "7d" });
      if (sevenDay.error) {
        return new Response(JSON.stringify({ ok: false, error: sevenDay.error.message }), {
          status: 500,
          headers: { "content-type": "application/json" },
        });
      }

      const thirtyDay = await sb.rpc("rewrite_variant_stats_recompute", { p_window: "30d" });
      if (thirtyDay.error) {
        return new Response(JSON.stringify({ ok: false, error: thirtyDay.error.message }), {
          status: 500,
          headers: { "content-type": "application/json" },
        });
      }
    } else {
      return new Response(JSON.stringify({ ok: false, error: error.message }), {
        status: 500,
        headers: { "content-type": "application/json" },
      });
    }
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: { "content-type": "application/json" },
  });
});

