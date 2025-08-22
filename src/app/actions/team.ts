'use server'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { getOrCreateDefaultOrgForUser, makeInviteToken, seatLimitForOrg, countSeats } from '@/lib/org'
import { sendEmail } from '@/lib/notify/mailer'
import { syncSubscriptionQuantityForOrg } from '@/lib/billing/seats'
import { track } from '@/lib/analytics'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

function admin() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
  return createClient(supabaseUrl, key, { auth: { persistSession: false } })
}

function userClient() {
  const jar = cookies()
  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      get: (n: string) => jar.get(n)?.value,
      set() {},
      remove() {},
    },
  })
}

export async function inviteMember(formData: FormData) {
  const email = String(formData.get('email') || '').trim().toLowerCase()
  if (!email) throw new Error('email_required')
  const { user, org } = await getOrCreateDefaultOrgForUser()
  if (!user || !org) throw new Error('unauthorized')
  const token = makeInviteToken()
  const days = Number(process.env.TEAM_INVITE_EXPIRY_DAYS || 7)
  const expires = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString()
  const sb = admin()
  // Seat limit enforcement
  const [limit, seats] = await Promise.all([seatLimitForOrg((org as any).id), countSeats((org as any).id)])
  if (limit !== null && seats >= limit) {
    redirect('/dashboard/billing?status=error&from=seat_limit')
  }
  await sb.from('org_invites').insert({ org_id: (org as any).id, email, token, expires_at: expires })
  const url = `${(process.env.NEXT_PUBLIC_APP_URL as string).replace(/\/$/, '')}/api/org/invite/accept?token=${encodeURIComponent(token)}`
  await sendEmail({
    to: email,
    subject: 'You’ve been invited to SmartSend',
    text: `Join the team: ${url}\nThis link expires in ${days} day(s).`,
  })
  await track('seat_invite_sent', { userId: (user as any).id, orgId: (org as any).id, email })
}

export async function removeMember(formData: FormData) {
  const memberId = String(formData.get('user_id') || '')
  const { user, org } = await getOrCreateDefaultOrgForUser()
  if (!user || !org) throw new Error('unauthorized')
  const sb = admin()
  const { data: orgRow } = await sb.from('orgs').select('owner_id').eq('id', (org as any).id).maybeSingle()
  if ((orgRow as any)?.owner_id === memberId) throw new Error('cannot_remove_owner')
  await sb.from('org_members').delete().eq('org_id', (org as any).id).eq('user_id', memberId)
  await track('seat_removed', { orgId: (org as any).id, actor: (user as any).id, removed: memberId })
  await syncSubscriptionQuantityForOrg((org as any).id)
}

