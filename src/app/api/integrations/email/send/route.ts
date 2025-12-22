import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { getCurrentCompanyId } from '@/lib/company-helpers'

export async function POST(req: NextRequest) {
  try {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get: (name: string) => cookieStore.get(name)?.value,
          set: () => {},
          remove: () => {},
        },
      }
    )

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const companyId = await getCurrentCompanyId()
    if (!companyId) {
      return NextResponse.json({ error: 'No company found' }, { status: 400 })
    }

    const body = await req.json()
    const { to, subject, html, text, from } = body

    if (!to || !subject || (!html && !text)) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Get active email integration (Gmail, Outlook, or SMTP)
    const { data: emailIntegration, error: integrationError } = await supabase
      .from('integration_accounts')
      .select('*')
      .eq('roofing_company_id', companyId)
      .eq('integration_type', 'gmail')
      .eq('is_active', true)
      .eq('is_default', true)
      .maybeSingle()

    if (integrationError || !emailIntegration) {
      // Try Outlook
      const { data: outlookIntegration } = await supabase
        .from('integration_accounts')
        .select('*')
        .eq('roofing_company_id', companyId)
        .eq('integration_type', 'outlook')
        .eq('is_active', true)
        .eq('is_default', true)
        .maybeSingle()

      if (outlookIntegration) {
        return await sendViaOutlook(outlookIntegration, { to, subject, html, text, from })
      }

      // Try SMTP
      const { data: smtpIntegration } = await supabase
        .from('integration_accounts')
        .select('*')
        .eq('roofing_company_id', companyId)
        .eq('integration_type', 'smtp')
        .eq('is_active', true)
        .maybeSingle()

      if (smtpIntegration) {
        return await sendViaSMTP(smtpIntegration, { to, subject, html, text, from })
      }

      // Fallback to SendGrid if configured
      return await sendViaSendGrid({ to, subject, html, text, from })
    }

    // Send via Gmail
    return await sendViaGmail(emailIntegration, { to, subject, html, text, from })
  } catch (error: any) {
    console.error('Error sending email:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

async function sendViaGmail(integration: any, email: { to: string; subject: string; html?: string; text?: string; from?: string }) {
  // Refresh token if needed
  let accessToken = integration.access_token

  if (integration.expires_at && new Date(integration.expires_at) < new Date()) {
    // Token expired, refresh it
    accessToken = await refreshGmailToken(integration.refresh_token)
  }

  // Build RFC822 message
  const message = buildRFC822Message({
    to: email.to,
    from: email.from || integration.config?.email || 'noreply@smartsend.ai',
    subject: email.subject,
    html: email.html,
    text: email.text,
  })

  // Encode message
  const encodedMessage = Buffer.from(message).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

  // Send via Gmail API
  const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      raw: encodedMessage,
    }),
  })

  if (!res.ok) {
    const error = await res.text()
    throw new Error(`Gmail API error: ${error}`)
  }

  const data = await res.json()
  return NextResponse.json({ success: true, messageId: data.id })
}

async function sendViaOutlook(integration: any, email: { to: string; subject: string; html?: string; text?: string; from?: string }) {
  // Refresh token if needed
  let accessToken = integration.access_token

  if (integration.expires_at && new Date(integration.expires_at) < new Date()) {
    accessToken = await refreshOutlookToken(integration.refresh_token)
  }

  const res = await fetch('https://graph.microsoft.com/v1.0/me/sendMail', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message: {
        subject: email.subject,
        body: {
          contentType: email.html ? 'HTML' : 'Text',
          content: email.html || email.text || '',
        },
        toRecipients: [{ emailAddress: { address: email.to } }],
      },
      saveToSentItems: true,
    }),
  })

  if (!res.ok) {
    const error = await res.text()
    throw new Error(`Outlook API error: ${error}`)
  }

  return NextResponse.json({ success: true })
}

async function sendViaSMTP(integration: any, email: { to: string; subject: string; html?: string; text?: string; from?: string }) {
  const nodemailer = (await import('nodemailer')).default
  const config = integration.config || {}

  const transporter = nodemailer.createTransport({
    host: config.host || process.env.SMTP_HOST,
    port: config.port || Number(process.env.SMTP_PORT || 587),
    secure: config.secure || false,
    auth: {
      user: config.username || integration.api_key || process.env.SMTP_USER,
      pass: config.password || integration.api_secret || process.env.SMTP_PASS,
    },
  })

  const info = await transporter.sendMail({
    from: email.from || config.from_email || integration.config?.email,
    to: email.to,
    subject: email.subject,
    html: email.html,
    text: email.text,
  })

  return NextResponse.json({ success: true, messageId: info.messageId })
}

async function sendViaSendGrid(email: { to: string; subject: string; html?: string; text?: string; from?: string }) {
  const apiKey = process.env.SENDGRID_API_KEY
  if (!apiKey) {
    throw new Error('No email integration configured')
  }

  const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: email.to }] }],
      from: { email: email.from || process.env.SENDGRID_FROM_EMAIL || 'noreply@smartsend.ai' },
      subject: email.subject,
      content: [
        ...(email.html ? [{ type: 'text/html', value: email.html }] : []),
        ...(email.text ? [{ type: 'text/plain', value: email.text }] : []),
      ],
    }),
  })

  if (!res.ok) {
    const error = await res.text()
    throw new Error(`SendGrid error: ${error}`)
  }

  return NextResponse.json({ success: true })
}

function buildRFC822Message(email: { to: string; from: string; subject: string; html?: string; text?: string }): string {
  const lines: string[] = []
  lines.push(`To: ${email.to}`)
  lines.push(`From: ${email.from}`)
  lines.push(`Subject: ${email.subject}`)
  lines.push('MIME-Version: 1.0')

  if (email.html && email.text) {
    const boundary = `----=_Part_${Date.now()}`
    lines.push(`Content-Type: multipart/alternative; boundary="${boundary}"`)
    lines.push('')
    lines.push(`--${boundary}`)
    lines.push('Content-Type: text/plain; charset=UTF-8')
    lines.push('')
    lines.push(email.text)
    lines.push(`--${boundary}`)
    lines.push('Content-Type: text/html; charset=UTF-8')
    lines.push('')
    lines.push(email.html)
    lines.push(`--${boundary}--`)
  } else if (email.html) {
    lines.push('Content-Type: text/html; charset=UTF-8')
    lines.push('')
    lines.push(email.html)
  } else {
    lines.push('Content-Type: text/plain; charset=UTF-8')
    lines.push('')
    lines.push(email.text || '')
  }

  return lines.join('\r\n')
}

async function refreshGmailToken(refreshToken: string): Promise<string> {
  const clientId = process.env.GOOGLE_CLIENT_ID || process.env.GOOGLE_OAUTH_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET || process.env.GOOGLE_OAUTH_CLIENT_SECRET

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('Gmail OAuth not configured')
  }

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  })

  if (!res.ok) {
    throw new Error('Failed to refresh Gmail token')
  }

  const data = await res.json()
  return data.access_token
}

async function refreshOutlookToken(refreshToken: string): Promise<string> {
  const clientId = process.env.MICROSOFT_CLIENT_ID
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('Outlook OAuth not configured')
  }

  const res = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
      scope: 'https://graph.microsoft.com/Mail.Send',
    }),
  })

  if (!res.ok) {
    throw new Error('Failed to refresh Outlook token')
  }

  const data = await res.json()
  return data.access_token
}

























