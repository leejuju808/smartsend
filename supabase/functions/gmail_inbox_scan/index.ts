import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// TODO: replace with your Gmail client wrapper; for MVP we assume you have
// an access token per user stored in `connected_accounts` table.
type GmailMessage = {
  id: string
  threadId: string
  snippet?: string
  internalDate?: string
  payload?: { headers?: { name: string; value: string }[] }
}

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

// Helper: minimal Gmail REST fetch
async function gmailListMessages(accessToken: string, q: string): Promise<GmailMessage[]> {
  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(q)}&maxResults=50`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  })
  if (!res.ok) {
    console.error(`Gmail API error: ${res.status} ${await res.text()}`)
    return []
  }
  const json = await res.json()
  const ids: string[] = (json.messages || []).map((m: any) => m.id)
  const results: GmailMessage[] = []
  for (const id of ids) {
    const m = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=To&metadataHeaders=Message-Id&metadataHeaders=Date`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    })
    if (m.ok) results.push(await m.json())
  }
  return results
}

function header(hs: any[] | undefined, name: string) {
  return hs?.find(h => h.name?.toLowerCase() === name.toLowerCase())?.value ?? ''
}

Deno.serve(async (_req) => {
  try {
    // 1) Get all users with connected Gmail
    const { data: accounts, error: accErr } = await supabase
      .from('connected_accounts')
      .select('user_id, provider, access_token, email, expires_at, refresh_token')
      .eq('provider', 'gmail')
      .not('access_token', 'is', null)

    if (accErr) {
      console.error('Error fetching connected accounts:', accErr)
      return new Response(JSON.stringify({ error: accErr.message }), { status: 500 })
    }

    if (!accounts || accounts.length === 0) {
      return new Response(JSON.stringify({ ok: true, scanned: 0, message: 'No connected Gmail accounts' }), { 
        headers: { 'Content-Type': 'application/json' } 
      })
    }

    const sinceMins = Number(Deno.env.get('INBOX_SCAN_WINDOW_MIN') || '15')
    const since = new Date(Date.now() - sinceMins * 60 * 1000)
    const q = `newer_than:${sinceMins}m -in:sent` // replies to us (not our sent)

    let totalScanned = 0
    let totalMarked = 0

    for (const acc of accounts) {
      try {
        // Check if token needs refresh
        let accessToken = acc.access_token
        if (acc.expires_at && new Date(acc.expires_at) < new Date()) {
          // Token expired, try to refresh if we have refresh_token
          if (acc.refresh_token) {
            // TODO: Implement token refresh logic here if needed
            // For MVP, skip expired tokens and log
            console.warn(`Token expired for account ${acc.email}, skipping`)
            continue
          }
        }

        const messages = await gmailListMessages(accessToken, q)
        totalScanned += messages.length

        for (const m of messages) {
          const fromRaw = header(m.payload?.headers, 'From') // "Name <email@x.com>"
          const subj = header(m.payload?.headers, 'Subject')
          const dateStr = header(m.payload?.headers, 'Date')
          const receivedAt = dateStr ? new Date(dateStr) : new Date()
          const fromEmail = (fromRaw.match(/<(.+?)>/)?.[1] || fromRaw).toLowerCase().trim()

          if (!fromEmail || !fromEmail.includes('@')) continue

          // 2) Try to match to a lead for this user
          const { data: leadRow } = await supabase
            .from('leads')
            .select('id, email')
            .eq('user_id', acc.user_id)
            .eq('email', fromEmail)
            .maybeSingle()

          if (!leadRow) continue

          // 3) Find active campaign_leads (could be multiple; mark all)
          const { data: clRows } = await supabase
            .from('campaign_leads')
            .select('campaign_id, lead_id, replied_at')
            .eq('lead_id', leadRow.id)
            .is('replied_at', null)

          if (!clRows?.length) continue

          // 4) Insert inbox row + mark replied
          for (const cl of clRows) {
            await supabase.from('replies_inbox').insert({
              user_id: acc.user_id,
              campaign_id: cl.campaign_id,
              lead_id: cl.lead_id,
              provider_email: acc.email,
              thread_id: m.threadId,
              message_id: m.id,
              from_email: fromEmail,
              subject: subj,
              snippet: m.snippet,
              received_at: receivedAt.toISOString()
            })

            await supabase.from('campaign_leads')
              .update({
                replied_at: receivedAt.toISOString(),
                last_reply_snippet: m.snippet?.slice(0, 300) ?? null,
                thread_id: m.threadId,
                provider_email: acc.email
              })
              .eq('campaign_id', cl.campaign_id)
              .eq('lead_id', cl.lead_id)

            // 5) Optional: bulk-cancel any pending queue items for this pair
            await supabase.from('send_queue')
              .update({ status: 'cancelled' })
              .eq('campaign_id', cl.campaign_id)
              .eq('lead_id', cl.lead_id)
              .eq('status', 'pending')

            totalMarked++
          }
        }
      } catch (err) {
        console.error(`Error processing account ${acc.email}:`, err)
        // Continue with next account
      }
    }

    return new Response(
      JSON.stringify({ 
        ok: true, 
        scanned: totalScanned,
        marked: totalMarked,
        accounts_processed: accounts.length 
      }), 
      { headers: { 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('Fatal error in gmail_inbox_scan:', err)
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }), 
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
})

