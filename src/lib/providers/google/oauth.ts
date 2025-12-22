const GOOGLE_AUTH = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN = "https://oauth2.googleapis.com/token";

const SCOPES = [
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.readonly", // future: reply tracking via API
].join(" ");

export function googleAuthUrl({ clientId, redirectUri, state }: { clientId: string; redirectUri: string; state: string; }) {
  const u = new URL(GOOGLE_AUTH);
  u.searchParams.set("client_id", clientId);
  u.searchParams.set("redirect_uri", redirectUri);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("access_type", "offline");
  u.searchParams.set("prompt", "consent"); // ensure refresh_token
  u.searchParams.set("scope", SCOPES);
  u.searchParams.set("state", state); // include wid
  return u.toString();
}

export async function exchangeCodeForTokens({ code, clientId, clientSecret, redirectUri }: {
  code: string; clientId: string; clientSecret: string; redirectUri: string;
}) {
  const res = await fetch(GOOGLE_TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code, client_id: clientId, client_secret: clientSecret,
      redirect_uri: redirectUri, grant_type: "authorization_code"
    })
  });
  if (!res.ok) throw new Error("google token exchange failed");
  return res.json() as Promise<{
    access_token: string; refresh_token: string; expires_in: number; id_token?: string; token_type: string;
  }>;
}

export async function refreshAccessToken({ refreshToken, clientId, clientSecret }: {
  refreshToken: string; clientId: string; clientSecret: string;
}) {
  const res = await fetch(GOOGLE_TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken, client_id: clientId, client_secret: clientSecret, grant_type: "refresh_token"
    })
  });
  if (!res.ok) throw new Error("google refresh failed");
  return res.json() as Promise<{ access_token: string; expires_in: number; token_type: string; }>;
}