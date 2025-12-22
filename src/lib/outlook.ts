import "isomorphic-fetch";

export async function refreshMsToken(refresh_token: string) {
  const res = await fetch(`https://login.microsoftonline.com/${process.env.MS_TENANT_ID!}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.MS_CLIENT_ID!,
      client_secret: process.env.MS_CLIENT_SECRET!,
      grant_type: "refresh_token",
      refresh_token,
      scope: "offline_access Mail.Read Mail.Send Mail.ReadWrite"
    })
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<{ access_token: string; refresh_token?: string; expires_in: number }>;
}

export async function ensureAccessToken(acc: {
  access_token: string; refresh_token: string; token_expiry?: string | null;
}, updateTokens: (t: { access_token: string; refresh_token?: string; token_expiry: string }) => Promise<void>) {
  if (!acc.token_expiry || new Date(acc.token_expiry).getTime() - Date.now() > 60_000) {
    return acc.access_token;
  }
  const t = await refreshMsToken(acc.refresh_token);
  const token_expiry = new Date(Date.now() + (t.expires_in - 60) * 1000).toISOString();
  await updateTokens({ access_token: t.access_token, refresh_token: t.refresh_token || acc.refresh_token, token_expiry });
  return t.access_token;
}

export function buildMime({ from, to, subject, text }: { from: string; to: string; subject?: string; text: string; }) {
  return [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subject ?? ""}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=utf-8",
    "",
    text,
  ].join("\r\n");
}

