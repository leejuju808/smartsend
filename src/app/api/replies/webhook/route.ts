import { NextResponse } from 'next/server'
import { handleInboundReply } from '@/lib/reply_intent'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  try {
    const payload = await req.json()
    const { profile_id, from_email, to_email } = payload || {}
    if (!profile_id || !from_email || !to_email) {
      return NextResponse.json({ error: 'Missing profile_id, from_email or to_email' }, { status: 400 })
    }

    const res = await handleInboundReply({
      profile_id,
      provider: 'mailgun', // generic path used earlier; now unified by provider routes but keep backward compat
      from_email,
      to_email,
      subject: payload.subject,
      body_text: payload.body_text,
      body_html: payload.body_html,
      message_id: payload.message_id,
      in_reply_to: payload.in_reply_to,
      references: payload.references,
      received_at: payload.received_at,
      raw: payload
    })

    return NextResponse.json({ ok: true, ...res })
  } catch (e: any) {
    console.error(e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
