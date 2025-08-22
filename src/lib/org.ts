import 'server-only'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import crypto from 'crypto'

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
  return createClient(url, key, { auth: { persistSession: false } })
}

function userClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  const jar = cookies()
  return createServerClient(url, anon, {
    cookies: {
      get: (n: string) => jar.get(n)?.value,
      set() {},
      remove() {},
    },
  })
}

export async function getOrCreateDefaultOrgForUser() {
  const supabase = userClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { user: null, org: null }
  const sb = admin()
  const { data: prof } = await sb.from('profiles').select('id, org_id, email').eq('id', user.id).maybeSingle()
  if ((prof as any)?.org_id) {
    const { data: org } = await sb.from('orgs').select('id,name,owner_id').eq('id', (prof as any).org_id).maybeSingle()
    return { user, org }
  }
  const name = (prof as any)?.email ? `${(prof as any).email.split('@')[0]}'s Team` : 'My Team'
  const { data: org, error } = await sb.from('orgs').insert({ name, owner_id: user.id }).select('*').single()
  if (error) throw error
  await sb.from('org_members').insert({ org_id: (org as any).id, user_id: user.id, role: 'owner' })
  await sb.from('profiles').update({ org_id: (org as any).id }).eq('id', user.id)
  return { user, org }
}

export async function countSeats(orgId: string) {
  const sb = admin()
  const { count } = await sb.from('org_members').select('*', { head: true, count: 'exact' }).eq('org_id', orgId)
  return (count ?? 0) || 0
}

export function makeInviteToken() {
  return crypto.randomBytes(24).toString('hex')
}

export async function requireOrgRole(orgId: string, userId: string, roles: Array<'owner' | 'admin'> = ['owner', 'admin']) {
  const sb = admin()
  const { data: row } = await sb
    .from('org_members')
    .select('role')
    .eq('org_id', orgId)
    .eq('user_id', userId)
    .maybeSingle()
  const role = (row as any)?.role as string | undefined
  if (!role || !roles.includes(role as any)) {
    throw new Error('forbidden')
  }
}

export async function seatLimitForOrg(orgId: string): Promise<number | null> {
  const sb = admin()
  const { data: org } = await sb.from('orgs').select('owner_id').eq('id', orgId).maybeSingle()
  const ownerId = (org as any)?.owner_id as string | undefined
  if (!ownerId) return 1
  const { data: prof } = await sb.from('profiles').select('subscription_status').eq('id', ownerId).maybeSingle()
  const status = (prof as any)?.subscription_status as string | undefined
  const freeLimit = Number(process.env.ORG_FREE_SEAT_LIMIT ?? 1)
  const proLimitEnv = process.env.ORG_PRO_SEAT_LIMIT
  const proLimit = proLimitEnv != null ? Number(proLimitEnv) : null
  const isPro = status === 'pro' || status === 'active' || status === 'trialing'
  return isPro ? (Number.isFinite(proLimit as any) && (proLimit as any) > 0 ? (proLimit as any) : null) : Math.max(1, freeLimit)
}

export async function seatLimitForOrg(_orgId: string): Promise<number | null> {
  const raw = process.env.PRO_SEAT_LIMIT
  if (raw == null || raw === '') return null
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 1
}

export async function getMembership(orgId: string, userId: string) {
  const sb = admin()
  const { data } = await sb
    .from('org_members')
    .select('role')
    .eq('org_id', orgId)
    .eq('user_id', userId)
    .maybeSingle()
  return (data as any)?.role as string | undefined
}

export async function requireOrgRole(orgId: string, userId: string, allowed: Array<'owner' | 'admin'> = ['owner', 'admin']) {
  const role = await getMembership(orgId, userId)
  if (!role || !allowed.includes((role as any) || 'member')) {
    throw new Error('forbidden')
  }
  return role
}


  return status === 'pro' || status === 'active' || status === 'trialing' || status === 'past_due'
}

/**
 * Seat limit for an org (null = unlimited).
 * FREE_SEAT_LIMIT (default 1)
 * PRO_SEAT_LIMIT (default unlimited if unset)
 */
export async function seatLimitForOrg(orgId: string): Promise<number | null> {
  const sb = admin()
  const { data: org } = await sb.from('orgs').select('owner_id').eq('id', orgId).maybeSingle()
  if (!(org as any)?.owner_id) return 1
  const { data: owner } = await sb.from('profiles').select('subscription_status').eq('id', (org as any).owner_id).maybeSingle()
  const status = (owner as any)?.subscription_status as string | undefined
  if (isProLike(status)) {
    const raw = process.env.PRO_SEAT_LIMIT
    if (!raw || String(raw).trim() === '') return null
    const n = Number(raw)
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : null
  }
  const raw = process.env.FREE_SEAT_LIMIT
  const n = Number(raw ?? 1)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 1
}
