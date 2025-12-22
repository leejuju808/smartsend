// lib/preflight.ts
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'

export type PreflightIssue = {
  code: string
  severity: 'block'|'warn'
  message: string
  fix?: { action: string, payload?: any }
}

export async function evaluatePreflight(campaignId: string) {
  const supabase = createRouteHandlerClient({ cookies })

  // Load campaign once; then fan-out with ids we already have
  const { data: c, error: cErr } = await supabase
    .from('campaigns')
    .select('id,user_id,org_id,name,owned_by,sequence_id,send_start,launch_override')
    .eq('id', campaignId).single()
  if (cErr || !c) return { issues:[{code:'missing_campaign',severity:'block',message:'Campaign not found.'}], blocking:[{code:'missing_campaign',severity:'block',message:'Campaign not found.'}], remaining:0, now:new Date().toISOString() }

  const [seqRes, mbxRes, billRes] = await Promise.all([
    c.sequence_id ? supabase.from('sequence_steps')
      .select('id,step_no,subject,body_md')
      .eq('sequence_id', c.sequence_id).order('step_no', { ascending: true }) : Promise.resolve({ data: [], error: null }),
    supabase.from('connected_accounts')
      .select('id,user_id,provider,provider_email,daily_cap,warmup_enabled,warmup_started_at,last_test_send_at,provider_domain,auth_valid')
      .eq('user_id', c.user_id),
    supabase.from('billing_accounts')
      .select('usage_mtd,monthly_quota,period_end')
      .eq('user_id', c.user_id).maybeSingle()
  ])

  const seq = (seqRes.data ?? []) as Array<{id: string, step_no: number, subject: string, body_md: string | null}>
  const mbxs = mbxRes.data ?? []
  const bill = billRes.data ?? null

  const issues: PreflightIssue[] = []
  const nowISO = new Date().toISOString()

  // A) Billing
  const remaining = Math.max(0, (bill?.monthly_quota ?? 0) - (bill?.usage_mtd ?? 0))
  if (remaining <= 0) {
    issues.push({ code:'plan_empty', severity:'block', message:'Your monthly email plan is exhausted.', fix:{ action:'open_billing' }})
  } else if (remaining < 20) {
    issues.push({ code:'plan_low', severity:'warn', message:`Low plan remaining (${remaining}).`, fix:{ action:'open_billing' }})
  }

  // B) Mailbox checks
  if (!mbxs.length) {
    issues.push({ code:'no_mailbox', severity:'block', message:'No sending mailbox connected.', fix:{ action:'connect_mailbox' }})
  } else {
    for (const m of mbxs) {
      if (m.auth_valid === false) {
        issues.push({ code:'mailbox_auth', severity:'block', message:`Mailbox ${m.provider_email} needs re-auth.`, fix:{ action:'reauth_mailbox', payload:{ mailboxId: m.id }} })
      }

      if (m.warmup_enabled && !m.warmup_started_at) {
        issues.push({ code:'warmup_not_started', severity:'warn', message:`Mailbox ${m.provider_email}: warmup enabled but not started.`, fix:{ action:'start_warmup', payload:{ mailboxId: m.id }} })
      }

      if (!m.last_test_send_at) {
        issues.push({ code:'no_test_send', severity:'warn', message:`Mailbox ${m.provider_email} has never sent a test email.`, fix:{ action:'send_test', payload:{ mailboxId: m.id }} })
      }

      if ((m.daily_cap ?? 0) < 10) {
        issues.push({ code:'low_daily_cap', severity:'warn', message:`Mailbox ${m.provider_email} daily cap is very low (${m.daily_cap}).`, fix:{ action:'edit_daily_cap', payload:{ mailboxId: m.id, value: 40 }} })
      }
    }
  }

  // C) DNS heuristic placeholder (kept)
  const gmailLike = (mbxs || []).some(m => (m.provider_domain ?? '').includes('gmail'))
  if (!gmailLike) {
    // If you later add domains table with spf/dkim flags, check here.
  }

  // D) Sequence completeness
  if (!seq.length) {
    issues.push({ code:'no_steps', severity:'block', message:'Sequence has no steps.', fix:{ action:'open_sequence' }})
  } else if (seq.length < 3) {
    issues.push({ code:'few_steps', severity:'warn', message:`Sequence only has ${seq.length} step(s). Recommend 3–5.`, fix:{ action:'open_sequence' }})
  }
  for (const s of seq) {
    if (!(s.body_md || '').trim()) {
      issues.push({ code:`step_${s.step_no}_empty`, severity:'block', message:`Step ${s.step_no} body is empty.`, fix:{ action:'open_sequence_step', payload:{ stepId: s.id }}})
    }
  }

  // E) Start time sanity
  if (c?.send_start && new Date(c.send_start).getTime() < Date.now() - 5*60*1000) {
    issues.push({ code:'send_start_past', severity:'warn', message:'Send start is in the past; will start immediately.' })
  }

  const blocking = issues.filter(i => i.severity === 'block')
  return { issues, blocking, remaining, now: nowISO }
}

export async function preflight(params: {
  campaign_id: string;
  account_id: string;
  lead_id: string;
  to: string;
  sender_email: string;
  subject: string;
  body: string;
  idem_key?: string;
}) {
  const response = await fetch("/api/sends/preflight", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  return response.json();
}

