export async function getValidAccessToken(supabase: any, accountId: string) {
  const { data: acct } = await supabase
    .from("email_accounts")
    .select("id, provider, account_email, access_token, expires_at")
    .eq("id", accountId)
    .single();

  const exp = acct?.expires_at ? new Date(acct.expires_at).getTime() : 0;
  if (Date.now() < exp - 60_000) return acct.access_token;

  const { data: tokenRows, error } = await supabase.rpc(
    "get_refresh_token",
    { _id: accountId, _key: process.env.TOKEN_CRYPT_KEY! }
  );
  if (error) throw error;
  const refreshToken: string = tokenRows;

  if (acct.provider === "gmail") {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error?.message || "gmail refresh failed");
    await supabase
      .from("email_accounts")
      .update({
        access_token: json.access_token,
        expires_at: new Date(Date.now() + json.expires_in * 1000).toISOString(),
        scope: json.scope ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", accountId);
    return json.access_token;
  }

  if (acct.provider === "outlook") {
    const res = await fetch(
      `https://login.microsoftonline.com/${process.env.MS_TENANT_ID}/oauth2/v2.0/token`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: process.env.MS_CLIENT_ID!,
          client_secret: process.env.MS_CLIENT_SECRET!,
          grant_type: "refresh_token",
          refresh_token: refreshToken,
        }),
      }
    );
    const json = await res.json();
    if (!res.ok) throw new Error(json.error_description || "ms refresh failed");
    await supabase
      .from("email_accounts")
      .update({
        access_token: json.access_token,
        expires_at: new Date(Date.now() + json.expires_in * 1000).toISOString(),
        scope: json.scope ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", accountId);
    return json.access_token;
  }

  throw new Error("Unknown provider for refresh");
}


