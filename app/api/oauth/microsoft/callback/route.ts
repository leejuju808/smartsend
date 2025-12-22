import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

function getAppUrl() {
  return process.env.NEXT_PUBLIC_APP_URL ?? "";
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  if (!code) {
    return NextResponse.json({ error: "missing_code" }, { status: 400 });
  }

  const clientId = process.env.MICROSOFT_CLIENT_ID ?? process.env.MS_CLIENT_ID;
  const clientSecret =
    process.env.MICROSOFT_CLIENT_SECRET ?? process.env.MS_CLIENT_SECRET;
  const redirectUri =
    process.env.MICROSOFT_REDIRECT_URI ??
    process.env.MS_REDIRECT_URI ??
    `${getAppUrl()}/api/oauth/microsoft/callback`;

  if (!clientId || !clientSecret || !redirectUri) {
    return NextResponse.json(
      { error: "microsoft_oauth_not_configured" },
      { status: 500 }
    );
  }

  const tokenRes = await fetch(
    "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
        code,
      }),
    }
  );

  const tokens = await tokenRes.json();
  if (!tokenRes.ok) {
    return NextResponse.json(
      { error: "microsoft_exchange_failed", detail: tokens },
      { status: 400 }
    );
  }

  const meRes = await fetch("https://graph.microsoft.com/v1.0/me", {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });

  if (!meRes.ok) {
    return NextResponse.json({ error: "microsoft_me_failed" }, { status: 400 });
  }
  const me = await meRes.json();

  const webhookSecret = crypto.randomUUID().replace(/-/g, "");
  const subscriptionRes = await fetch(
    "https://graph.microsoft.com/v1.0/subscriptions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tokens.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        changeType: "created",
        notificationUrl: `${getAppUrl()}/api/webhooks/outlook`,
        resource: "/me/mailFolders('Inbox')/messages",
        expirationDateTime: new Date(Date.now() + 55 * 60 * 1000).toISOString(),
        clientState: webhookSecret,
      }),
    }
  );

  const subscription = subscriptionRes.ok ? await subscriptionRes.json() : null;

  const routeClient = createRouteHandlerClient({ cookies });
  const {
    data: { user },
  } = await routeClient.auth.getUser();

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const expiresAt =
    typeof tokens.expires_in === "number"
      ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
      : null;

  await supabase.from("mail_accounts").upsert(
    {
      user_id: user?.id ?? null,
      provider: "outlook",
      email: me?.mail ?? me?.userPrincipalName ?? "",
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token ?? null,
      expires_at: expiresAt,
      scope: tokens.scope,
      provider_meta: {
        subscriptionId: subscription?.id ?? null,
        expirationDateTime: subscription?.expirationDateTime ?? null,
        webhookSecret,
      },
    },
    { onConflict: "provider,email" }
  );

  const base = getAppUrl();
  const target = "/settings?connected=outlook";

  return base
    ? NextResponse.redirect(`${base}${target}`)
    : NextResponse.redirect(target);
}







