import { refreshAccessToken } from "@/lib/googleOAuth"

export async function getFreshGmailToken() {
  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  const SUPABASE_SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!
  const OWNER_USER_ID = process.env.OWNER_USER_ID!

  // load connection
  const r = await fetch(`${SUPABASE_URL}/rest/v1/gmail_connections?user_id=eq.${OWNER_USER_ID}&select=*`, {
    headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${SUPABASE_SERVICE}` },
    cache: "no-store",
  })
  const [conn] = await r.json()
  if (!conn) throw new Error("No gmail connection")

  const now = Date.now()
  const exp = new Date(conn.expires_at).getTime()
  if (exp - now > 90_000) {
    // still fresh for >90s
    return conn.access_token as string
  }

  // refresh
  if (!conn.refresh_token) throw new Error("No refresh_token on record")
  const refreshed = await refreshAccessToken(conn.refresh_token)
  const newAccess = refreshed.access_token
  const newExpires = new Date(Date.now() + (refreshed.expires_in - 60) * 1000).toISOString()

  // persist
  await fetch(`${SUPABASE_URL}/rest/v1/gmail_connections?user_id=eq.${OWNER_USER_ID}`, {
    method: "PATCH",
    headers: {
      apikey: SUPABASE_ANON,
      Authorization: `Bearer ${SUPABASE_SERVICE}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ access_token: newAccess, expires_at: newExpires }),
  })

  return newAccess
}

