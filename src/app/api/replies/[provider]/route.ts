import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { handleInboundReply } from '@/lib/reply_intent'

export const runtime = 'nodejs'

export async function POST(req: Request, { params }: { params: { provider: string } }) {
  try {
    const provider = (params.provider || '').toLowerCase()
    if (provider !== 'mailgun' && provider !== 'sendgrid') {
      return NextResponse.json({ error: 'Unsupported provider' }, { status: 400 })
    }

    // Mailgun: form-encoded; SendGrid: JSON (or form if Inbound Parse => usually multipart/form-data)
    const contentType = req.headers.get('content-type') || ''

    if (provider === 'mailgun') {
      // Mailgun POSTS application/x-www-form-urlencoded or multipart/form-data
      const form = await req.formData()

      // Verify signature (recommended)
      const mgTimestamp = String(form.get('timestamp') || '')
      const mgToken = String(form.get('token') || '')
      const mgSignature = String(form.get('signature') || '')
      const mgApiKey = process.env.MAILGUN_SIGNING_KEY // not your public API key; signing key from security settings

      if (mgApiKey) {
        const hmac = crypto.createHmac('sha256', mgApiKey)
        hmac.update(mgTimestamp + mgToken)
        const digest = hmac.digest('hex')
        if (digest !== mgSignature) {
          return NextResponse.json({ error: 'Invalid Mailgun signature' }, { status: 401 })
        }
      }

      const body_text = String(form.get('body-plain') || '')
      const body_html = String(form.get('body-html') || '')
      const subject = String(form.get('subject') || '')
      const from_email = String((form.get('sender') || form.get('from')) || '').replace(/.*<|>.*/g, '').toLowerCase()
      const to_email = String(form.get('recipient') || '').replace(/.*<|>.*/g, '').toLowerCase()
      const in_reply_to = String(form.get('In-Reply-To') || form.get('In-Reply-To') || '')
      const references = String(form.get('References') || '')
      const message_id = String(form.get('Message-Id') || form.get('Message-Id') || '')

      // You must include profile_id as a custom header in your outbound or set per-route secret mapping.
      const profile_id = String(form.get('X-SS-Profile') || form.get('profile_id') || '')
      if (!profile_id) return NextResponse.json({ error: 'Missing profile_id' }, { status: 400 })

      const res = await handleInboundReply({
        profile_id,
        provider: 'mailgun',
        message_id,
        in_reply_to,
        references,
        from_email,
        to_email,
        subject,
        body_text,
        body_html,
        raw: Object.fromEntries(form.entries())
      })
      return NextResponse.json({ ok: true, ...res })
    }

    // SENDGRID
    // Inbound Parse can be configured as webhook that sends multipart/form-data with fields like:
    // headers, subject, text, html, from, to, etc.
    // We'll accept formData and fallback to JSON.
    if (contentType.includes('multipart/form-data') || contentType.includes('application/x-www-form-urlencoded')) {
      const form = await req.formData()
      const from = String(form.get('from') || '').replace(/.*<|>.*/g, '').toLowerCase()
      const to = String(form.get('to') || '').replace(/.*<|>.*/g, '').toLowerCase()
      const subject = String(form.get('subject') || '')
      const text = String(form.get('text') || '')
      const html = String(form.get('html') || '')
      const headers = String(form.get('headers') || '')
      const in_reply_to = extractHeader(headers, 'in-reply-to')
      const references = extractHeader(headers, 'references')
      const message_id = extractHeader(headers, 'message-id') // often the inbound id; may differ from our sent id

      // Basic Auth guard (recommended)
      const authHeader = req.headers.get('authorization') || ''
      const expectedUser = process.env.SENDGRID_BASIC_USER
      const expectedPass = process.env.SENDGRID_BASIC_PASS
      if (expectedUser && expectedPass) {
        const token = authHeader.replace(/^Basic /i, '')
        const plain = Buffer.from(token, 'base64').toString('utf8')
        const [u, p] = plain.split(':', 2)
        if (u !== expectedUser || p !== expectedPass) {
          return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }
      }

      const profile_id = String(form.get('X-SS-Profile') || form.get('profile_id') || '')
      if (!profile_id) return NextResponse.json({ error: 'Missing profile_id' }, { status: 400 })

      const res = await handleInboundReply({
        profile_id,
        provider: 'sendgrid',
        message_id,
        in_reply_to,
        references,
        from_email: from,
        to_email: to,
        subject,
        body_text: text,
        body_html: html,
        raw: Object.fromEntries(form.entries())
      })
      return NextResponse.json({ ok: true, ...res })
    } else {
      // JSON fallback (if you front this with your own translator)
      const payload = await req.json()
      const profile_id = payload.profile_id
      if (!profile_id) return NextResponse.json({ error: 'Missing profile_id' }, { status: 400 })
      const res = await handleInboundReply({
        profile_id,
        provider: 'sendgrid',
        message_id: payload.message_id,
        in_reply_to: payload.in_reply_to,
        references: payload.references,
        from_email: (payload.from || '').toLowerCase(),
        to_email: (payload.to || '').toLowerCase(),
        subject: payload.subject,
        body_text: payload.text,
        body_html: payload.html,
        raw: payload
      })
      return NextResponse.json({ ok: true, ...res })
    }

  } catch (e: any) {
    console.error(e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

function extractHeader(allHeaders: string, name: string) {
  const re = new RegExp(`^${name}:\\s*(.+)$`, 'im')
  const m = allHeaders?.match(re)
  return m ? m[1].trim() : ''
}
