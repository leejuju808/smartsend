import 'server-only'
import { createAdminClient, createServerComponentClient } from '@/lib/supabase'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const u = createServerComponentClient()
  const {
    data: { user },
  } = await u.auth.getUser()
  if (!user) return new Response('Not authenticated', { status: 401 })
  const url = new URL(req.url)
  const range = (url.searchParams.get('range') || '7d').toLowerCase()
  const days = range === 'today' ? 1 : range === '30d' ? 30 : 7
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
  const sb = createAdminClient()
  const { data } = await sb
    .from('usage_events')
    .select('created_at, kind, qty')
    .eq('user_id', user.id)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(20000)
  const lines = ['created_at,kind,qty', ...(data || []).map((r: any) => `${r.created_at},${r.kind},${r.qty}`)]
  const csv = lines.join('\n')
  const fname = `usage_${range}_${new Date().toISOString().slice(0,10)}.csv`
  return new Response(csv, {
    status: 200,
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${fname}"`,
      'cache-control': 'no-store',
    },
  })
}

