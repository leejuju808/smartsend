// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("NEXT_PUBLIC_SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CRON_SECRET = Deno.env.get("CRON_SECRET")!;

Deno.serve(async (req) => {
  const sb = createClient(SUPABASE_URL, SERVICE_KEY);
  const url = new URL(req.url);

  const validationToken = url.searchParams.get("validationToken");
  if (validationToken) {
    return new Response(validationToken, {
      status: 200,
      headers: { "content-type": "text/plain" },
    });
  }

  const body = await req.json().catch(() => ({} as any));
  const notif = (body?.value ?? []) as Array<any>;
  if (!notif.length) return new Response("OK");

  for (const n of notif) {
    const subscriptionId = n.subscriptionId as string;
    const clientState = n.clientState as string;

    const { data: cur } = await sb
      .from("outlook_delta_cursors")
      .select("account_id, client_state")
      .eq("subscription_id", subscriptionId)
      .maybeSingle();
    if (!cur?.account_id || cur.client_state !== clientState) continue;

    await fetch(`${SUPABASE_URL}/functions/v1/outlook-sync?account_id=${cur.account_id}`, {
      method: "POST",
      headers: { "x-cron-secret": CRON_SECRET },
    });
  }

  return new Response(JSON.stringify({ ok: true }));
});




