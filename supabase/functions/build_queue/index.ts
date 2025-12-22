// deno-lint-ignore-file no-explicit-any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

type Campaign = {
  id: string
  user_id: string
  send_window_start: string
  send_window_end: string
  timezone: string
  pace_seconds_low: number
  pace_seconds_high: number
  per_lead_cooldown_days: number
}

type Account = { id: string }

function randInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

async function budgetForAccount(acctId: string): Promise<number> {
  const { data, error } = await supabase.rpc('get_mailbox_budget_today', { acct_id: acctId })
  if (error) throw error
  return (data as number) ?? 0
}

const accountAgeCache = new Map<string, number>()

async function getAccountAgeDays(accountId: string): Promise<number> {
  if (accountAgeCache.has(accountId)) return accountAgeCache.get(accountId) ?? 7
  const { data, error } = await supabase
    .from('accounts')
    .select('created_at')
    .eq('id', accountId)
    .maybeSingle()
  if (error) {
    console.warn('getAccountAgeDays error', error)
    accountAgeCache.set(accountId, 7)
    return 7
  }
  if (!data?.created_at) {
    accountAgeCache.set(accountId, 7)
    return 7
  }
  const createdAt = new Date(data.created_at).getTime()
  const ageDays = Math.max(1, Math.floor((Date.now() - createdAt) / (24 * 60 * 60 * 1000)))
  accountAgeCache.set(accountId, ageDays)
  return ageDays
}

async function fetchDomainAllowance(accountId: string, domain: string, dayKey: string): Promise<number> {
  const lowerDomain = domain.toLowerCase()
  const { data: counter, error: counterErr } = await supabase
    .from('domain_send_counters')
    .select('sent_count')
    .eq('account_id', accountId)
    .eq('domain', lowerDomain)
    .eq('day', dayKey)
    .maybeSingle()
  if (counterErr && counterErr.code !== 'PGRST116') {
    console.warn('domain counter fetch error', counterErr)
  }

  const { data: ruleRows, error: ruleErr } = await supabase
    .from('domain_throttle_rules')
    .select('max_daily_sends,bounce_rate_ceiling,complaint_rate_ceiling,warmup,domain')
    .eq('account_id', accountId)
    .in('domain', [lowerDomain, '*'])
    .order('domain', { ascending: false })
    .limit(1)

  if (ruleErr) {
    console.warn('domain rule fetch error', ruleErr)
  }

  const rule = ruleRows?.[0] ?? null

  const { data: health, error: healthErr } = await supabase
    .from('v_domain_health')
    .select('bounce_rate,complaint_rate')
    .eq('account_id', accountId)
    .eq('domain', lowerDomain)
    .eq('window', '7d')
    .maybeSingle()

  if (healthErr && healthErr.code !== 'PGRST116') {
    console.warn('domain health fetch error', healthErr)
  }

  const todaySent = counter?.sent_count ?? 0
  const bounceRate = Number(health?.bounce_rate ?? 0)
  const complaintRate = Number(health?.complaint_rate ?? 0)
  const bounceCeil = rule?.bounce_rate_ceiling ?? null
  const complaintCeil = rule?.complaint_rate_ceiling ?? null
  const warmup = rule?.warmup ?? true
  const accountAgeDays = await getAccountAgeDays(accountId)

  if (bounceCeil != null && bounceRate > bounceCeil) return 0
  if (complaintCeil != null && complaintRate > complaintCeil) return 0

  const baseCap = Math.max(25, rule?.max_daily_sends ?? 300)
  let cap = baseCap
  if (warmup) {
    const age = Math.max(accountAgeDays, 1)
    const ramp = Math.round(20 + 15 * Math.log2(age + 1) + 10 * Math.sqrt(age))
    cap = Math.min(cap, Math.max(25, ramp))
  }

  const remaining = Math.max(0, cap - todaySent)
  return remaining
}

async function reserveDomainAllowance(
  accountId: string,
  domain: string,
  dayKey: string,
  allowanceCache: Map<string, Map<string, number>>
): Promise<boolean> {
  const lowerDomain = domain.toLowerCase()
  let domainMap = allowanceCache.get(accountId)
  if (!domainMap) {
    domainMap = new Map<string, number>()
    allowanceCache.set(accountId, domainMap)
  }

  let remaining = domainMap.get(lowerDomain)
  if (remaining === undefined) {
    remaining = await fetchDomainAllowance(accountId, lowerDomain, dayKey)
    domainMap.set(lowerDomain, remaining)
  }

  if (remaining <= 0) {
    return false
  }

  domainMap.set(lowerDomain, remaining - 1)
  return true
}

async function clampToWindow(ts: string, tz: string, start: string, end: string): Promise<string> {
  const { data, error } = await supabase.rpc('clamp_to_send_window', {
    desired: ts,
    tz: tz,
    win_start: start,
    win_end: end
  })
  if (error) throw error
  return (data as string) ?? ts
}

// Naive round-robin across mailboxes while respecting each budget
async function roundRobinAssign({
  campaign,
  leads,
  accounts,
  dayKey,
}: {
  campaign: Campaign
  leads: any[]
  accounts: Account[]
  dayKey: string
}) {
  // Preload budgets
  const budgets = new Map<string, number>()
  for (const a of accounts) {
    budgets.set(a.id, await budgetForAccount(a.id))
  }

  // If all budgets are zero, push everything to tomorrow at window start
  const totalBudgetInitial = [...budgets.values()].reduce((s, x) => s + x, 0)

  const assigned: any[] = []
  let cursor = 0

  const now = new Date()
  let currentIso = now.toISOString()
  const allowanceCache = new Map<string, Map<string, number>>()
  let skippedByDomain = 0

  for (const lead of leads) {
    const email = lead.recipient_email ?? ''
    const domain = email.includes('@') ? email.split('@')[1]?.toLowerCase() : null
    if (!domain) continue

    // pick next account with remaining budget; if none → schedule tomorrow
    let tries = 0
    let acct: Account | null = null
    while (tries < accounts.length) {
      const pick = accounts[cursor % accounts.length]
      cursor++
      tries++
      const budget = budgets.get(pick.id) ?? 0
      if (budget <= 0) continue
      const allowed = await reserveDomainAllowance(pick.id, domain, dayKey, allowanceCache)
      if (!allowed) continue

      if (budget > 0) {
        acct = pick
        budgets.set(pick.id, budget - 1)
        break
      }
    }

    // Compute scheduled_at
    let scheduled_at: string
    if (!acct) {
      if (totalBudgetInitial === 0) {
        // tomorrow at start
        const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000)
        scheduled_at = await clampToWindow(
          tomorrow.toISOString(),
          campaign.timezone,
          campaign.send_window_start,
          campaign.send_window_end
        )
        assigned.push({ lead, account_id: null, scheduled_at })
      } else {
        skippedByDomain++
      }
    } else {
      // within window, spaced by random pace
      const jitterSec = randInt(campaign.pace_seconds_low, campaign.pace_seconds_high)
      const nextTs = new Date(new Date(currentIso).getTime() + jitterSec * 1000)
      scheduled_at = await clampToWindow(
        nextTs.toISOString(),
        campaign.timezone,
        campaign.send_window_start,
        campaign.send_window_end
      )
      assigned.push({ lead, account_id: acct.id, scheduled_at })
      currentIso = scheduled_at
    }
  }

  return { assigned, skippedByDomain }
}

Deno.serve(async (req) => {
  try {
    const { campaign_id } = await req.json()

    if (!campaign_id) {
      return new Response(JSON.stringify({ error: 'campaign_id required' }), { status: 400 })
    }

    // 1) load campaign
    const { data: camp, error: cErr } = await supabase
      .from('campaigns')
      .select('*')
      .eq('id', campaign_id)
      .single()

    if (cErr || !camp) {
      return new Response(JSON.stringify({ error: 'Campaign not found' }), { status: 404 })
    }

    const campaign = camp as Campaign

    // Ensure defaults for required fields
    if (!campaign.send_window_start) campaign.send_window_start = '09:00'
    if (!campaign.send_window_end) campaign.send_window_end = '16:30'
    if (!campaign.timezone) campaign.timezone = 'America/Los_Angeles'
    if (!campaign.pace_seconds_low) campaign.pace_seconds_low = 45
    if (!campaign.pace_seconds_high) campaign.pace_seconds_high = 90
    if (!campaign.per_lead_cooldown_days) campaign.per_lead_cooldown_days = 14

    // 2) connected mailboxes for user
    const { data: accts, error: acctsErr } = await supabase
      .from('connected_accounts')
      .select('id')
      .eq('user_id', campaign.user_id)

    if (acctsErr) {
      return new Response(JSON.stringify({ error: acctsErr.message }), { status: 500 })
    }

    const accounts = (accts || []) as Account[]
    if (!accounts.length) {
      return new Response(JSON.stringify({ error: 'No mailboxes' }), { status: 400 })
    }

    // BLOCK 130: Filter leads by segment if segment_id is set
    let segmentFilteredLeadIds: string[] | null = null
    if ((campaign as any).segment_id) {
      const segmentId = (campaign as any).segment_id
      
      // Use materialized segment members (fastest path)
      const { data: segmentMembers, error: segErr } = await supabase
        .from('lead_segment_members')
        .select('lead_id')
        .eq('segment_id', segmentId)
      
      if (!segErr && segmentMembers && segmentMembers.length > 0) {
        segmentFilteredLeadIds = segmentMembers.map(m => m.lead_id)
      } else {
        // Validate segment exists
        const { data: segment } = await supabase
          .from('segments')
          .select('id, account_id, is_active')
          .eq('id', segmentId)
          .eq('is_active', true)
          .single()
        
        if (!segment) {
          return new Response(JSON.stringify({ 
            error: `Segment ${segmentId} not found or inactive. Campaign cannot target this segment.` 
          }), { status: 400 })
        }
      }
    }

    // 3) leads to queue (respect cooldown: not emailed in last N days)
    // First get all campaign_leads
    const { data: campaignLeads, error: clErr } = await supabase
      .from('campaign_leads')
      .select('id, lead_id, campaign_id')
      .eq('campaign_id', campaign_id)

    if (clErr) {
      return new Response(JSON.stringify({ error: clErr.message }), { status: 500 })
    }

    if (!campaignLeads || campaignLeads.length === 0) {
      return new Response(JSON.stringify({ queued: 0, message: 'No leads to enqueue' }))
    }

    const campaignLeadIds = campaignLeads.map(cl => cl.id)
    let leadIds = campaignLeads.map(cl => cl.lead_id).filter(Boolean)

    // BLOCK 130: Apply segment filter if segment_id is set
    if (segmentFilteredLeadIds !== null) {
      const segmentSet = new Set(segmentFilteredLeadIds)
      leadIds = leadIds.filter(id => segmentSet.has(id))
      
      if (leadIds.length === 0) {
        return new Response(JSON.stringify({ 
          queued: 0, 
          message: 'No leads match the selected segment' 
        }))
      }
    }

    // Get lead details
    const { data: leads, error: leadsErr } = await supabase
      .from('leads')
      .select('id, email')
      .in('id', leadIds)

    if (leadsErr) {
      return new Response(JSON.stringify({ error: leadsErr.message }), { status: 500 })
    }

    const leadMap = new Map((leads || []).map(l => [l.id, l]))
    const campaignLeadMap = new Map(campaignLeads.map(cl => [cl.id, cl]))

    // Filter out leads that already have pending/sent queue items
    const { data: existingQueue, error: qErr } = await supabase
      .from('send_queue')
      .select('lead_id')
      .eq('campaign_id', campaign_id)
      .in('lead_id', campaignLeadIds)

    if (qErr) {
      return new Response(JSON.stringify({ error: qErr.message }), { status: 500 })
    }

    const existingSet = new Set((existingQueue || []).map(q => q.lead_id))

    // Filter leads that violate cooldown (sent in last N days)
    const cooldownDate = new Date()
    cooldownDate.setDate(cooldownDate.getDate() - campaign.per_lead_cooldown_days)

    const { data: recentSends, error: sendsErr } = await supabase
      .from('send_logs')
      .select('recipient_email, sent_at')
      .gte('sent_at', cooldownDate.toISOString())
      .eq('status', 'sent')

    if (sendsErr) {
      // Log but don't fail - cooldown filtering is best effort
      console.error('Error checking cooldown:', sendsErr)
    }

    const recentEmailsSet = new Set((recentSends || []).map(s => s.recipient_email?.toLowerCase()).filter(Boolean))

    // Build eligible leads list
    const eligibleLeads: any[] = []
    for (const cl of campaignLeads) {
      if (existingSet.has(cl.id)) continue // already queued

      const lead = leadMap.get(cl.lead_id)
      if (!lead || !lead.email) continue // no email

      // Check cooldown
      if (recentEmailsSet.has(lead.email.toLowerCase())) {
        continue // within cooldown period
      }

      // Check if variant_id exists (for A/B testing or template variants)
      let variant_id: string | null = null
      if (campaign.ab_enabled) {
        // You may want to add logic here to pick variant based on A/B split
        // For now, we'll leave it null and let the launch action handle it
      }

      eligibleLeads.push({
        campaign_lead_id: cl.id, // campaign_lead id
        lead_id: cl.lead_id, // actual lead id for reference
        recipient_email: lead.email,
        variant_id: variant_id
      })
    }

    if (eligibleLeads.length === 0) {
      return new Response(JSON.stringify({ queued: 0, message: 'No eligible leads after filtering' }))
    }

    // 4) assign & schedule
    const dayKey = new Date().toISOString().slice(0, 10)
    const { assigned: assignments, skippedByDomain } = await roundRobinAssign({
      campaign,
      leads: eligibleLeads,
      accounts,
      dayKey
    })

    // 5) Filter out duplicates before inserting
    const WINDOW_HOURS = 24; // same window as sender-tick
    const rowsToInsert: any[] = []
    const pendingDomainUpdates: Record<string, number> = {}
    let skippedDuplicates = 0

    for (const a of assignments) {
      const stepNo = 1; // default to step 1 if not set (can be enhanced later)
      const leadId = a.lead.campaign_lead_id; // campaign_lead id

      // Check if this step was sent recently
      const { data: recent } = await supabase.rpc('was_step_sent_recently', {
        p_campaign: campaign_id,
        p_lead: leadId,
        p_step: stepNo,
        p_window: `${WINDOW_HOURS} hours`
      }).single()

      if (recent === true) {
        // Optionally write an audit row to explain why not enqueued
        await supabase.from('audit_logs').insert({
          campaign_id: campaign_id,
          thread_id: null,
          action: 'queue.skip_duplicate',
          meta: { step_no: stepNo, lead_id: leadId }
        })
        skippedDuplicates++
        continue
      }

      // Also implicitly protected by unique index against double pending
      rowsToInsert.push({
        user_id: campaign.user_id,
        campaign_id: campaign_id,
        lead_id: leadId, // campaign_lead id (as expected by send_queue foreign key)
        step_no: stepNo,
        variant_id: a.lead.variant_id,
        account_id: a.account_id, // may be null if deferred
        recipient_email: a.lead.recipient_email,
        to_email: a.lead.recipient_email, // also set to_email for compatibility
        status: 'pending',
        scheduled_at: a.scheduled_at
      })

      if (a.account_id) {
        const domain = (a.lead.recipient_email ?? '').split('@')[1]?.toLowerCase()
        if (domain) {
          const key = `${a.account_id}::${domain}`
          pendingDomainUpdates[key] = (pendingDomainUpdates[key] ?? 0) + 1
        }
      }
    }

    // chunked insert to avoid payload limits
    let inserted = 0
    const rows = rowsToInsert
    while (rows.length > 0) {
      const chunk = rows.splice(0, 1000)
      const { error: insErr } = await supabase
        .from('send_queue')
        .insert(chunk, { defaultToNull: false })

      if (insErr) {
        // If it's a unique constraint violation, that's expected (another process may have enqueued)
        // Otherwise, return error
        if (insErr.message?.includes('ux_queue_pending_once')) {
          console.log('Unique constraint violation (expected): another process enqueued same step')
          // Continue with remaining chunks
        } else {
          return new Response(JSON.stringify({ error: `Insert error: ${insErr.message}` }), { status: 500 })
        }
      }

      inserted += chunk.length
    }

    // Persist domain counters after successful insert
    for (const [key, value] of Object.entries(pendingDomainUpdates)) {
      if (!value) continue
      const [accountId, domain] = key.split('::')
      const { error: counterErr } = await supabase.rpc('rpc_inc_domain_counter', {
        p_account_id: accountId,
        p_domain: domain,
        p_day: dayKey,
        p_n: value
      })
      if (counterErr) {
        console.error('rpc_inc_domain_counter failed', counterErr, key, value)
      }
    }

    return new Response(
      JSON.stringify({
        queued: inserted,
        skipped_duplicates: skippedDuplicates,
        skipped_domain: skippedByDomain,
        message: 'Queue built (cap-aware + windowed)'
      }),
      { headers: { 'Content-Type': 'application/json' } }
    )
  } catch (e) {
    const errorMsg = e instanceof Error ? e.message : String(e)
    return new Response(JSON.stringify({ error: errorMsg }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
})

