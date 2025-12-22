import { NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'

type Body = {
  thread_ids: string[]
  status: 'open'|'replied'|'archived'|'snoozed'
  snooze_until?: string | null
}

export async function POST(req: Request) {
  const { thread_ids, status, snooze_until }: Body = await req.json()
  const supabase = createRouteHandlerClient({ cookies })

  const { data, error } = await supabase.rpc('bulk_update_thread_status', {
    p_threads: thread_ids,
    p_status: status,
    p_snooze_until: snooze_until ?? null
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ updated: data ?? 0 })
}

