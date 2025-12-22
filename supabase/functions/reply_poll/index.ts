// deno-lint-ignore-file no-explicit-any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

type Acct = { id: string; provider: 'gmail'|'outlook'; email_address: string }

Deno.serve(async () => {
  // 1) get accounts that have ever sent mail
  const { data: accts } = await sb
    .from('connected_accounts')
    .select('id, provider, email_address')
  if (!accts?.length) return new Response('no accounts')

  for (const a of accts as Acct[]) {
    try {
      const windowStart = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // last 30d
      if (a.provider === 'gmail') {
        await pollGmail(a, windowStart)
      } else if (a.provider === 'outlook') {
        await pollOutlook(a, windowStart)
      }
      await sb.from('account_mail_sync').upsert({
        account_id: a.id, provider: a.provider, last_checked_at: new Date().toISOString()
      })
    } catch (e) {
      console.error(`Error polling ${a.id}:`, e)
      // swallow; we'll try next run
    }
  }
  return new Response('ok')
})

async function getCred(account_id: string) {
  const { data } = await sb.from('account_credentials').select('*').eq('account_id', account_id).single()
  return data
}

async function refreshIfNeeded(provider: 'gmail'|'outlook', cred: any) {
  const exp = cred?.expires_at ? new Date(cred.expires_at).getTime() : 0
  if (exp && exp - Date.now() > 60_000) return cred.access_token as string
  const body = new URLSearchParams({
    client_id: Deno.env.get(provider === 'gmail' ? 'GOOGLE_CLIENT_ID' : 'MS_CLIENT_ID')!,
    client_secret: Deno.env.get(provider === 'gmail' ? 'GOOGLE_CLIENT_SECRET' : 'MS_CLIENT_SECRET')!,
    grant_type: 'refresh_token',
    refresh_token: cred.refresh_token!
  })
  const url = provider === 'gmail'
    ? 'https://oauth2.googleapis.com/token'
    : `https://login.microsoftonline.com/${cred.tenant_id || 'common'}/oauth2/v2.0/token`
  const r = await fetch(url, { method: 'POST', body })
  const j = await r.json()
  if (!r.ok) throw new Error(`refresh failed: ${JSON.stringify(j)}`)
  await sb.from('account_credentials').update({
    access_token: j.access_token,
    expires_at: new Date(Date.now() + (j.expires_in - 60) * 1000).toISOString(),
    refresh_token: j.refresh_token ?? cred.refresh_token
  }).eq('account_id', cred.account_id)
  return j.access_token as string
}

/** ---------- GMAIL ---------- **/
async function pollGmail(a: Acct, since: Date) {
  const cred = await getCred(a.id)
  if (!cred) {
    console.log(`No credentials for account ${a.id}`)
    return
  }
  const access = await refreshIfNeeded('gmail', cred)
  // heuristic query: replies to us from leads in the last 30d
  const q = `in:inbox newer_than:30d -category:promotions -category:social`
  let pageToken: string | undefined
  const got: string[] = []
  do {
    const url = new URL('https://gmail.googleapis.com/gmail/v1/users/me/messages')
    url.searchParams.set('q', q)
    if (pageToken) url.searchParams.set('pageToken', pageToken)
    const r = await fetch(url, { headers: { Authorization: `Bearer ${access}` } })
    const j = await r.json()
    const ids: string[] = j.messages?.map((m: any) => m.id) ?? []
    pageToken = j.nextPageToken
    for (const id of ids) {
      if (got.includes(id)) continue // skip duplicates
      got.push(id)
      try {
        const full = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=To&metadataHeaders=In-Reply-To&metadataHeaders=References&metadataHeaders=Message-Id&metadataHeaders=Date`, { headers: { Authorization: `Bearer ${access}` } })
        const msg = await full.json()
        if (msg.labelIds?.includes('SENT')) continue // skip our outgoing
        const hdrs = kvHeaders(msg.payload?.headers || [])
        const inReplyTo = hdrs['in-reply-to'] || ''
        const refs = hdrs['references'] || ''
        const from = emailOnly(hdrs['from'])
        const to = (hdrs['to'] || '').toLowerCase()
        const subject = hdrs['subject'] || ''
        const date = new Date(hdrs['date'] || Date.now())
        if (date < since) continue

        // 1) Primary: In-Reply-To/References match our original message_id
        // Clean In-Reply-To to match our stored format (with angle brackets)
        const cleanInReplyTo = inReplyTo.trim()
        let { data: sent } = await sb
          .from('send_logs')
          .select('id, message_id, replied_at')
          .eq('message_id', cleanInReplyTo)
          .limit(1)
        if (!sent?.length && refs) {
          const refIds = splitRefs(refs)
          const { data } = await sb.from('send_logs').select('id, message_id, replied_at').in('message_id', refIds).limit(1)
          sent = data || []
        }

        // 2) Fallback: match by address + subject Re:
        if (!sent?.length) {
          const { data } = await sb
            .from('v_send_address_map')
            .select('send_log_id')
            .eq('lead_email', from)
            .limit(1)
          if (data?.length && /^re:/i.test(subject)) {
            sent = [{ id: data[0].send_log_id }]
          }
        }

        if (sent?.length) {
          const sid = sent[0].id
          // skip if already marked
          if (sent[0].replied_at) continue
          // fetch snippet
          const snippet = msg.snippet?.slice(0, 300) || ''
          await sb.rpc('mark_send_as_replied', {
            p_send_log_id: sid,
            p_source: 'gmail',
            p_reply_message_id: msg.id,
            p_in_reply_to_id: inReplyTo || refs || null,
            p_thread_id: msg.threadId || null,
            p_summary: snippet
          })
        }
      } catch (e) {
        console.error(`Error processing Gmail message ${id}:`, e)
      }
    }
  } while (pageToken && got.length < 500) // limit to 500 messages per account per run
}

function kvHeaders(arr: any[]) {
  const o: Record<string,string> = {}
  for (const h of arr || []) o[h.name?.toLowerCase?.() || ''] = h.value || ''
  return o
}
function emailOnly(s: string = '') {
  const m = s.match(/<([^>]+)>/)
  return (m ? m[1] : s).trim().toLowerCase()
}
function splitRefs(s: string) {
  // references: multiple message-ids separated by spaces
  return (s.match(/<[^>]+>/g) || []).map(x => x.trim())
}

/** ---------- OUTLOOK (Graph) ---------- **/
async function pollOutlook(a: Acct, since: Date) {
  const cred = await getCred(a.id)
  if (!cred) {
    console.log(`No credentials for account ${a.id}`)
    return
  }
  const access = await refreshIfNeeded('outlook', cred)
  // Simple filter; delta preferred later
  const filter = `receivedDateTime ge ${since.toISOString()}`
  let url = `https://graph.microsoft.com/v1.0/me/messages?$select=id,subject,from,toRecipients,conversationId,receivedDateTime,internetMessageHeaders&$filter=${encodeURIComponent(filter)}`
  const processed: string[] = []
  while (url && processed.length < 500) {
    const r = await fetch(url, { headers: { Authorization: `Bearer ${access}` } })
    const j = await r.json()
    for (const m of j.value || []) {
      if (processed.includes(m.id)) continue
      processed.push(m.id)
      try {
        // skip our own sent items quickly
        if (m.from?.emailAddress?.address?.toLowerCase() === a.email_address?.toLowerCase()) continue

        const hdrs = headerArrayToMap(m.internetMessageHeaders || [])
        const inReplyTo = hdrs['in-reply-to'] || ''
        const refs = hdrs['references'] || ''
        const from = (m.from?.emailAddress?.address || '').toLowerCase()
        const to = (m.toRecipients?.[0]?.emailAddress?.address || '').toLowerCase()
        const subject = m.subject || ''

        // Try message-id match first
        // Clean In-Reply-To to match our stored format (with angle brackets)
        const cleanInReplyTo = inReplyTo.trim()
        let { data: sent } = await sb
          .from('send_logs')
          .select('id, message_id, replied_at')
          .eq('message_id', cleanInReplyTo)
          .limit(1)
        if (!sent?.length && refs) {
          const refIds = splitRefs(refs)
          const { data } = await sb.from('send_logs').select('id, message_id, replied_at').in('message_id', refIds).limit(1)
          sent = data || []
        }
        // Fallback: address + "Re:"
        if (!sent?.length && /^re:/i.test(subject)) {
          const { data } = await sb
            .from('v_send_address_map')
            .select('send_log_id')
            .eq('lead_email', from)
            .limit(1)
          if (data?.length) sent = [{ id: data[0].send_log_id }]
        }

        if (sent?.length) {
          const sid = sent[0].id
          // skip if already marked
          if (sent[0].replied_at) continue
          await sb.rpc('mark_send_as_replied', {
            p_send_log_id: sid,
            p_source: 'outlook',
            p_reply_message_id: m.id,
            p_in_reply_to_id: inReplyTo || refs || null,
            p_thread_id: m.conversationId || null,
            p_summary: subject?.slice(0, 200) || ''
          })
        }
      } catch (e) {
        console.error(`Error processing Outlook message ${m.id}:`, e)
      }
    }
    url = j['@odata.nextLink'] // page if present
  }
}

function headerArrayToMap(arr: any[]) {
  const o: Record<string,string> = {}
  for (const h of arr || []) o[h.name?.toLowerCase?.() || ''] = h.value || ''
  return o
}

