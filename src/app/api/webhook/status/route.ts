import 'server-only'
import { createAdminClient, createServerComponentClient } from '@/lib/supabase'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const supa = createServerComponentClient()
  const { data: { user } } = await supa.auth.getUser()
  if (!user) return new Response(JSON.stringify({ ok: true, latest: null }), { status: 200, headers: { 'content-type': 'application/json' } })
  const admin = createAdminClient()
  const { data } = await admin
    .from('analytics_events')
    .select('name, created_at')
    .eq('user_id', user.id)
    .in('name', ['subscription_activated', 'subscription_canceled', 'checkout_abandoned'])
    .order('created_at', { ascending: false })
    .limit(1)
  const latest = data?.[0] || null
  return new Response(JSON.stringify({ ok: true, latest }), { status: 200, headers: { 'content-type': 'application/json' } })
}

import 'server-only'
import { createAdminClient } from '@/lib/supabase'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const sb = createAdminClient()
    const { data, error } = await sb
      .from('stripe_events')
      .select('type, created_at')
      .order('created_at', { ascending: false })
      .limit(1)
    if (error) throw error
    return new Response(JSON.stringify({ last: data?.[0] || null }), { status: 200, headers: { 'content-type': 'application/json' } })
  } catch {
    return new Response(JSON.stringify({ last: null }), { status: 200, headers: { 'content-type': 'application/json' } })
  }
}

