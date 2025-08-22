import 'server-only'
import { createClient } from '@supabase/supabase-js'
import { createServerComponentClient } from '@/lib/supabase'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  const name = String(body?.name || '')
  const context = (body?.context && typeof body.context === 'object') ? body.context : {}
  if (!name) return new Response('bad', { status: 400 })
  const supa = createServerComponentClient()
  const { data: { user } } = await supa.auth.getUser()
  const sb = admin()
  await sb.from('analytics_events').insert({
    name,
    user_id: user?.id ?? null,
    context,
  } as any)
  return new Response('OK', { status: 200 })
}
