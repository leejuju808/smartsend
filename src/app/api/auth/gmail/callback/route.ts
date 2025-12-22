import { NextRequest, NextResponse } from "next/server"
import { exchangeCodeForTokens, fetchGoogleProfile } from "@/lib/googleOAuth"

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code")
  const error = req.nextUrl.searchParams.get("error")
  if (error) return NextResponse.redirect(`/dashboard/settings?gmail_error=${encodeURIComponent(error)}`)
  if (!code) return NextResponse.redirect(`/dashboard/settings?gmail_error=missing_code`)

  try {
    const tokens = await exchangeCodeForTokens(code)
    const accessToken = tokens.access_token
    const refreshToken = tokens.refresh_token // may be undefined if Google has seen consent recently
    if (!accessToken) throw new Error("no access_token returned")

    const profile = await fetchGoogleProfile(accessToken)
    const email = profile.email

    // compute expiry
    const expiresAt = new Date(Date.now() + (tokens.expires_in - 60) * 1000).toISOString()

    // single-tenant MVP: write to OWNER_USER_ID
    const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    const SUPABASE_SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!
    const OWNER_USER_ID = process.env.OWNER_USER_ID!

    // Get existing row to keep old refresh_token if Google didn't send a new one
    const currentRes = await fetch(`${SUPABASE_URL}/rest/v1/gmail_connections?user_id=eq.${OWNER_USER_ID}&select=refresh_token`, {
      headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${SUPABASE_SERVICE}` },
      cache: "no-store",
    })
    const current = (await currentRes.json())[0]

    const upsertPayload = [{
      user_id: OWNER_USER_ID,
      access_token: accessToken,
      refresh_token: refreshToken ?? current?.refresh_token, // preserve existing
      expires_at: expiresAt,
      email_address: email,
      last_sync_at: null
    }]

    const upsert = await fetch(`${SUPABASE_URL}/rest/v1/gmail_connections`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_ANON,
        Authorization: `Bearer ${SUPABASE_SERVICE}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates"
      },
      body: JSON.stringify(upsertPayload),
    })

    if (!upsert.ok) {
      const msg = await upsert.text()
      throw new Error(`upsert failed: ${msg}`)
    }

    return NextResponse.redirect(`/dashboard/settings?gmail_connected=1`)
  } catch (e: any) {
    return NextResponse.redirect(`/dashboard/settings?gmail_error=${encodeURIComponent(e?.message || "unknown")}`)
  }
}

