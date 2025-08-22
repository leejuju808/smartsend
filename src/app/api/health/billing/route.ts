import { supabaseAdmin } from '@/server/supabase'

export async function GET() {
  try {
    const { error } = await supabaseAdmin.rpc('now')
    return new Response(JSON.stringify({ ok: !error }), { headers: { 'content-type': 'application/json' } })
  } catch {
    return new Response(JSON.stringify({ ok: false }), { headers: { 'content-type': 'application/json' }, status: 500 })
  }
}

