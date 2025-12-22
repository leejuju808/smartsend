import { NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import { createServerClient } from "@supabase/ssr"
import { exchangeCodeForTokens } from "@/lib/google/oauth"

// Fetch primary email with the Gmail profile endpoint
async function getGoogleEmail(access_token: string) {
  const r = await fetch("https://www.googleapis.com/gmail/v1/users/me/profile", {
    headers: { Authorization: `Bearer ${access_token}` }
  })
  if (!r.ok) throw new Error(await r.text())
  const j = await r.json() as { emailAddress: string }
  return j.emailAddress
}

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code")
  const state = req.nextUrl.searchParams.get("state")
  const cookieStore = await cookies();
  const stateCookie = cookieStore.get("g_state")?.value
  if (!code || !state || !stateCookie || state !== stateCookie) {
    return NextResponse.redirect("/settings?error=gmail_state")
  }

  // Supabase auth
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { 
      cookies: {
        get: (name: string) => cookieStore.get(name)?.value,
        set: () => {},
        remove: () => {},
      },
    }
  )
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect("/login")

  try {
    const tok = await exchangeCodeForTokens(code)
    const email = await getGoogleEmail(tok.access_token)
    const expiresAt = new Date(Date.now() + tok.expires_in * 1000).toISOString()

    // upsert account
    const { error } = await supabase.from("email_accounts").upsert({
      user_id: user.id,
      provider: "gmail",
      email: email,
      access_token: tok.access_token,
      refresh_token: tok.refresh_token,  // may be undefined on subsequent consents
      expires_at: expiresAt
    }, { onConflict: "user_id,provider" })
    if (error) throw error

    // Clean state
    const res = NextResponse.redirect("/settings?connected=gmail")
    res.cookies.set("g_state", "", { maxAge: 0 })
    return res
  } catch (e: any) {
    return NextResponse.redirect("/settings?error=" + encodeURIComponent(e.message))
  }
}

