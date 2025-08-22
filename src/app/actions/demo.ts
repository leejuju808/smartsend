'use server'
import { requireQuota, recordUsage } from '@/lib/usage'
import { redirect } from 'next/navigation'
import { createAdminClient, createServerComponentClient } from '@/lib/supabase'

/**
 * Seeds demo data for the current user:
 * - 5 leads
 * - 1 sequence with 3 steps
 * - sample analytics events for sent/opened/replied
 * - optional outbox rows for visual completeness
 * Then redirects to the dashboard.
 */
export async function seedDemo() {
  const supa = createServerComponentClient()
  const { data: { user } } = await supa.auth.getUser()
  if (!user) {
    redirect('/login')
  }

  // Respect free quota for demo action, but allow at least one seed
  try {
    const gate = await requireQuota('demo')
    if (!gate.allowed) {
      redirect('/dashboard/billing?from=quota')
    }
    if (Number.isFinite(gate.remaining)) {
      try { await recordUsage(gate.user.id, 'demo', 1) } catch {}
    }
  } catch {}

  const admin = createAdminClient()

  const leads = [
    { email: 'ceo@acme.com', name: 'Alex Carter', company: 'Acme Inc' },
    { email: 'founder@orbitly.io', name: 'Priya Shah', company: 'Orbitly' },
    { email: 'ops@northwind.com', name: 'Chris Lee', company: 'Northwind' },
    { email: 'hello@papertrail.dev', name: 'Taylor Kim', company: 'Papertrail' },
    { email: 'cto@pixelforge.ai', name: 'Jordan Rivera', company: 'Pixelforge' },
  ]

  // Insert leads (de-duplicate by unique (owner_email, email))
  try {
    await admin
      .from('leads')
      .upsert(
        leads.map(l => ({ owner_email: user!.email, email: l.email, name: l.name, company: l.company })),
        { onConflict: 'owner_email,email' }
      )
  } catch {}

  // Create a simple 3-step sequence
  try {
    const steps = [
      { dayOffset: 0, subject: 'Quick idea for {{company}}', body: 'Hi {{name}}, quick idea to boost replies.' },
      { dayOffset: 3, subject: 'Following up — {{company}}', body: 'Wanted to bump this in case you missed it.' },
      { dayOffset: 7, subject: 'Worth a chat?', body: 'Is this relevant? Can share a 2-min loom.' },
    ]
    await admin
      .from('sequences')
      .insert({ user_id: user!.id, status: 'draft', address: user!.email || 'me@example.com', steps })
  } catch {}

  // Seed analytics events for metrics
  try {
    const now = new Date()
    const toEvent = (name: string, idx: number) => ({
      user_id: user!.id,
      name,
      context: { lead: leads[idx % leads.length].email },
      created_at: new Date(now.getTime() - idx * 60_000).toISOString(),
    })
    const sent = [0,1,2,3,4].map(i => toEvent('email_sent', i))
    const opened = [0,1,2].map(i => toEvent('email_opened', i))
    const replied = [0].map(i => toEvent('email_replied', i))
    await admin.from('analytics_events').insert([...sent, ...opened, ...replied] as any)
  } catch {}

  // Optional: seed outbox rows as already sent
  try {
    await admin.from('email_sends').insert(
      leads.slice(0, 3).map((l, i) => ({
        user_id: user!.id,
        to_email: l.email,
        subject: `Intro for ${l.company}`,
        body: 'Short intro email body for demo.',
        status: 'sent',
        sent_at: new Date(Date.now() - (i + 1) * 60_000).toISOString(),
      }))
    )
  } catch {}

  // Mark onboarding progress
  try {
    await admin
      .from('onboarding_progress')
      .upsert(
        { user_id: user!.id, imported_leads: true, launched_sequence: true },
        { onConflict: 'user_id' }
      )
  } catch {}

  redirect('/dashboard')
}

/** Kept for compatibility; no-op sample action */
export async function runDemoAction() {
  let gate
  try {
    gate = await requireQuota('demo')
  } catch {
    redirect('/login')
  }
  if (!gate.allowed) {
    redirect('/dashboard/billing?from=quota')
  }
  if (Number.isFinite(gate.remaining)) {
    await recordUsage(gate.user.id, 'demo', 1)
  }
  return { ok: true }
}
