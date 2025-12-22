// supabase/functions/enrich-leads/index.ts
// Provider-agnostic lead enrichment worker with retry logic

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'

const CRON_SECRET = Deno.env.get('CRON_SECRET')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_KEY')!

const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2')
const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

type Lead = {
  id: string; 
  email: string | null; 
  domain: string | null; 
  company: string | null;
}

async function fetchProviderKey(owner_scope: 'user'|'org', owner_id: string) {
  const { data } = await supabase
    .from('integration_settings')
    .select('provider, api_key')
    .eq('owner_scope', owner_scope)
    .eq('owner_id', owner_id)
  
  const map: Record<string,string> = {}
  ;(data||[]).forEach(r => map[r.provider] = r.api_key)
  return map
}

// --- Provider clients ---
async function tryClearbit(email?: string|null, domain?: string|null, keys?: Record<string,string>) {
  const key = keys?.clearbit; 
  if (!key || (!email && !domain)) return null
  
  // Person+Company lookup (Clearbit HTTP API)
  const params = new URLSearchParams()
  if (email) params.set('email', email)
  if (domain) params.set('domain', domain)
  
  const res = await fetch(`https://person.clearbit.com/v2/combined/find?${params.toString()}`, {
    headers: { Authorization: `Bearer ${key}` }
  })
  
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`clearbit_${res.status}`)
  
  const j = await res.json()
  const person = j.person || {}
  const company = j.company || {}
  
  return {
    linkedin_url: person.linkedin?.handle ? `https://linkedin.com/in/${person.linkedin.handle}` : null,
    domain: company.domain || domain || null,
    company_size: company.metrics?.employeesRange || null,
    industry: company.category?.industry || company.category?.sector || null,
    location: company.location || person.location || null,
    phone: company.phone || null,
    tech_tags: (company.tech?.map((t:string)=>t.toLowerCase()) || []).slice(0, 20)
  }
}

async function tryProxycurl(linkedin?: string|null, keys?: Record<string,string>) {
  const key = keys?.proxycurl; 
  if (!key || !linkedin) return null
  
  const url = new URL('https://nubela.co/proxycurl/api/v2/linkedin')
  url.searchParams.set('url', linkedin)
  
  const r = await fetch(url, { headers: { 'Authorization': `Bearer ${key}` } })
  if (!r.ok) throw new Error(`proxycurl_${r.status}`)
  
  const j = await r.json()
  return {
    location: j.location ?? null,
    title: j.occupation ?? null
  }
}

Deno.serve(async (req) => {
  if (req.headers.get('authorization') !== `Bearer ${CRON_SECRET}`) {
    return new Response('unauthorized', { status: 401 })
  }

  // Accept either: { lead_ids: [...] } or empty → process N queued jobs
  const body = await req.json().catch(()=>({})) as { lead_ids?: string[] }
  const BATCH = 25

  // 1) Pull jobs
  let jobs: any[] = []
  if (Array.isArray(body.lead_ids) && body.lead_ids.length) {
    const { data } = await supabase
      .from('enrichment_jobs')
      .select('*')
      .in('lead_id', body.lead_ids)
      .eq('status','queued')
      .limit(BATCH)
    jobs = data || []
  } else {
    const { data } = await supabase
      .from('enrichment_jobs')
      .select('*')
      .eq('status','queued')
      .order('priority', { ascending: true })
      .order('created_at', { ascending: true })
      .limit(BATCH)
    jobs = data || []
  }
  
  if (!jobs.length) return new Response('ok')

  // mark taken
  const ids = jobs.map(j => j.id)
  await supabase
    .from('enrichment_jobs')
    .update({ status: 'taken', taken_at: new Date().toISOString() })
    .in('id', ids)
  
  await supabase
    .from('leads')
    .update({ enrichment_status: 'processing' })
    .in('id', jobs.map(j=>j.lead_id))

  for (const job of jobs) {
    try {
      // load lead
      const { data: lead } = await supabase
        .from('leads')
        .select('id,email,domain,company')
        .eq('id', job.lead_id)
        .single()
      
      if (!lead) throw new Error('lead_missing')

      // keys preference: org > user
      const keys = job.org_id
        ? await fetchProviderKey('org', job.org_id)
        : await fetchProviderKey('user', job.user_id)

      // Primary: Clearbit (email or domain)
      let patch = await tryClearbit(lead.email, lead.domain, keys)

      // Secondary: Proxycurl from linkedin (if found)
      if (patch?.linkedin_url) {
        const extra = await tryProxycurl(patch.linkedin_url, keys).catch(()=>null)
        if (extra) patch = { ...patch, ...extra }
      }

      if (!patch) {
        // nothing found: mark skipped
        await supabase
          .from('enrichment_jobs')
          .update({ status: 'skipped', updated_at: new Date().toISOString() })
          .eq('id', job.id)
        
        await supabase
          .from('leads')
          .update({ enrichment_status: 'done', last_enriched_at: new Date().toISOString() })
          .eq('id', job.lead_id)
        continue
      }

      // Write back (do not overwrite existing non-null values)
      const { data: current } = await supabase
        .from('leads')
        .select('linkedin_url,domain,company_size,industry,location,phone,tech_tags')
        .eq('id', job.lead_id)
        .single()
      
      const safe: any = {}
      for (const [k,v] of Object.entries(patch)) {
        const cur = (current as any)?.[k]
        if (v != null && v !== '' && (cur == null || cur === '')) safe[k] = v
      }

      if (Object.keys(safe).length) {
        await supabase
          .from('leads')
          .update({
            ...safe,
            enrichment_status: 'done',
            last_enriched_at: new Date().toISOString(),
          })
          .eq('id', job.lead_id)
      } else {
        await supabase
          .from('leads')
          .update({ enrichment_status: 'done', last_enriched_at: new Date().toISOString() })
          .eq('id', job.lead_id)
      }

      await supabase
        .from('enrichment_jobs')
        .update({ 
          status: 'done', 
          provider: patch?.linkedin_url ? 'clearbit+proxycurl' : 'clearbit', 
          updated_at: new Date().toISOString() 
        })
        .eq('id', job.id)
        
    } catch (err:any) {
      const attempts = (job.attempt || 0) + 1
      const status = attempts >= 3 ? 'error' : 'queued'
      
      await supabase
        .from('enrichment_jobs')
        .update({
          status, 
          attempt: attempts, 
          error: String(err?.message || err), 
          updated_at: new Date().toISOString()
        })
        .eq('id', job.id)
      
      await supabase
        .from('leads')
        .update({ 
          enrichment_status: status === 'error' ? 'error' : 'queued', 
          enrichment_error: String(err?.message || err) 
        })
        .eq('id', job.lead_id)
    }
  }

  return new Response('ok')
})
