import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const G_CLIENT_ID =
  Deno.env.get("GOOGLE_OAUTH_CLIENT_ID") ??
  Deno.env.get("GOOGLE_CLIENT_ID") ??
  Deno.env.get("GMAIL_CLIENT_ID")!;
const G_CLIENT_SECRET =
  Deno.env.get("GOOGLE_OAUTH_CLIENT_SECRET") ??
  Deno.env.get("GOOGLE_CLIENT_SECRET") ??
  Deno.env.get("GMAIL_CLIENT_SECRET")!;
const MS_CLIENT_ID =
  Deno.env.get("MS_OAUTH_CLIENT_ID") ??
  Deno.env.get("MS_CLIENT_ID") ??
  Deno.env.get("OUTLOOK_CLIENT_ID")!;
const MS_CLIENT_SECRET =
  Deno.env.get("MS_OAUTH_CLIENT_SECRET") ??
  Deno.env.get("MS_CLIENT_SECRET") ??
  Deno.env.get("OUTLOOK_CLIENT_SECRET")!;
const MS_TENANT =
  Deno.env.get("MS_OAUTH_TENANT_ID") ??
  Deno.env.get("MS_TENANT_ID") ??
  Deno.env.get("MS_OAUTH_TENANT") ??
  "common";

Deno.serve(async () => {
  const { data: rows, error } = await sb
    .from("provider_tokens")
    .select("*, provider_accounts!inner(id,provider)")
    .lt("expires_at", new Date(Date.now() + 10 * 60 * 1000).toISOString());

  if (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "content-type": "application/json" } },
    );
  }

  let refreshed = 0;

  for (const token of rows ?? []) {
    try {
      if (token.provider_accounts.provider === "gmail") {
        const resp = await fetch("https://oauth2.googleapis.com/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            client_id: G_CLIENT_ID,
            client_secret: G_CLIENT_SECRET,
            grant_type: "refresh_token",
            refresh_token: token.refresh_token,
          }),
        });

        const json = await resp.json();
        if (!resp.ok) {
          throw new Error(json.error ?? "refresh_failed");
        }

        await sb
          .from("provider_tokens")
          .update({
            access_token: json.access_token,
            refresh_token: json.refresh_token ?? token.refresh_token,
            expires_at: new Date(
              Date.now() + ((json.expires_in ?? 3600) as number) * 1000,
            ).toISOString(),
            scope: json.scope ?? token.scope,
            token_type: json.token_type ?? token.token_type,
          })
          .eq("provider_account_id", token.provider_account_id);
      } else {
        const resp = await fetch(
          `https://login.microsoftonline.com/${MS_TENANT}/oauth2/v2.0/token`,
          {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
              client_id: MS_CLIENT_ID,
              client_secret: MS_CLIENT_SECRET,
              grant_type: "refresh_token",
              refresh_token: token.refresh_token,
              scope: token.scope ?? "offline_access Mail.Send",
            }),
          },
        );

        const json = await resp.json();
        if (!resp.ok) {
          throw new Error(json.error ?? "refresh_failed");
        }

        await sb
          .from("provider_tokens")
          .update({
            access_token: json.access_token,
            refresh_token: json.refresh_token ?? token.refresh_token,
            expires_at: new Date(
              Date.now() + ((json.expires_in ?? 3600) as number) * 1000,
            ).toISOString(),
            scope: json.scope ?? token.scope,
            token_type: json.token_type ?? token.token_type,
          })
          .eq("provider_account_id", token.provider_account_id);
      }

      refreshed += 1;
    } catch (_err) {
      await sb
        .from("provider_accounts")
        .update({ status: "error" })
        .eq("id", token.provider_account_id);
    }
  }

  return new Response(
    JSON.stringify({ refreshed }),
    { headers: { "content-type": "application/json" } },
  );
});

