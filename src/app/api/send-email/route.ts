import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function base64UrlEncode(str: string) {
  return Buffer.from(str, "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "")
}

async function sendViaGmail(accessToken: string, raw: string) {
  const r = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ raw: base64UrlEncode(raw) }),
  })
  if (!r.ok) {
    const text = await r.text()
    throw new Error(`Gmail send failed: ${r.status} ${text}`)
  }
  return await r.json()
}

async function sendViaOutlook(accessToken: string, from: string, to: string, subject: string, html: string) {
  const r = await fetch("https://graph.microsoft.com/v1.0/me/sendMail", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message: {
        subject,
        body: { contentType: "HTML", content: html },
        toRecipients: [{ emailAddress: { address: to } }],
        from: { emailAddress: { address: from } },
      },
      saveToSentItems: true,
    }),
  })
  if (!r.ok) {
    const text = await r.text()
    throw new Error(`Outlook send failed: ${r.status} ${text}`)
  }
}

export async function POST(req: NextRequest) {
  // Check authorization
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { mailboxId, leadId, campaignId, step } = await req.json()

  if (!mailboxId || !leadId || !campaignId) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  try {
    // Load lead email
    const { data: lead } = await supabase
      .from('leads')
      .select('id,email')
      .eq('id', leadId)
      .single()

    if (!lead) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
    }

    // Load campaign
    const { data: campaign } = await supabase
      .from('campaigns')
      .select('id,sequence_id,subject_template,body_template')
      .eq('id', campaignId)
      .single()

    if (!campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
    }

    // Load mailbox with credentials
    const { data: mailbox } = await supabase
      .from('connected_accounts')
      .select('id,provider,provider_email,access_token,refresh_token,token_expires_at')
      .eq('id', mailboxId)
      .single()

    if (!mailbox) {
      return NextResponse.json({ error: 'Mailbox not found' }, { status: 404 })
    }

    // Get subject and body from sequence or campaign template
    let subject = campaign.subject_template || 'Hello'
    let body = campaign.body_template || ''

    if (campaign.sequence_id && step) {
      const { data: stepData } = await supabase
        .from('sequence_steps')
        .select('subject,body_md')
        .eq('sequence_id', campaign.sequence_id)
        .eq('step_no', step)
        .single()

      if (stepData) {
        subject = stepData.subject || subject
        body = stepData.body_md || body
      }
    }

    // Refresh token if needed (simplified - check expires_at)
    let accessToken = mailbox.access_token
    if (mailbox.token_expires_at && new Date(mailbox.token_expires_at) < new Date()) {
      // Token expired, refresh it
      if (mailbox.provider === 'gmail' && mailbox.refresh_token) {
        const refreshRes = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id: process.env.GOOGLE_OAUTH_CLIENT_ID!,
            client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET!,
            grant_type: 'refresh_token',
            refresh_token: mailbox.refresh_token,
          }),
        })
        const refreshData = await refreshRes.json()
        if (refreshData.access_token) {
          accessToken = refreshData.access_token
          await supabase.from('connected_accounts').update({
            access_token: accessToken,
            token_expires_at: new Date(Date.now() + (refreshData.expires_in || 3600) * 1000).toISOString(),
          }).eq('id', mailboxId)
        }
      } else if (mailbox.provider === 'outlook' && mailbox.refresh_token) {
        const refreshRes = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id: process.env.MS_CLIENT_ID!,
            client_secret: process.env.MS_CLIENT_SECRET!,
            grant_type: 'refresh_token',
            refresh_token: mailbox.refresh_token,
            scope: 'https://graph.microsoft.com/.default offline_access',
          }),
        })
        const refreshData = await refreshRes.json()
        if (refreshData.access_token) {
          accessToken = refreshData.access_token
          await supabase.from('connected_accounts').update({
            access_token: accessToken,
            token_expires_at: new Date(Date.now() + (refreshData.expires_in || 3600) * 1000).toISOString(),
          }).eq('id', mailboxId)
        }
      }
    }

    // Send email via provider
    if (mailbox.provider === 'gmail') {
      const raw = `From: ${mailbox.provider_email}\r\nTo: ${lead.email}\r\nSubject: ${subject}\r\nContent-Type: text/html; charset="UTF-8"\r\n\r\n${body}`
      await sendViaGmail(accessToken!, raw)
    } else if (mailbox.provider === 'outlook') {
      await sendViaOutlook(accessToken!, mailbox.provider_email, lead.email, subject, body)
    } else {
      return NextResponse.json({ error: 'Unsupported provider' }, { status: 400 })
    }

    return NextResponse.json({ ok: true })
  } catch (error: any) {
    console.error('Send email error:', error)
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 })
  }
}

