// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("NEXT_PUBLIC_SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CRON_SECRET = Deno.env.get("CRON_SECRET")!;
const BATCH = 75;

function sb() {
  return createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
}

Deno.serve(async (req) => {
  if (CRON_SECRET && req.headers.get("x-cron-secret") !== CRON_SECRET) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const client = sb();
    const { data: nms, error } = await client
      .from("normalized_messages")
      .select("id")
      .eq("link_status", "unlinked")
      .order("sent_at", { ascending: true })
      .limit(BATCH);

    if (error) throw new Error(error.message);

    let linked = 0;
    for (const row of nms ?? []) {
      const { data, error: rerr } = await client.rpc("resolve_normalized_message", { p_nm: row.id });
      if (rerr) continue;
      const ok = Array.isArray(data) ? data[0]?.ok : (data as any)?.ok;
      if (ok) linked++;
    }

    return new Response(
      JSON.stringify({ ok: true, scanned: nms?.length ?? 0, linked }),
      { headers: { "content-type": "application/json" } }
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, error: String(e) }),
      { status: 500, headers: { "content-type": "application/json" } }
    );
  }
});


