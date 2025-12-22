const AUTH_BASE = "https://accounts.google.com/o/oauth2/v2/auth"
const TOKEN_URL = "https://oauth2.googleapis.com/token"

export function googleAuthUrl(state: string) {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_OAUTH_CLIENT_ID!,
    redirect_uri: process.env.GOOGLE_OAUTH_REDIRECT_URI!,
    response_type: "code",
    access_type: "offline",              // get refresh_token
    prompt: "consent",                    // ensure refresh_token on re-consent
    scope: process.env.GOOGLE_OAUTH_SCOPE!,
    include_granted_scopes: "true",
    state
  })
  return `${AUTH_BASE}?${params.toString()}`
}

export async function exchangeCodeForTokens(code: string) {
  const body = new URLSearchParams({
    code,
    client_id: process.env.GOOGLE_OAUTH_CLIENT_ID!,
    client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET!,
    redirect_uri: process.env.GOOGLE_OAUTH_REDIRECT_URI!,
    grant_type: "authorization_code",
  })
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString()
  })
  if (!res.ok) throw new Error(`Token exchange failed: ${await res.text()}`)
  return await res.json() as {
    access_token: string, expires_in: number, refresh_token?: string, id_token?: string, token_type: string
  }
}

export async function refreshAccessToken(refresh_token: string) {
  const body = new URLSearchParams({
    refresh_token,
    client_id: process.env.GOOGLE_OAUTH_CLIENT_ID!,
    client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET!,
    grant_type: "refresh_token",
  })
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString()
  })
  if (!res.ok) throw new Error(`Refresh failed: ${await res.text()}`)
  return await res.json() as { access_token: string, expires_in: number, token_type: string }
}

