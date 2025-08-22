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
    // Ensure personal workspace exists and membership is created
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (user?.id) {
        const admin = createAdminClient()
        // If user not a member anywhere, create a personal workspace and add as owner
        const { count } = await admin.from('workspace_members').select('*', { count: 'exact', head: true }).eq('user_id', user.id)
        if (!count || count === 0) {
          const { data: ws } = await admin
            .from('workspaces')
            .insert({ name: `${user.email ?? 'Personal'} Workspace`, owner_id: user.id })
            .select('*')
            .single()
          if ((ws as any)?.id) {
            await admin
              .from('workspace_members')
              .insert({ workspace_id: (ws as any).id, user_id: user.id, role: 'owner' })
          }
        }
      }
    } catch {}
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
  return NextResponse.redirect(new URL('/dashboard', request.url))
} 