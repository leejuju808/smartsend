// app/api/campaigns/[id]/preflight/fix/route.ts
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'

export async function POST(req: Request, { params }:{ params:{ id: string }}) {
  const supabase = createRouteHandlerClient({ cookies })
  const { data: c } = await supabase.from('campaigns').select('id,user_id').eq('id', params.id).single()
  if (!c) return NextResponse.json({ error:'not_found' }, { status:404 })
  const { data: me } = await supabase.auth.getUser()
  if (!me?.user || me.user.id !== c.user_id) return NextResponse.json({ error:'forbidden' }, { status:403 })

  const { action, payload } = await req.json() as { action: string, payload?: any }

  switch(action){
    case 'start_warmup': {
      const { error } = await supabase.from('connected_accounts')
        .update({ warmup_started_at: new Date().toISOString().slice(0,10) })
        .eq('id', payload.mailboxId).eq('user_id', c.user_id)
      if (error) return NextResponse.json({ error: error.message }, { status:400 })
      return NextResponse.json({ ok: true })
    }

    case 'edit_daily_cap': {
      const { error } = await supabase.from('connected_accounts')
        .update({ daily_cap: payload.value }).eq('id', payload.mailboxId).eq('user_id', c.user_id)
      if (error) return NextResponse.json({ error: error.message }, { status:400 })
      return NextResponse.json({ ok: true })
    }

    case 'send_test': {
      // Call your sender → stamp last_test_send_at on success
      const resp = await fetch(process.env.SEND_TEST_URL!, {
        method:'POST',
        headers:{ 'Authorization': `Bearer ${process.env.CRON_SECRET!}`, 'Content-Type':'application/json' },
        body: JSON.stringify({ mailboxId: payload.mailboxId, userId: c.user_id })
      })
      if (!resp.ok) return NextResponse.json({ error:'send_failed' }, { status:502 })
      await supabase.from('connected_accounts')
        .update({ last_test_send_at: new Date().toISOString() })
        .eq('id', payload.mailboxId).eq('user_id', c.user_id)
      return NextResponse.json({ ok: true })
    }
  }

  return NextResponse.json({ error: 'unknown_action' }, { status: 400 })
}

