const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
const TOKEN_URL = "https://oauth2.googleapis.com/token"
const PROFILE_URL = "https://www.googleapis.com/oauth2/v2/userinfo"

export function buildGoogleAuthUrl(state: string) {
  const url = new URL(AUTH_URL)
  url.searchParams.set("client_id", process.env.GOOGLE_CLIENT_ID!)
  url.searchParams.set("redirect_uri", process.env.GOOGLE_REDIRECT_URI!)
  url.searchParams.set("response_type", "code")
  url.searchParams.set("access_type", "offline")     // get refresh_token
  url.searchParams.set("prompt", "consent")          // always return refresh_token (MVP)
  url.searchParams.set("scope", (process.env.GOOGLE_OAUTH_SCOPES ||
    "https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/gmail.readonly"))
  url.searchParams.set("state", state)
  return url.toString()
}

export async function exchangeCodeForTokens(code: string) {
  const body = new URLSearchParams({
    code,
    client_id: process.env.GOOGLE_CLIENT_ID!,
    client_secret: process.env.GOOGLE_CLIENT_SECRET!,
    redirect_uri: process.env.GOOGLE_REDIRECT_URI!,
    grant_type: "authorization_code",
  }).toString()

  const r = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  })
  if (!r.ok) throw new Error(`token exchange failed: ${r.status} ${r.statusText}`)
  return r.json() as Promise<{
    access_token: string
    refresh_token?: string
    expires_in: number
    token_type: string
    scope: string
  }>
}

export async function refreshAccessToken(refresh_token: string) {
  const body = new URLSearchParams({
    refresh_token,
    client_id: process.env.GOOGLE_CLIENT_ID!,
    client_secret: process.env.GOOGLE_CLIENT_SECRET!,
    grant_type: "refresh_token",
  }).toString()

  const r = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  })
  if (!r.ok) throw new Error(`token refresh failed: ${r.status} ${r.statusText}`)
  return r.json() as Promise<{
    access_token: string
    expires_in: number
    token_type: string
    scope: string
  }>
}

export async function fetchGoogleProfile(access_token: string) {
  const r = await fetch(PROFILE_URL, {
    headers: { Authorization: `Bearer ${access_token}` },
    cache: "no-store",
  })
  if (!r.ok) throw new Error(`profile fetch failed: ${r.status} ${r.statusText}`)
  return r.json() as Promise<{ email: string }>
}

