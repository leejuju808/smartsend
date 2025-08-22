import { google } from 'googleapis'

type Provider = 'google' | 'outlook'

export interface OAuthTokens {
  access_token: string
  refresh_token: string
  expiry_date?: number
}

export async function getTokens(provider: Provider, code: string, redirectUriOverride?: string): Promise<OAuthTokens> {
  if (provider === 'google') {
    const oauth2 = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID!,
      process.env.GOOGLE_CLIENT_SECRET!,
      redirectUriOverride || process.env.GOOGLE_OAUTH_REDIRECT_URL!
    )
    const { tokens } = await oauth2.getToken(code)
    return {
      access_token: tokens.access_token!,
      refresh_token: tokens.refresh_token!,
      expiry_date: tokens.expiry_date,
    }
  }

  // Outlook (Microsoft identity platform)
  const params = new URLSearchParams({
    client_id: process.env.MICROSOFT_CLIENT_ID!,
    client_secret: process.env.MICROSOFT_CLIENT_SECRET!,
    code,
    grant_type: 'authorization_code',
    redirect_uri: redirectUriOverride || process.env.MICROSOFT_OAUTH_REDIRECT_URL!,
  })

  const resp = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  })
  if (!resp.ok) {
    const text = await resp.text()
    throw new Error(`Microsoft token exchange failed: ${text}`)
  }
  const json = await resp.json()
  return {
    access_token: json.access_token,
    refresh_token: json.refresh_token,
    expiry_date: json.expires_in ? Date.now() + Number(json.expires_in) * 1000 : undefined,
  }
}

export async function getGoogleProfileEmail(accessToken: string): Promise<string | null> {
  const oauth2 = google.oauth2({ version: 'v2', headers: { Authorization: `Bearer ${accessToken}` } as any })
  try {
    const prof = await oauth2.userinfo.get()
    return (prof.data.email as string) || null
  } catch {
    return null
  }
}

export async function getMicrosoftProfileEmail(accessToken: string): Promise<string | null> {
  const resp = await fetch('https://graph.microsoft.com/v1.0/me', {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!resp.ok) return null
  const j = await resp.json()
  return (j.mail as string) || (j.userPrincipalName as string) || null
}

