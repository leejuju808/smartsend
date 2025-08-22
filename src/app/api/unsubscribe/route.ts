import 'server-only'
import { createAdminClient } from '@/lib/supabase'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({} as any))
  const email = String(body.email || '')
  const ownerEmail = String(body.ownerEmail || '')
  if (!email) return new Response('Bad Request', { status: 400 })
  const sb = createAdminClient()
  const q = sb.from('leads').update({ unsubscribed: true }).eq('email', email)
  if (ownerEmail) q.eq('owner_email', ownerEmail)
  const { error } = await q
  if (error) return new Response('DB error', { status: 500 })
  return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } })
}

