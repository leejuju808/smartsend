import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/server/supabase'

export const runtime = 'edge'

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const id = url.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const { data: thread } = await supabaseAdmin
    .from('inbox_threads')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  const { data: messages } = await supabaseAdmin
    .from('inbox_messages')
    .select('*')
    .eq('thread_id', id)
    .order('sent_at', { ascending: true })

  return NextResponse.json({ thread, messages: messages || [] })
}

