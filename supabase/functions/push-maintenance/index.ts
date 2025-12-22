import "jsr:@supabase/functions@1.4.0/types";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const DAY_MS = 24 * 60 * 60 * 1000;

function isExpiringSoon(value: string | null | undefined, bufferMs = DAY_MS) {
  if (!value) return true;
  const ts = Date.parse(value);
  if (Number.isNaN(ts)) return true;
  return ts <= Date.now() + bufferMs;
}

Deno.serve(async () => {
  const sb = createClient(SB_URL, SB_KEY, { auth: { persistSession: false } });

  const { data: accounts, error } = await sb
    .from("connected_accounts")
    .select("id, provider")
    .in("provider", ["gmail", "outlook"]);
  if (error) {
    return new Response(JSON.stringify({ ok: false, error: error.message }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }

  const accountIds = (accounts ?? []).map((a) => a.id);
  const statesMap = new Map<string, any>();
  if (accountIds.length) {
    const { data: states } = await sb
      .from("account_sync_state")
      .select("account_id, provider, gmail_watch_expiry, outlook_subscription_expiry")
      .in("account_id", accountIds);
    for (const st of states ?? []) {
      statesMap.set(st.account_id, st);
    }
  }

  const summary = { gmailRenewed: 0, outlookRenewed: 0, checked: accounts?.length ?? 0 };

  for (const account of accounts ?? []) {
    const state = statesMap.get(account.id);
    if (account.provider === "gmail") {
      if (isExpiringSoon(state?.gmail_watch_expiry)) {
        const res = await fetch(`${SB_URL}/functions/v1/gmail-watch-setup`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            Authorization: `Bearer ${SB_KEY}`,
          },
          body: JSON.stringify({ account_id: account.id, source: "renewal" }),
        }).catch(() => null);
        if (res?.ok) summary.gmailRenewed++;
      }
    } else if (account.provider === "outlook") {
      if (isExpiringSoon(state?.outlook_subscription_expiry, 2 * DAY_MS)) {
        const res = await fetch(`${SB_URL}/functions/v1/outlook-subscription-setup`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            Authorization: `Bearer ${SB_KEY}`,
          },
          body: JSON.stringify({ account_id: account.id, source: "renewal" }),
        }).catch(() => null);
        if (res?.ok) summary.outlookRenewed++;
      }
    }
  }

  return new Response(JSON.stringify({ ok: true, summary }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
});











