import { type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function GET(req: NextRequest) {
  const cookieStore = cookies();
  const stateCookie = cookieStore.get("oauth_outlook_state")?.value;
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");

  if (!code) {
    return new Response("Missing code", { status: 400 });
  }

  if (!state || !stateCookie || state !== stateCookie) {
    return new Response("Invalid state", { status: 400 });
  }

  cookieStore.delete("oauth_outlook_state");

  const clientId =
    process.env.MS_OAUTH_CLIENT_ID ??
    process.env.MS_CLIENT_ID ??
    process.env.OUTLOOK_CLIENT_ID;
  const clientSecret =
    process.env.MS_OAUTH_CLIENT_SECRET ??
    process.env.MS_CLIENT_SECRET ??
    process.env.OUTLOOK_CLIENT_SECRET;
  const redirectUrl =
    process.env.MS_OAUTH_REDIRECT_URL ??
    process.env.MS_REDIRECT_URI ??
    process.env.OUTLOOK_REDIRECT_URI;
  const tenantId =
    process.env.MS_OAUTH_TENANT_ID ??
    process.env.MS_TENANT_ID ??
    process.env.MS_OAUTH_TENANT ??
    "common";

  if (!clientId || !clientSecret || !redirectUrl || !tenantId) {
    return new Response("Outlook OAuth not configured", { status: 500 });
  }

  const tokenRes = await fetch(
    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUrl,
        grant_type: "authorization_code",
        code,
      }),
    }
  );

  const token = await tokenRes.json();
  if (!tokenRes.ok) {
    return new Response("Failed to exchange token", { status: 400 });
  }

  const meRes = await fetch("https://graph.microsoft.com/v1.0/me", {
    headers: { Authorization: `Bearer ${token.access_token}` },
  });
  if (!meRes.ok) {
    return new Response("Failed to fetch account profile", { status: 400 });
  }
  const me = await meRes.json();

  const supabase = createRouteHandlerClient({ cookies: cookieStore });
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { data: acct, error: acctErr } = await supabase
    .from("provider_accounts")
    .upsert(
      {
        account_id: user.id,
        provider: "outlook",
        email: me.userPrincipalName,
        display_name: me.displayName ?? null,
        provider_user_id: me.id,
        tenant_id: process.env.MS_OAUTH_TENANT_ID ?? null,
        status: "active",
      },
      { onConflict: "account_id,provider,email" }
    )
    .select("*")
    .single();

  if (acctErr || !acct) {
    return new Response("Failed to store provider account", { status: 500 });
  }

  let refreshToken: string | undefined = token.refresh_token ?? undefined;
  if (!refreshToken) {
    const { data: existingToken } = await supabase
      .from("provider_tokens")
      .select("refresh_token")
      .eq("provider_account_id", acct.id)
      .maybeSingle();
    refreshToken = existingToken?.refresh_token ?? undefined;
  }

  if (!refreshToken) {
    return new Response("Missing refresh token", { status: 400 });
  }

  const expiresAt = new Date(
    Date.now() + ((token.expires_in ?? 3600) as number) * 1000
  ).toISOString();

  const { error: tokenErr } = await supabase.from("provider_tokens").upsert({
    provider_account_id: acct.id,
    access_token: token.access_token,
    refresh_token: refreshToken,
    expires_at: expiresAt,
    scope: token.scope ?? null,
    token_type: token.token_type ?? null,
  });

  if (tokenErr) {
    return new Response("Failed to store provider token", { status: 500 });
  }

  const redirectTarget =
    process.env.NEXT_PUBLIC_APP_URL?.length
      ? `${process.env.NEXT_PUBLIC_APP_URL}/settings/sending`
      : "/settings/sending";

  return Response.redirect(redirectTarget);
}
