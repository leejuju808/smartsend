import "jsr:@supabase/functions@1.4.0/types";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const validationToken = url.searchParams.get("validationToken");
  if (validationToken) {
    return new Response(validationToken, {
      status: 200,
      headers: { "content-type": "text/plain" },
    });
  }

  if (req.method !== "POST") {
    return new Response("method not allowed", { status: 405 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch (_err) {
    return new Response("invalid json", { status: 400 });
  }

  const sb = createClient(SB_URL, SB_KEY, { auth: { persistSession: false } });

  await sb.from("push_events").insert({ provider: "outlook", payload: body }).catch(() => undefined);

  const notifications: any[] = Array.isArray(body?.value) ? body.value : [];
  const seenAccounts = new Set<string>();

  for (const notification of notifications) {
    const subscriptionId = notification?.subscriptionId;
    if (!subscriptionId) continue;

    const { data: state } = await sb
      .from("account_sync_state")
      .select("account_id")
      .eq("outlook_subscription_id", subscriptionId)
      .maybeSingle();

    const accountId = state?.account_id;
    if (!accountId || seenAccounts.has(accountId)) continue;

    if (notification?.subscriptionExpirationDateTime) {
      await sb
        .from("account_sync_state")
        .update({ outlook_subscription_expiry: notification.subscriptionExpirationDateTime })
        .eq("account_id", accountId)
        .eq("provider", "outlook")
        .catch(() => undefined);
    }

    seenAccounts.add(accountId);

    await fetch(`${SB_URL}/functions/v1/sync-outlook`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Authorization: `Bearer ${SB_KEY}`,
      },
      body: JSON.stringify({ account_id: accountId, source: "outlook-push" }),
    }).catch(() => undefined);
  }

  return new Response("ok", { status: 200 });
});











