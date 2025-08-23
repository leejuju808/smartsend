import 'server-only'
import { createAdminClient } from '@/lib/supabase'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({} as any))
  const email = String(body.email || '')
  if (!email) return new Response('Bad Request', { status: 400 })
  
  const e = String(email).trim().toLowerCase()
  const sb = createAdminClient()
  
  // Add to suppression list (global unsubscribe)
  const { error } = await sb
    .from('suppression_list')
    .upsert({ 
      email: e, 
      reason: 'unsubscribe' 
    }, { 
      onConflict: 'email' 
    })
    
  if (error) return new Response('DB error', { status: 500 })
  return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } })
}

