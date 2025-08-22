import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const refParam = requestUrl.searchParams.get('ref')

  if (code) {
    const supabase = createRouteHandlerClient({ cookies })
    await supabase.auth.exchangeCodeForSession(code)
    // Associate referral if cookie (ss_ref) or ref param present
    try {
      const jar = cookies()
      const ref = refParam || jar.get('ss_ref_code')?.value || jar.get('ss_ref')?.value
      const { data: { user } } = await supabase.auth.getUser()
      if (ref && user?.id) {
        const admin = createAdminClient()
        // ref may be code or user id; try code first
        const { data: inviter } = await admin.from('profiles').select('id').eq('referral_code', ref).maybeSingle()
        const inviterId = (inviter as any)?.id || (ref !== user.id ? ref : null)
        if (inviterId && inviterId !== user.id) {
          // Try update by email first
          const { data: existing } = await admin
            .from('referrals')
            .select('id')
            .eq('inviter', inviterId)
            .eq('email', (user.email || '').toLowerCase())
            .maybeSingle()
          if (existing) {
            await admin.from('referrals').update({ invitee: user.id, status: 'joined' }).eq('id', (existing as any).id)
          } else {
            await admin.from('referrals').upsert({ inviter: inviterId, invitee: user.id, email: (user.email || '').toLowerCase(), status: 'joined' })
          }
        }
      }
    } catch {}
  }

  // URL to redirect to after sign in process completes
  return NextResponse.redirect(new URL('/getting-started', request.url))
} 