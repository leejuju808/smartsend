import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/server/supabase'
import { getTokens, getGoogleProfileEmail, getMicrosoftProfileEmail } from '@/lib/oauth'

export async function GET(request: NextRequest, { params }: { params: { provider: string } }) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const state = requestUrl.searchParams.get('state')
  const provider = params.provider
  if (!code) return NextResponse.json({ error: 'Missing code' }, { status: 400 })

  // Extract userId if present in state
  let userId: string | undefined
  try { userId = state ? JSON.parse(state).userId : undefined } catch {}
  userId = userId || requestUrl.searchParams.get('userId') || undefined
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const tokens = await getTokens(provider as any, code)
    let fromEmail: string | null = null
    if (provider === 'google') {
      fromEmail = await getGoogleProfileEmail(tokens.access_token)
    } else if (provider === 'outlook') {
      fromEmail = await getMicrosoftProfileEmail(tokens.access_token)
    }

    // Store in connected_accounts
    await supabaseAdmin.from('connected_accounts').insert({
      user_id: userId,
      provider: provider === 'google' ? 'gmail' : 'outlook',
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : new Date(Date.now() + 55 * 60 * 1000).toISOString(),
    })

    // Optionally upsert into mailboxes for immediate sending compatibility
    if (provider === 'google') {
      await supabaseAdmin.from('mailboxes').upsert({
        owner: userId,
        provider: 'gmail',
        from_email: fromEmail,
        gmail_access_token: tokens.access_token,
        gmail_refresh_token: tokens.refresh_token,
        gmail_token_expiry: tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'owner' })
    } else if (provider === 'outlook') {
      await supabaseAdmin.from('mailboxes').upsert({
        owner: userId,
        provider: 'smtp',
        from_email: fromEmail,
        // For Outlook, actual sending will use Graph; marking smtp here keeps current status UI functional until Outlook path is wired
        updated_at: new Date().toISOString(),
      }, { onConflict: 'owner' })
    }

    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_SITE_URL}/settings/mailbox?connected=${provider}`)
  } catch (e: any) {
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_SITE_URL}/settings/mailbox?error=${encodeURIComponent(e?.message || 'OAuth failed')}`)
  }
}

