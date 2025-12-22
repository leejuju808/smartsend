// app/api/inbox/threads/[key]/actions/route.ts  (assign/archive/snooze/mark-read)
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'

export async function POST(req: Request, { params }: { params: { key: string } }) {
  const supabase = createRouteHandlerClient({ cookies })
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const body = await req.json() as { action: 'assign'|'archive'|'snooze'|'mark_read', assigneeId?: string }

  // Verify user can access this thread (check via RLS)
  const { data: thread, error: checkError } = await supabase
    .from('inbox_threads')
    .select('campaign_id, user_id')
    .eq('thread_key', params.key)
    .single()

  if (checkError || !thread) {
    return NextResponse.json({ error: 'Thread not found or unauthorized' }, { status: 404 })
  }

  // Use service role client for updates (since RLS blocks direct updates from authenticated users)
  const { createClient } = await import('@supabase/supabase-js')
  const serviceSupabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )

  if (body.action === 'assign') {
    const { error } = await serviceSupabase
      .from('inbox_threads')
      .update({ assignee_id: body.assigneeId ?? null, updated_at: new Date().toISOString() })
      .eq('thread_key', params.key)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  }

  if (body.action === 'archive') {
    const { error } = await serviceSupabase
      .from('inbox_threads')
      .update({ status: 'archived', updated_at: new Date().toISOString() })
      .eq('thread_key', params.key)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  }

  if (body.action === 'snooze') {
    const { error } = await serviceSupabase
      .from('inbox_threads')
      .update({ status: 'snoozed', updated_at: new Date().toISOString() })
      .eq('thread_key', params.key)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  }

  if (body.action === 'mark_read') {
    const { error } = await supabase.rpc('incr_thread_unread', { p_key: params.key, p_delta: -9999 })
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({ ok: true })
}

