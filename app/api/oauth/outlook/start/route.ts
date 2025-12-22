import { cookies } from "next/headers";

const OUTLOOK_SCOPE = encodeURIComponent("offline_access Mail.Send");

export async function GET() {
  const clientId =
    process.env.MS_OAUTH_CLIENT_ID ?? process.env.MS_CLIENT_ID ?? process.env.OUTLOOK_CLIENT_ID;
  const redirectUrl =
    process.env.MS_OAUTH_REDIRECT_URL ??
    process.env.MS_REDIRECT_URI ??
    process.env.OUTLOOK_REDIRECT_URI;
  const tenantId =
    process.env.MS_OAUTH_TENANT_ID ?? process.env.MS_TENANT_ID ?? "common";

  if (!clientId || !redirectUrl || !tenantId) {
    return new Response("Outlook OAuth not configured", { status: 500 });
  }

  const state = crypto.randomUUID();
  const cookieStore = cookies();
  cookieStore.set("oauth_outlook_state", state, {
    httpOnly: true,
    path: "/",
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 10 * 60,
  });

  const authUrl =
    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize` +
    `?client_id=${clientId}` +
    `&response_type=code` +
    `&redirect_uri=${encodeURIComponent(redirectUrl)}` +
    `&response_mode=query` +
    `&scope=${OUTLOOK_SCOPE}` +
    `&state=${state}`;

  return Response.redirect(authUrl);
}

