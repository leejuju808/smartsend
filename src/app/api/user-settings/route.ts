import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const userId = url.searchParams.get('userId')
  if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 })
  const { data } = await supabase
    .from('user_settings')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()
  return NextResponse.json({ item: data || null })
}

export async function POST(req: NextRequest) {
  const { userId, signature_html } = await req.json()
  if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 })
  const { error } = await supabase
    .from('user_settings')
    .upsert({ user_id: userId, signature_html })
    .eq('user_id', userId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}


