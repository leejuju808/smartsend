// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { graphFetch } from "../_shared/graph_client.ts";

const SUPABASE_URL = Deno.env.get("NEXT_PUBLIC_SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CRON_SECRET = Deno.env.get("CRON_SECRET")!;
const WEBHOOK_URL = Deno.env.get("OUTLOOK_WEBHOOK_URL")!;

Deno.serve(async (req) => {
  if (CRON_SECRET && req.headers.get("x-cron-secret") !== CRON_SECRET) {
    return new Response("Unauthorized", { status: 401 });
  }

  const sb = createClient(SUPABASE_URL, SERVICE_KEY);
  const url = new URL(req.url);
  const accountId = url.searchParams.get("account_id");
  if (!accountId) return new Response("Missing account_id", { status: 400 });

  const clientState = crypto.randomUUID().replace(/-/g, "");
  const expirationDateTime = new Date(
    Date.now() + 60 * 60 * 1000 * 20
  ).toISOString();

  const body = {
    changeType: "created",
    notificationUrl: WEBHOOK_URL,
    resource: "/me/mailFolders('Inbox')/messages",
    clientState,
    expirationDateTime,
  };

  const sub = await graphFetch<any>(sb, accountId, `/subscriptions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

  await sb.from("outlook_delta_cursors").upsert({
    account_id: accountId,
    subscription_id: sub.id,
    client_state: clientState,
    updated_at: new Date().toISOString(),
  });

  return new Response(
    JSON.stringify({ ok: true, subscriptionId: sub.id }),
    { headers: { "content-type": "application/json" } }
  );
});




