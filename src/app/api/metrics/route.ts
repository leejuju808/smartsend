import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase'

function getUserId(req: Request) {
  const url = new URL(req.url)
  return url.searchParams.get('userId')
}

export async function GET(req: Request) {
  try {
    const userId = getUserId(req)
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const url = new URL(req.url)
    const sequenceId = url.searchParams.get('sequenceId')

    const admin = createAdminClient()

    if (sequenceId) {
      const { data, error } = await admin.rpc('metrics_for_sequence', { p_owner: userId, p_sequence: sequenceId })
      if (error) return NextResponse.json({ error: String(error?.message || error) }, { status: 500 })
      const row = (data as any)?.[0] || { sent: 0, open: 0, reply: 0 }
      return NextResponse.json({ scope: 'sequence', ...row })
    } else {
      const { data, error } = await admin.rpc('metrics_overall', { p_owner: userId })
      if (error) return NextResponse.json({ error: String(error?.message || error) }, { status: 500 })
      const row = (data as any)?.[0] || { sent: 0, open: 0, reply: 0 }
      return NextResponse.json({ scope: 'overall', ...row })
    }
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Internal error' }, { status: 500 })
  }
}

