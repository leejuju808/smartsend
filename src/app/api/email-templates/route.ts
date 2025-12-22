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

  const { data, error } = await supabase
    .from('email_templates')
    .select('id,name,subject,body_html,is_shared')
    .or(`user_id.eq.${userId},is_shared.eq.true`)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ items: data || [] })
}

export async function POST(req: NextRequest) {
  const { userId, name, subject, body_html, is_shared } = await req.json()
  if (!userId || !name || !subject || !body_html) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })

  const { data, error } = await supabase
    .from('email_templates')
    .insert({ user_id: userId, name, subject, body_html, is_shared: !!is_shared })
    .select('id')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ id: data?.id })
}


