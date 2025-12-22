import { NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const supabase = createRouteHandlerClient({ cookies })
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const leadId = params.id

  // Check if lead exists and user has access
  const { data: lead, error: leadError } = await supabase
    .from('leads')
    .select('id, status')
    .eq('id', leadId)
    .single()

  if (leadError || !lead) {
    return NextResponse.json({ error: leadError?.message || 'Lead not found' }, { status: 404 })
  }

  // Mark as replied - this will trigger the database trigger to cancel pending sends
  const { error } = await supabase
    .from('leads')
    .update({ 
      status: 'Replied', 
      replied_at: new Date().toISOString() 
    })
    .eq('id', leadId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, message: 'Sequences paused for this lead' })
}

