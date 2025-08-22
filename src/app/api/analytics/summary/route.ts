import 'server-only'
import { createAdminClient, createServerComponentClient } from '@/lib/supabase'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const supa = createServerComponentClient()
  const { data: { user } } = await supa.auth.getUser()
  if (!user) return new Response(JSON.stringify({ sent: 0, opened: 0, replied: 0 }), { status: 200 })
  const admin = createAdminClient()
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const { data } = await admin
    .from('analytics_events')
    .select('name')
    .eq('user_id', user.id)
    .gte('created_at', since)
    .limit(5000)
  let sent = 0, opened = 0, replied = 0
  for (const r of data || []) {
    const n = (r as any).name as string
    if (n === 'email_sent') sent += 1
    if (n === 'email_opened') opened += 1
    if (n === 'email_replied') replied += 1
  }
  return new Response(JSON.stringify({ sent, opened, replied }), { status: 200, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } })
}

import 'server-only'
import { createAdminClient, createServerComponentClient } from '@/lib/supabase'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const supa = createServerComponentClient()
    const { data: { user } } = await supa.auth.getUser()
    if (!user) return new Response(JSON.stringify({ sent: 0, opened: 0, replied: 0 }), { status: 200, headers: { 'content-type': 'application/json' } })
    const sb = createAdminClient()
    const base = sb.from('analytics_events').select('name', { count: 'exact', head: false }).eq('user_id', user.id)
    const [sent, opened, replied] = await Promise.all([
      base.clone().eq('name', 'email_sent'),
      base.clone().eq('name', 'email_opened'),
      base.clone().eq('name', 'email_replied'),
    ])
    return new Response(
      JSON.stringify({ sent: sent.count || 0, opened: opened.count || 0, replied: replied.count || 0 }),
      { status: 200, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } }
    )
  } catch {
    return new Response(JSON.stringify({ sent: 0, opened: 0, replied: 0 }), { status: 200, headers: { 'content-type': 'application/json' } })
  }
}

import { NextResponse } from 'next/server'
import { createServerComponentClient, createAdminClient } from '@/lib/supabase'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const supabase = createServerComponentClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ sent: 0, opened: 0, replied: 0 })

    const admin = createAdminClient()
    const { count: sent } = await admin
      .from('email_sends')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)

    const { count: opened } = await admin
      .from('analytics_events')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('name', 'email_open')

    const { count: replied } = await admin
      .from('analytics_events')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('name', 'email_reply')

    return NextResponse.json({ sent: sent || 0, opened: opened || 0, replied: replied || 0 })
  } catch (error: any) {
    return NextResponse.json({ sent: 0, opened: 0, replied: 0, error: error?.message || 'Internal error' }, { status: 200 })
  }
}

import { NextResponse } from 'next/server'
import { createServerComponentClient } from '@/lib/supabase'
import { cookies } from 'next/headers'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const jar = cookies()
    const supa = createServerComponentClient()
    const { data: { user } } = await supa.auth.getUser()
    const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
    const userId = user?.id
    if (!userId) return NextResponse.json({ sent: 0, opened: 0, replied: 0 })
    const kinds = ['email_sent', 'email_opened', 'email_replied']
    const results = await Promise.all(
      kinds.map((k) => sb.from('analytics_events').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('name', k))
    )
    return NextResponse.json({
      sent: results[0]?.count || 0,
      opened: results[1]?.count || 0,
      replied: results[2]?.count || 0,
    })
  } catch (e: any) {
    return NextResponse.json({ sent: 0, opened: 0, replied: 0 })
  }
}

