import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/server/supabase'

export const runtime = 'edge'

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const workspaceId = url.searchParams.get('workspaceId') || undefined
  const status = url.searchParams.get('status') || undefined
  const assignedTo = url.searchParams.get('assignedTo') || undefined

  if (!workspaceId) return NextResponse.json({ error: 'workspaceId required' }, { status: 400 })

  let q = supabaseAdmin
    .from('inbox_threads')
    .select('id, contact_id, subject, last_message_at, status, assigned_to')
    .eq('workspace_id', workspaceId)
    .order('last_message_at', { ascending: false }) as any

  if (status) q = q.eq('status', status)
  if (assignedTo) q = q.eq('assigned_to', assignedTo)

  const { data } = await q
  return NextResponse.json({ threads: data || [] })
}

export async function PATCH(req: NextRequest) {
  const body = await req.json()
  const { threadId, assigned_to, status } = body as { threadId: string; assigned_to?: string | null; status?: 'open' | 'snoozed' | 'closed' }
  if (!threadId) return NextResponse.json({ error: 'threadId required' }, { status: 400 })

  const update: any = {}
  if (assigned_to !== undefined) update.assigned_to = assigned_to
  if (status) update.status = status
  if (!Object.keys(update).length) return NextResponse.json({ error: 'No updates' }, { status: 400 })

  await supabaseAdmin.from('inbox_threads').update(update).eq('id', threadId)
  return NextResponse.json({ ok: true })
}

