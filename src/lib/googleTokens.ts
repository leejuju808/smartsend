// /lib/googleTokens.ts
export async function ensureAccessToken({
  access_token,
  refresh_token,
  token_expiry // ISO string
}: { access_token: string; refresh_token?: string | null; token_expiry?: string | null }) {
  const soon = Date.now() + 60 * 1000
  const isExpired = !access_token || (token_expiry && new Date(token_expiry).getTime() <= soon)

  if (!isExpired) return { access_token }

  if (!refresh_token) throw new Error('No refresh_token available')

  const body = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    client_secret: process.env.GOOGLE_CLIENT_SECRET!,
    grant_type: 'refresh_token',
    refresh_token
  })

  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  })
  if (!r.ok) throw new Error(`refresh failed: ${await r.text()}`)
  const j = await r.json()

  // Return new token + expiry; let caller persist if needed
  return {
    access_token: j.access_token as string,
    expires_in: j.expires_in as number
  }
}

