// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("NEXT_PUBLIC_SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SECRET = Deno.env.get("CRON_SECRET")!;

Deno.serve(async (req) => {
  if (SECRET && req.headers.get("x-cron-secret") !== SECRET) {
    return new Response("Unauthorized", { status: 401 });
  }
  const sb = createClient(SUPABASE_URL, SERVICE_KEY);
  const url = new URL(req.url);
  const campaign = url.searchParams.get("campaign_id");
  const limit = Number(url.searchParams.get("limit") ?? 50);

  try {
    const { data, error } = await sb.rpc("fu_process", {
      p_campaign: campaign,
      p_limit: limit,
    });
    if (error) throw error;
    return new Response(
      JSON.stringify({ ok: true, processed: data ?? 0 }),
      { headers: { "content-type": "application/json" } },
    );
  } catch (e: any) {
    return new Response(
      JSON.stringify({ ok: false, error: String(e?.message ?? e) }),
      {
        status: 500,
        headers: { "content-type": "application/json" },
      },
    );
  }
});



