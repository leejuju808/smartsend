// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL =
  Deno.env.get("SUPABASE_URL") ?? Deno.env.get("NEXT_PUBLIC_SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

function shouldRefresh(expiresAt: string | null | undefined, bufferMs = 5 * 60_000) {
  if (!expiresAt) return true;
  const expiry = new Date(expiresAt).getTime();
  if (Number.isNaN(expiry)) return true;
  return expiry - Date.now() <= bufferMs;
}

async function refreshGmail(account: any) {
  if (!account.refresh_token) return null;

  const clientId =
    Deno.env.get("GOOGLE_CLIENT_ID") ?? Deno.env.get("GOOGLE_OAUTH_CLIENT_ID");
  const clientSecret =
    Deno.env.get("GOOGLE_CLIENT_SECRET") ??
    Deno.env.get("GOOGLE_OAUTH_CLIENT_SECRET");

  if (!clientId || !clientSecret) return null;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
      refresh_token: account.refresh_token,
    }),
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.access_token) {
    console.error("gmail refresh failed", account.email, json);
    return null;
  }

  const expiresAt =
    typeof json.expires_in === "number"
      ? new Date(Date.now() + (json.expires_in - 60) * 1000).toISOString()
      : null;

  await supabase
    .from("mail_accounts")
    .update({
      access_token: json.access_token,
      expires_at: expiresAt,
      scope: json.scope ?? account.scope,
    })
    .eq("id", account.id);

  return { provider: "gmail", email: account.email };
}

async function refreshOutlook(account: any) {
  if (!account.refresh_token) return null;

  const clientId = Deno.env.get("MICROSOFT_CLIENT_ID") ?? Deno.env.get("MS_CLIENT_ID");
  const clientSecret =
    Deno.env.get("MICROSOFT_CLIENT_SECRET") ?? Deno.env.get("MS_CLIENT_SECRET");

  if (!clientId || !clientSecret) return null;

  const res = await fetch(
    "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "refresh_token",
        refresh_token: account.refresh_token,
        scope: "offline_access Mail.Read User.Read",
      }),
    }
  );

  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.access_token) {
    console.error("outlook refresh failed", account.email, json);
    return null;
  }

  const expiresAt =
    typeof json.expires_in === "number"
      ? new Date(Date.now() + (json.expires_in - 60) * 1000).toISOString()
      : null;

  const providerMeta = account.provider_meta ?? {};

  let renewedSubscription = false;
  if (providerMeta.subscriptionId) {
    const expiration = providerMeta.expirationDateTime
      ? new Date(providerMeta.expirationDateTime).getTime()
      : 0;
    if (
      !expiration ||
      expiration - Date.now() <= 10 * 60_000
    ) {
      const newExpiration = new Date(Date.now() + 55 * 60_000).toISOString();
      const renewRes = await fetch(
        `https://graph.microsoft.com/v1.0/subscriptions/${providerMeta.subscriptionId}`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${json.access_token}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            expirationDateTime: newExpiration,
          }),
        }
      );

      if (renewRes.ok) {
        providerMeta.expirationDateTime = newExpiration;
        renewedSubscription = true;
      } else {
        console.error("outlook subscription renew failed", account.email, await renewRes.text());
      }
    }
  }

  await supabase
    .from("mail_accounts")
    .update({
      access_token: json.access_token,
      expires_at: expiresAt,
      scope: json.scope ?? account.scope,
      provider_meta: providerMeta,
    })
    .eq("id", account.id);

  return {
    provider: "outlook",
    email: account.email,
    renewedSubscription,
  };
}

Deno.serve(async () => {
  try {
    const { data: accounts } = await supabase
      .from("mail_accounts")
      .select("id, provider, email, refresh_token, access_token, expires_at, scope, provider_meta");

    const refreshed: any[] = [];

    for (const account of accounts ?? []) {
      if (!shouldRefresh(account.expires_at)) continue;

      if (account.provider === "gmail") {
        const res = await refreshGmail(account);
        if (res) refreshed.push(res);
      } else if (account.provider === "outlook") {
        const res = await refreshOutlook(account);
        if (res) refreshed.push(res);
      }
    }

    return new Response(
      JSON.stringify({ ok: true, refreshed }),
      { headers: { "content-type": "application/json" } }
    );
  } catch (error) {
    console.error("refresh-tokens error", error);
    return new Response(
      JSON.stringify({ error: String(error) }),
      { status: 500, headers: { "content-type": "application/json" } }
    );
  }
});







