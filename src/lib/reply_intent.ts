import { randomUUID } from 'crypto'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { buildICS } from '@/lib/ics'
import { sendMail } from '@/lib/mailer'

export type NormalizedInbound = {
  profile_id: string
  provider: 'mailgun' | 'sendgrid'
  message_id?: string | null
  in_reply_to?: string | null
  references?: string | null
  from_email: string
  to_email: string
  subject?: string | null
  body_text?: string | null
  body_html?: string | null
  received_at?: string | null
  raw?: any
}

export function classifyIntent(text: string | null | undefined): 'positive'|'neutral'|'negative' {
  const t = (text || '').toLowerCase()
  if (!t) return 'neutral'
  const positives = ['yes', 'schedule', 'book', 'let's talk', "let's talk", 'call', 'meeting', 'chat', 'available', 'sounds good', 'interested', 'works', 'time']
  const negatives = ['no', 'unsubscribe', 'stop', 'not interested', 'remove', 'opt out', 'later', 'busy', 'do not contact']
  if (positives.some(p => t.includes(p))) return 'positive'
  if (negatives.some(n => t.includes(n))) return 'negative'
  return 'neutral'
}

function nextBusinessDayAtPT(hourLocal = 10) {
  // MVP: PT 10:00 tomorrow (we kept this simple in earlier slice)
  const now = new Date()
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 17, 0, 0)) // ~10:00 PT
  d.setUTCDate(d.getUTCDate() + 1)
  return d
}

export async function handleInboundReply(inb: NormalizedInbound) {
  const {
    profile_id, from_email, to_email, subject, body_text, provider, message_id, in_reply_to, references, raw
  } = inb

  // 1) Persist inbound log
  const { data: inboundRow, error: inErr } = await supabaseAdmin
    .from('inbound_emails')
    .insert({
      profile_id,
      provider,
      message_id: message_id ?? null,
      in_reply_to: in_reply_to ?? null,
      references_hdr: references ?? null,
      from_email: from_email.toLowerCase(),
      to_email: to_email.toLowerCase(),
      subject: subject ?? null,
      body_text: body_text ?? null,
      body_html: inb.body_html ?? null,
      raw: raw ? sanitizeRaw(raw) : null
    })
    .select('id')
    .single()
  if (inErr) throw inErr
  const inbound_id = inboundRow.id

  // 2) Try to match the message via provider_message_id or headers
  let msgId: string | null = null

  if (in_reply_to || references) {
    // provider_message_id may be embedded in these headers
    const candidate = (in_reply_to || references || '').trim()
    if (candidate) {
      const { data: m1 } = await supabaseAdmin
        .from('messages')
        .select('id')
        .eq('profile_id', profile_id)
        .or(`provider_message_id.eq.${escapeDot(candidate)},provider_message_id.ilike.%${escapeLike(candidate)}%`)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (m1) msgId = m1.id
    }
  }

  if (!msgId && message_id) {
    // Some providers echo back the original message-id in various ways
    const { data: m2 } = await supabaseAdmin
      .from('messages')
      .select('id')
      .eq('profile_id', profile_id)
      .eq('provider_message_id', message_id)
      .maybeSingle()
    if (m2) msgId = m2.id
  }

  if (!msgId) {
    // Fallback: last message we sent to this email
    const { data: m3 } = await supabaseAdmin
      .from('messages')
      .select('id')
      .eq('profile_id', profile_id)
      .eq('to_email', from_email.toLowerCase())
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (m3) msgId = m3.id
  }

  // 3) Classify
  const intent = classifyIntent(body_text)

  if (msgId) {
    await supabaseAdmin.from('messages')
      .update({ replied_at: new Date().toISOString(), reply_intent: intent, inbound_id })
      .eq('id', msgId)
      .eq('profile_id', profile_id)
  }

  // 4) If positive → create meeting + email Calendly + ICS (reuse profile settings)
  if (intent === 'positive') {
    const [{ data: profile }, { data: sender }] = await Promise.all([
      supabaseAdmin.from('profiles').select('id, calendly_url, timezone').eq('id', profile_id).maybeSingle(),
      msgId
        ? supabaseAdmin.from('messages').select('sender_id').eq('id', msgId).maybeSingle()
        : Promise.resolve({ data: null as any })
    ])
    if (!profile) throw new Error('Profile not found')

    const organizerSender = sender?.sender_id
      ? await supabaseAdmin.from('senders').select('from_email').eq('id', sender.sender_id).maybeSingle()
      : null

    const start = nextBusinessDayAtPT(10)
    const end = new Date(start.getTime() + 30 * 60 * 1000)
    const { data: meeting, error: mErr } = await supabaseAdmin.from('meetings')
      .insert({
        profile_id,
        campaign_id: null,
        message_id: msgId,
        attendee_email: from_email.toLowerCase(),
        status: 'scheduled',
        scheduled_at: start.toISOString(),
        source: 'reply_intent'
      })
      .select('id')
      .single()
    if (mErr) throw mErr

    if (msgId) {
      await supabaseAdmin.from('messages').update({ meeting_id: meeting.id }).eq('id', msgId).eq('profile_id', profile_id)
    }

    const ics = buildICS({
      uid: randomUUID(),
      title: 'Intro Call — SmartSend',
      description: 'Here is a tentative 30-min hold. If the time doesn't work, use the link below.',
      start, end,
      organizerEmail: (organizerSender?.data?.from_email || inb.to_email).toLowerCase(),
      organizerName: 'SmartSend',
      attendeeEmail: from_email.toLowerCase(),
      location: profile.calendly_url ? 'Calendly' : 'Google Meet / Zoom (to be sent)'
    })

    const calendlyBlock = profile.calendly_url
      ? `<p>Prefer another time? Book here: <a href="${profile.calendly_url}" target="_blank" rel="noopener">Choose a time</a></p>`
      : `<p>Reply with a better time and we'll send a calendar invite.</p>`

    const html = `
      <div style="font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial;">
        <p>Awesome — let's chat.</p>
        ${calendlyBlock}
        <p>Temporary hold: <b>${start.toUTCString()}</b> (30 min). The invite is attached — accept or propose another time.</p>
        <p>Talk soon,</p>
        <p>SmartSend</p>
      </div>
    `
    const text = `Let's chat.\nTemporary hold: ${start.toUTCString()} (30 min)\n${profile.calendly_url ? `Book: ${profile.calendly_url}\n` : ''}`

    await sendMail({
      to: from_email.toLowerCase(),
      from: (organizerSender?.data?.from_email || inb.to_email).toLowerCase(),
      subject: 'Let's talk — calendar invite attached',
      html,
      text,
      attachments: [{ filename: 'meeting.ics', content: ics, contentType: 'text/calendar; charset=utf-8' }]
    })

    await supabaseAdmin.from('inbound_emails').update({ handled: true, handler_note: `positive → meeting ${meeting.id}` }).eq('id', inbound_id)
    return { intent, meeting_id: meeting.id, inbound_id, matched_message_id: msgId }
  }

  await supabaseAdmin.from('inbound_emails').update({ handled: true, handler_note: intent }).eq('id', inbound_id)
  return { intent, inbound_id, matched_message_id: msgId }
}

function sanitizeRaw(raw: any) {
  try {
    // Avoid storing huge blobs like attachments; keep headers, envelope, minimal fields
    const clone = JSON.parse(JSON.stringify(raw))
    if (clone?.attachments) delete clone.attachments
    if (clone?.content) delete clone.content
    return clone
  } catch {
    return null
  }
}

function escapeLike(s: string) { return s.replace(/%/g, '\\%').replace(/_/g, '\\_') }
function escapeDot(s: string) { return s.replace(/\./g, '\\.') }
