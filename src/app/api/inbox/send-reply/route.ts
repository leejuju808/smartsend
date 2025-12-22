// Proxy route that calls the Edge function for sending replies
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'

export async function POST(req: Request) {
  const supabase = createRouteHandlerClient({ cookies })
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const body = await req.json()
  
  // Validate required fields
  if (!body.mailbox_id || !body.to || !body.body_html || !body.thread_key) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const textDraft: string = typeof body.body_text === 'string' && body.body_text.length > 0
    ? body.body_text
    : (body.body_html as string)
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/p>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .trim()

  try {
    let { data: guardConfig, error: guardError } = await supabase
      .from('nudge_guardrails')
      .select('*')
      .eq('owner_id', user.id)
      .maybeSingle()

    if (guardError && guardError.code !== 'PGRST116') {
      console.error('Guard config lookup failed', guardError)
      return NextResponse.json({ error: 'Guard lookup failed' }, { status: 500 })
    }

    if (!guardConfig) {
      const { data: inserted, error: insertError } = await supabase
        .from('nudge_guardrails')
        .insert([{ owner_id: user.id }])
        .select('*')
        .single()
      if (insertError || !inserted) {
        console.error('Guard config seed failed', insertError)
        return NextResponse.json({ error: 'Guard setup failed' }, { status: 500 })
      }
      guardConfig = inserted
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    if (!supabaseUrl) {
      console.error('Missing NEXT_PUBLIC_SUPABASE_URL for guard enforcement')
      return NextResponse.json({ error: 'Guard endpoint not configured' }, { status: 500 })
    }

    const guardResponse = await fetch(`${supabaseUrl}/functions/v1/nudge-guard`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        owner_id: user.id,
        event_id: body.nudge_event_id ?? null,
        draft: textDraft,
        vars: {
          my_meeting_link: guardConfig.my_meeting_link ?? undefined,
          org_address: guardConfig.org_address ?? undefined,
        },
      }),
    })

    const guardPayload = await guardResponse.json().catch(() => null)

    if (!guardResponse.ok || !guardPayload) {
      const message = guardPayload?.error || 'Guard enforcement failed'
      console.error('Guard enforcement failed', message)
      return NextResponse.json({ error: message }, { status: 500 })
    }

    if (guardPayload.blocked) {
      return NextResponse.json(
        { error: 'Draft blocked by Compliance Guard', guard: guardPayload },
        { status: 422 },
      )
    }

    const sanitizedDraft = typeof guardPayload.draft === 'string' ? guardPayload.draft : textDraft
    body.body_text = sanitizedDraft
    body.body_html = sanitizedDraft.replace(/\n/g, '<br/>')
  } catch (err: any) {
    console.error('Compliance guard enforcement failed', err)
    return NextResponse.json({ error: err?.message || 'Guard enforcement failed' }, { status: 500 })
  }

  // Get the Edge function URL
  const edgeUrl = process.env.SEND_REPLY_URL || `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/send-reply`
  const cronSecret = process.env.CRON_SECRET

  if (!cronSecret) {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
  }

  // Call the Edge function
  try {
    const response = await fetch(edgeUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${cronSecret}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        user_id: body.user_id || user.id,
        mailbox_id: body.mailbox_id,
        thread_key: body.thread_key,
        to: body.to,
        subject: body.subject,
        body_html: body.body_html,
        body_text: body.body_text,
        provider: body.provider || 'gmail',
        provider_thread_id: body.provider_thread_id || null,
        nudge_event_id: body.nudge_event_id || null,
      })
    })

    if (!response.ok) {
      const text = await response.text()
      return NextResponse.json({ error: text || 'Failed to send reply' }, { status: response.status })
    }

    const result = await response.json()
    return NextResponse.json(result)
  } catch (error: any) {
    console.error('Error calling send-reply edge function:', error)
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 })
  }
}
