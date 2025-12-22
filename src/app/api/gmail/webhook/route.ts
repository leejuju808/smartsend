// /app/api/gmail/webhook/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

type PubSubPushBody = {
  message?: {
    data?: string
    messageId?: string
    publishTime?: string
    attributes?: Record<string, string>
  }
  subscription?: string
}

type GmailHistoryNotification = {
  emailAddress: string
  historyId: string
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const SHARED_SECRET = process.env.GMAIL_WEBHOOK_VERIFICATION!
const REPLY_FN = process.env.REPLY_DETECT_FN_URL!
const DETECT_REPLIES_FN = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/detect-replies`
const DETECT_REPLY_FN = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/detectReply`

function b64json<T = any>(b64?: string): T | null {
  if (!b64) return null
  try {
    const json = Buffer.from(b64, 'base64').toString('utf8')
    return JSON.parse(json)
  } catch {
    return null
  }
}

// Simple base64url → string
function b64urlToStr(b64url: string) {
  const pad = '='.repeat((4 - (b64url.length % 4)) % 4)
  const base64 = (b64url + pad).replace(/-/g, '+').replace(/_/g, '/')
  return Buffer.from(base64, 'base64').toString('utf8')
}

export async function POST(req: NextRequest) {
  // 1) Verify shared secret
  const secret = req.headers.get('x-verification-token')
  if (!secret || secret !== SHARED_SECRET) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY)

  // 2) Parse Pub/Sub envelope
  let body: PubSubPushBody
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: true, note: 'invalid json' })
  }

  const notif = b64json<GmailHistoryNotification>(body.message?.data)
  if (!notif?.emailAddress || !notif?.historyId) {
    return NextResponse.json({ ok: true }) // ack anyway to avoid redelivery storms
  }

  // 3) Find the connected Gmail account
  const { data: acct, error: acctErr } = await supabase
    .from('connected_accounts')
    .select('id,email,access_token,refresh_token,last_history_id')
    .eq('provider', 'gmail')
    .eq('email', notif.emailAddress)
    .maybeSingle()

  if (acctErr || !acct) {
    return NextResponse.json({ error: 'no connected account' }, { status: 200 })
  }

  // Refresh token if needed (basic check - token_expiry)
  let accessToken = acct.access_token
  // Note: In production, check token_expiry and refresh if needed using refresh_token
  // For now, proceed with the stored access_token

  const since = acct.last_history_id
  const historyQ = new URL('https://gmail.googleapis.com/gmail/v1/users/me/history')
  historyQ.searchParams.set('startHistoryId', since || notif.historyId)
  historyQ.searchParams.set('historyTypes', 'messageAdded')
  historyQ.searchParams.set('maxResults', '50')

  // 4) Get history delta (added messages)
  const histRes = await fetch(historyQ.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  if (!histRes.ok) {
    // token may be expired; in production refresh with refresh_token here
    const t = await histRes.text()
    console.error(`Gmail history list failed: ${t}`)
    return NextResponse.json({ error: `history list failed: ${t}` }, { status: 200 })
  }

  const histJson = await histRes.json()
  const histories: Array<any> = histJson.history ?? []
  const addedIds = histories.flatMap((h: any) =>
    (h.messagesAdded ?? []).map((m: any) => m.message?.id).filter(Boolean)
  )

    // 5) Fetch and persist each new message
  for (const msgId of addedIds) {
    // Fetch message with snippet for AI classification
    const msgRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msgId}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Message-ID&metadataHeaders=References&metadataHeaders=In-Reply-To`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    )
    if (!msgRes.ok) continue
    const msg = await msgRes.json()
    const snippet = msg.snippet || ''

    // Basic fields
    const headers = (msg.payload?.headers ?? []) as Array<{ name: string; value: string }>
    const H = (n: string) => headers.find(h => h.name.toLowerCase() === n.toLowerCase())?.value ?? ''
    const subject = H('Subject')
    const from = H('From')
    const to = H('To')
    const messageId = H('Message-ID')
    const refs = `${H('References')} ${H('In-Reply-To')}`.trim()
    const internalDate = msg.internalDate ? new Date(Number(msg.internalDate)).toISOString() : new Date().toISOString()

    // Extract email addresses from headers (remove angle brackets)
    const extractEmail = (header: string): string | null => {
      if (!header) return null
      const match = header.match(/<([^>]+)>/)
      return match ? match[1] : header.trim()
    }
    const fromEmail = extractEmail(from)
    const toEmail = extractEmail(to)

    // Try to map to a thread (campaign_logs row) via known email_id or references
    // Strategy: if campaign_logs.email_id equals any Reference or Message-ID you've sent, link to that thread.
    let threadId: string | null = null
    let matchedCampaignId: string | null = null
    let matchedLeadId: string | null = null

    // Try matching by references/Message-ID first
    if (refs || messageId) {
      const refIds = refs.split(/\s+/).filter(Boolean).concat(messageId ? [messageId] : [])
      if (refIds.length > 0) {
        // Match any of the reference IDs or Message-ID against campaign_logs.email_id
        const { data: threads } = await supabase
          .from('campaign_logs')
          .select('id,campaign_id,email_id,from_email,to_email,lead_id')
          .in('email_id', refIds)
          .order('last_message_at', { ascending: false })
          .limit(1)

        if (threads && threads.length > 0) {
          threadId = threads[0].id
          matchedCampaignId = threads[0].campaign_id
          matchedLeadId = threads[0].lead_id || null
        }
      }
    }

    // Fallback: match by from_email/to_email pair
    if (!threadId && fromEmail && toEmail) {
      const { data: thread } = await supabase
        .from('campaign_logs')
        .select('id,campaign_id,from_email,to_email,lead_id')
        .eq('from_email', fromEmail)
        .eq('to_email', toEmail)
        .order('last_message_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (thread) {
        threadId = thread.id
        matchedCampaignId = thread.campaign_id
        matchedLeadId = thread.lead_id || null
      }
    }

    // If still no lead_id, try to find it by email address
    if (!matchedLeadId && fromEmail) {
      const { data: lead } = await supabase
        .from('leads')
        .select('id')
        .eq('email', fromEmail.toLowerCase())
        .maybeSingle()

      if (lead) {
        matchedLeadId = lead.id
      }
    }

    // Insert message
    // Map thread_id: if we found a campaign_logs match, use that id; otherwise null
    const { error: msgErr } = await supabase.from('messages').insert({
      thread_id: threadId, // can be null; you might backfill later
      direction: 'incoming', // or 'in' depending on schema - both supported
      subject,
      body_text: undefined, // you can fetch full payload with format=full if you want text/html now
      from_email: fromEmail || from || '',
      to_email: toEmail || to || '',
      external_id: msg.id,
      sent_at: internalDate,
    })

    if (msgErr) {
      console.error('Failed to insert message:', msgErr)
    }

    // Call detectReply function for simple reply detection
    // This processes all incoming messages, not just matched threads
    if (fromEmail && snippet) {
      try {
        await fetch(DETECT_REPLY_FN, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${SERVICE_KEY}`
          },
          body: JSON.stringify({
            email_id: msgId,
            sender: from || fromEmail,
            subject: subject || '',
            snippet: snippet || '',
          }),
        }).catch((err) => {
          console.error('Failed to trigger detectReply:', err)
        })
      } catch (err) {
        console.error('Error calling detectReply:', err)
      }
    }

    // Touch the thread if we matched one
    if (threadId) {
      await supabase
        .from('campaign_logs')
        .update({ last_message_at: internalDate })
        .eq('id', threadId)

      // 6) Trigger AI Reply Detection via detect-replies Edge Function
      if (matchedLeadId || matchedCampaignId) {
        try {
          await fetch(DETECT_REPLIES_FN, {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${SERVICE_KEY}`
            },
            body: JSON.stringify({
              from_email: fromEmail || from || '',
              subject,
              snippet: snippet || '(no content)',
              message_id: messageId || msg.id,
              campaign_id: matchedCampaignId || null,
              lead_id: matchedLeadId || null,
            }),
          }).catch((err) => {
            console.error('Failed to trigger detect-replies:', err)
          })
        } catch (err) {
          console.error('Failed to trigger reply detection:', err)
        }
      }

      // Also call legacy REPLY_FN if configured
      if (REPLY_FN) {
        try {
          await fetch(REPLY_FN, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email_id: messageId || msg.id,
              subject,
              body: snippet || '(fetched via Gmail)',
              campaign_id: matchedCampaignId || threadId,
            }),
          }).catch(() => {
            // Ignore errors from legacy function
          })
        } catch (err) {
          // Ignore errors from legacy function
        }
      }
    }
  }

  // 7) Save the new last_history_id (advance the cursor)
  if (histJson.historyId) {
    await supabase
      .from('connected_accounts')
      .update({ last_history_id: String(histJson.historyId), updated_at: new Date().toISOString() })
      .eq('id', acct.id)
  }

  return NextResponse.json({ ok: true })
}

