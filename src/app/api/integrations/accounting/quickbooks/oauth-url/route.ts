import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { getCurrentCompanyId } from '@/lib/company-helpers'
import crypto from 'crypto'

export async function GET(req: NextRequest) {
  try {
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
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const companyId = await getCurrentCompanyId()
    if (!companyId) {
      return NextResponse.json({ error: 'No company found' }, { status: 400 })
    }

    const state = crypto.randomBytes(32).toString('hex')
    cookieStore.set('quickbooks_oauth_state', state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 600,
    })

    const clientId = process.env.QUICKBOOKS_CLIENT_ID
    const clientSecret = process.env.QUICKBOOKS_CLIENT_SECRET
    const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/integrations/accounting/quickbooks/callback`

    if (!clientId || !clientSecret) {
      return NextResponse.json({ error: 'QuickBooks OAuth not configured' }, { status: 500 })
    }

    const scopes = [
      'com.intuit.quickbooks.accounting',
      'com.intuit.quickbooks.payment',
    ].join(' ')

    const authUrl = new URL('https://appcenter.intuit.com/connect/oauth2')
    authUrl.searchParams.set('client_id', clientId)
    authUrl.searchParams.set('redirect_uri', redirectUri)
    authUrl.searchParams.set('response_type', 'code')
    authUrl.searchParams.set('scope', scopes)
    authUrl.searchParams.set('state', state)

    return NextResponse.json({ url: authUrl.toString() })
  } catch (error: any) {
    console.error('Error generating QuickBooks OAuth URL:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

























