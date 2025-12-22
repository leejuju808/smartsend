import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { getCurrentCompanyId } from '@/lib/company-helpers'

export async function GET(req: NextRequest) {
  const cookieStore = await cookies()
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
  if (!user) {
    return NextResponse.redirect(new URL('/login', req.url))
  }

  const companyId = await getCurrentCompanyId()
  if (!companyId) {
    return NextResponse.redirect(new URL('/dashboard/integrations?error=no_company', req.url))
  }

  const { searchParams } = new URL(req.url)
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const stateCookie = cookieStore.get('gmail_oauth_state')?.value

  if (!code) {
    return NextResponse.redirect(new URL('/dashboard/integrations?error=missing_code', req.url))
  }

  if (!state || !stateCookie || state !== stateCookie) {
    return NextResponse.redirect(new URL('/dashboard/integrations?error=invalid_state', req.url))
  }

  cookieStore.delete('gmail_oauth_state')

  try {
    // Exchange code for tokens
    const clientId = process.env.GOOGLE_CLIENT_ID || process.env.GOOGLE_OAUTH_CLIENT_ID
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET || process.env.GOOGLE_OAUTH_CLIENT_SECRET
    const redirectUri = process.env.GOOGLE_REDIRECT_URI || 
      `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/integrations/email/gmail/callback`

    if (!clientId || !clientSecret) {
      return NextResponse.redirect(new URL('/dashboard/integrations?error=not_configured', req.url))
    }

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    })

    if (!tokenRes.ok) {
      const error = await tokenRes.text()
      console.error('Token exchange failed:', error)
      return NextResponse.redirect(new URL('/dashboard/integrations?error=token_exchange_failed', req.url))
    }

    const tokenData = await tokenRes.json()
    const { access_token, refresh_token, expires_in } = tokenData

    if (!access_token) {
      return NextResponse.redirect(new URL('/dashboard/integrations?error=no_access_token', req.url))
    }

    // Get user's email from Google
    const profileRes = await fetch('https://www.googleapis.com/gmail/v1/users/me/profile', {
      headers: { Authorization: `Bearer ${access_token}` },
    })

    if (!profileRes.ok) {
      return NextResponse.redirect(new URL('/dashboard/integrations?error=profile_fetch_failed', req.url))
    }

    const profile = await profileRes.json()
    const email = profile.emailAddress

    // Store in integration_accounts
    const expiresAt = expires_in
      ? new Date(Date.now() + expires_in * 1000).toISOString()
      : null

    const { error: insertError } = await supabase
      .from('integration_accounts')
      .upsert({
        roofing_company_id: companyId,
        integration_type: 'gmail',
        access_token,
        refresh_token: refresh_token || null,
        expires_at: expiresAt,
        is_active: true,
        is_default: true, // Set as default email account
        connected_by_user_id: user.id,
        connected_at: new Date().toISOString(),
        config: {
          email,
          display_name: profile.displayName || null,
        },
      }, {
        onConflict: 'roofing_company_id,integration_type,is_default',
      })

    if (insertError) {
      console.error('Error storing Gmail integration:', insertError)
      return NextResponse.redirect(new URL('/dashboard/integrations?error=store_failed', req.url))
    }

    return NextResponse.redirect(new URL('/dashboard/integrations?connected=gmail', req.url))
  } catch (error: any) {
    console.error('Error in Gmail OAuth callback:', error)
    return NextResponse.redirect(new URL('/dashboard/integrations?error=callback_error', req.url))
  }
}

























