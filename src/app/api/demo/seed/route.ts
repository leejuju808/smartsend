import 'server-only'
import { createAdminClient, createServerComponentClient } from '@/lib/supabase'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST() {
  const supa = createServerComponentClient()
  const { data: { user } } = await supa.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const admin = createAdminClient()
  const leads = [
    { email: 'ceo@acme.com', name: 'Alex Carter', company: 'Acme Inc' },
    { email: 'founder@orbitly.io', name: 'Priya Shah', company: 'Orbitly' },
    { email: 'ops@northwind.com', name: 'Chris Lee', company: 'Northwind' },
    { email: 'hello@papertrail.dev', name: 'Taylor Kim', company: 'Papertrail' },
    { email: 'cto@pixelforge.ai', name: 'Jordan Rivera', company: 'Pixelforge' },
  ]

  try {
    await admin.from('leads').upsert(
      leads.map(l => ({ owner_email: user.email, email: l.email, name: l.name, company: l.company })),
      { onConflict: 'owner_email,email' }
    )
  } catch {}

  try {
    const steps = [
      { dayOffset: 0, subject: 'Quick idea for {{company}}', body: 'Hi {{name}}, quick idea to boost replies.' },
      { dayOffset: 3, subject: 'Following up — {{company}}', body: 'Wanted to bump this in case you missed it.' },
      { dayOffset: 7, subject: 'Worth a chat?', body: 'Is this relevant? Can share a 2-min loom.' },
    ]
    await admin.from('sequences').insert({ user_id: user.id, status: 'draft', address: user.email || 'me@example.com', steps })
  } catch {}

  try {
    const now = new Date()
    const toEvent = (name: string, i: number) => ({ user_id: user.id, name, context: {}, created_at: new Date(now.getTime() - i * 60_000).toISOString() })
    const sent = [0,1,2,3,4].map(i => toEvent('email_sent', i))
    const opened = [0,1,2].map(i => toEvent('email_opened', i))
    const replied = [0].map(i => toEvent('email_replied', i))
    await admin.from('analytics_events').insert([...sent, ...opened, ...replied] as any)
  } catch {}

  try {
    await admin.from('email_sends').insert(
      leads.slice(0, 3).map((l, i) => ({
        user_id: user.id,
        to_email: l.email,
        subject: `Intro for ${l.company}`,
        body: 'Short intro email body for demo.',
        status: 'sent',
        sent_at: new Date(Date.now() - (i + 1) * 60_000).toISOString(),
      }))
    )
  } catch {}

  try {
    await admin.from('onboarding_progress').upsert({ user_id: user.id, imported_leads: true, launched_sequence: true }, { onConflict: 'user_id' })
  } catch {}

  return new Response(JSON.stringify({ ok: true, leads: leads.length, sends: 3 }), { status: 200, headers: { 'content-type': 'application/json' } })
}

import 'server-only'
import { createAdminClient, createServerComponentClient } from '@/lib/supabase'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST() {
  try {
    const supa = createServerComponentClient()
    const { data: { user } } = await supa.auth.getUser()
    if (!user) return new Response('Unauthorized', { status: 401 })

    const userId = user.id
    const ownerEmail = user.email || ''
    const sb = createAdminClient()

    // Seed 5 fake leads (idempotent upsert by owner_email + email)
    const leads = [
      { email: 'alice@exampleco.com', name: 'Alice', company: 'ExampleCo' },
      { email: 'bob@acmecorp.com', name: 'Bob', company: 'ACME Corp' },
      { email: 'carol@contoso.com', name: 'Carol', company: 'Contoso' },
      { email: 'dan@globex.com', name: 'Dan', company: 'Globex' },
      { email: 'eve@initech.com', name: 'Eve', company: 'Initech' },
    ]
    const upsertRows = leads.map(l => ({
      owner_email: ownerEmail,
      email: l.email.toLowerCase(),
      name: l.name,
      company: l.company,
    }))
    await sb.from('leads').upsert(upsertRows, { onConflict: 'owner_email,email', ignoreDuplicates: true })

    // Seed a demo sequence (simple 3-step with %UNSUB%)
    const steps = [
      { subject: 'Quick idea for you', body: 'Hi {{name}}, quick idea... %UNSUB%', delayDays: 0 },
      { subject: 'Following up on the idea', body: 'Wanted to follow up... %UNSUB%', delayDays: 3 },
      { subject: 'Last one', body: 'Last note for now. %UNSUB%', delayDays: 7 },
    ]
    await sb.from('sequences').insert({
      user_id: userId,
      status: 'running',
      address: '123 Demo St, Demo City, DC 12345',
      steps,
    })

    // Mark onboarding progress
    await sb.from('onboarding_progress').upsert({ user_id: userId, imported_leads: true, launched_sequence: true }, { onConflict: 'user_id' })

    // Insert demo analytics so metrics show immediate value
    const now = new Date()
    const events: any[] = []
    // 5 sent, 3 opened, 1 replied
    for (let i = 0; i < 5; i++) events.push({ user_id: userId, name: 'email_sent', context: { email: upsertRows[i % upsertRows.length].email }, created_at: now })
    for (let i = 0; i < 3; i++) events.push({ user_id: userId, name: 'email_opened', context: { email: upsertRows[i % upsertRows.length].email }, created_at: now })
    for (let i = 0; i < 1; i++) events.push({ user_id: userId, name: 'email_replied', context: { email: upsertRows[i % upsertRows.length].email }, created_at: now })
    await sb.from('analytics_events').insert(events)

    return new Response(
      JSON.stringify({ ok: true, leads: upsertRows.length, sends: 5 }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    )
  } catch (e) {
    return new Response(JSON.stringify({ ok: false }), { status: 500, headers: { 'content-type': 'application/json' } })
  }
}

import { NextResponse } from 'next/server'
import { createServerComponentClient } from '@/lib/supabase'
import { createAdminClient } from '@/lib/supabase'
import { recordUsage } from '@/lib/usage'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST() {
  try {
    const supabase = createServerComponentClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profile } = await supabase
      .from('users')
      .select('email')
      .eq('id', user.id)
      .maybeSingle()

    const ownerEmail = (profile as any)?.email as string | undefined
    if (!ownerEmail) return NextResponse.json({ error: 'Missing owner email' }, { status: 400 })

    const admin = createAdminClient()

    // Insert 5 demo leads (idempotent on owner_email+email)
    const demoLeads = [
      { email: 'demo.alice@acme.co', name: 'Alice', company: 'Acme Co' },
      { email: 'demo.bob@contoso.com', name: 'Bob', company: 'Contoso' },
      { email: 'demo.cara@example.org', name: 'Cara', company: 'Example Org' },
      { email: 'demo.dan@globex.io', name: 'Dan', company: 'Globex' },
      { email: 'demo.elle@initech.dev', name: 'Elle', company: 'Initech' },
    ]

    await admin.from('leads').upsert(
      demoLeads.map(l => ({ owner_email: ownerEmail, email: l.email, name: l.name, company: l.company })),
      { onConflict: 'owner_email,email' }
    )

    // Create a demo sequence
    const steps = [
      { day: 0, subject: 'Quick question about your outbound', body: 'Hey {{name}}, saw {{company}} — quick idea to increase replies.' },
      { day: 3, subject: 'Following up on SmartSend', body: 'Bumping this in case it helps your pipeline.' },
    ]
    await admin.from('sequences').upsert(
      [{ user_id: user.id, status: 'active', address: 'demo@smartsend.ai', steps }],
      { onConflict: 'user_id' }
    )

    // Seed a few sent events for metrics (usage)
    await recordUsage(user.id, 'emails', 5)

    // Optionally reflect in email_sends table for UI experiments
    const sends = demoLeads.map((l, i) => ({
      user_id: user.id,
      to_email: l.email,
      subject: i === 0 ? 'Re: outbound idea' : 'Quick idea',
      body: 'This is a demo send to showcase metrics',
      status: 'sent',
      sent_at: new Date().toISOString(),
    }))
    await admin.from('email_sends').insert(sends).catch(() => {})

    // Seed a few open/reply analytics events for UI
    try {
      await admin.from('analytics_events').insert([
        { user_id: user.id, name: 'email_open', context: { campaign: 'demo' } },
        { user_id: user.id, name: 'email_open', context: { campaign: 'demo' } },
        { user_id: user.id, name: 'email_reply', context: { campaign: 'demo' } },
      ])
    } catch {}

    return NextResponse.json({ ok: true, leads: demoLeads.length, sends: sends.length, opens: 2, replies: 1 })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Internal error' }, { status: 500 })
  }
}

import 'server-only'
import { createAdminClient, createServerComponentClient } from '@/lib/supabase'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST() {
  const supa = createServerComponentClient()
  const { data: { user } } = await supa.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const ownerEmail = (user as any).email as string | null
  if (!ownerEmail) return new Response('Missing owner email', { status: 400 })

  const demoLeads = [
    { email: 'alex@indieworks.io', name: 'Alex Carter', company: 'IndieWorks' },
    { email: 'mia@craftlabs.dev', name: 'Mia Nguyen', company: 'CraftLabs' },
    { email: 'sam@launchpad.agency', name: 'Sam Patel', company: 'LaunchPad Agency' },
    { email: 'nora@byteforge.co', name: 'Nora Kim', company: 'ByteForge' },
    { email: 'leo@signalpeak.io', name: 'Leo Garcia', company: 'SignalPeak' },
    { email: 'ivy@flowfoundry.dev', name: 'Ivy Thompson', company: 'FlowFoundry' },
    { email: 'owen@sharpstack.io', name: 'Owen Brooks', company: 'SharpStack' },
    { email: 'zoe@mintgrowth.agency', name: 'Zoe Martin', company: 'MintGrowth' },
    { email: 'fin@northstar.dev', name: 'Fin O’Reilly', company: 'NorthStar' },
    { email: 'lena@pixelpilot.io', name: 'Lena Rossi', company: 'PixelPilot' },
  ]

  const sb = createAdminClient()
  const rows = demoLeads.map(l => ({ owner_email: ownerEmail, email: l.email.toLowerCase(), name: l.name, company: l.company }))
  const { data: inserted, error } = await sb
    .from('leads')
    .upsert(rows, { onConflict: 'owner_email,email', ignoreDuplicates: true })
    .select('email')

  if (error) return new Response(JSON.stringify({ ok: false, error: 'db_error' }), { status: 500, headers: { 'content-type': 'application/json' } })

  return new Response(JSON.stringify({ ok: true, leads: inserted?.length || 0 }), { status: 200, headers: { 'content-type': 'application/json' } })
}

import 'server-only'
import { createAdminClient, createServerComponentClient } from '@/lib/supabase'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type DemoLead = { email: string; name?: string; company?: string }

export async function POST() {
  const supa = createServerComponentClient()
  const { data: { user } } = await supa.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const sb = createAdminClient()

  // Seed 5 demo leads tied to the user's email as owner
  const leads: DemoLead[] = [
    { email: 'alex@example.org', name: 'Alex Chen', company: 'IndieTools' },
    { email: 'sam@example.org', name: 'Sam Patel', company: 'PixelForge' },
    { email: 'jordan@example.org', name: 'Jordan Lee', company: 'GrowthBay' },
    { email: 'taylor@example.org', name: 'Taylor Brooks', company: 'StackLabs' },
    { email: 'riley@example.org', name: 'Riley Nguyen', company: 'LaunchOps' },
  ]

  // Get user email for leads.owner_email
  const { data: profile } = await supa.from('users').select('email').eq('id', user.id).maybeSingle()
  const ownerEmail = profile?.email || 'owner@example.com'

  const rows = leads.map(l => ({ owner_email: ownerEmail, email: l.email.toLowerCase(), name: l.name || null, company: l.company || null }))
  await sb.from('leads').upsert(rows, { onConflict: 'owner_email,email', ignoreDuplicates: true })

  // Create a simple 3-step sequence
  const steps = [
    { dayOffset: 0, subject: 'Launch a campaign in <10min, no bloat', body: 'Quick demo of SmartSend → {{demo_link}}' },
    { dayOffset: 2, subject: 'Any interest in a 5-min walkthrough?', body: 'Happy to show you how to send 50 emails fast.' },
    { dayOffset: 5, subject: 'Friendly bump', body: 'Can I send over a quick demo or a Calendly link?' },
  ]
  const { data: seq } = await sb
    .from('sequences')
    .insert({ user_id: user.id, status: 'active', address: ownerEmail, steps })
    .select('id')
    .maybeSingle()

  // Queue one send per lead immediately with synthetic content
  const subject = 'Launch a campaign in <10min, no bloat.'
  const body = 'This is a demo send. You are viewing SmartSend seeded data.'
  const sendRows = rows.map(r => ({ user_id: user.id, to_email: r.email, subject, body, status: 'sent', sent_at: new Date().toISOString() }))
  await sb.from('email_sends').insert(sendRows)

  // Record usage events so metrics show instantly
  await sb.from('usage_events').insert([{ user_id: user.id, kind: 'emails', qty: sendRows.length }])

  return new Response(JSON.stringify({ ok: true, leads: rows.length, sequenceId: seq?.id, sends: sendRows.length }), { status: 200, headers: { 'content-type': 'application/json' } })
}

import 'server-only'
import { createAdminClient, createServerComponentClient } from '@/lib/supabase'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST() {
  const supa = createServerComponentClient()
  const { data: { user } } = await supa.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const admin = createAdminClient()

  // Seed 5 demo leads tied to the user's email
  const ownerEmail = user.email || 'demo@smartsend.ai'
  const demoLeads = [
    { name: 'Ava Patel', company: 'Nimbus CRM', email: 'ava@nimbuscrm.co' },
    { name: 'Liam Chen', company: 'Orbit Metrics', email: 'liam@orbitmetrics.io' },
    { name: 'Sophia Reed', company: 'Pulse Labs', email: 'sophia@pulselabs.dev' },
    { name: 'Noah Kim', company: 'Helix AI', email: 'noah@helixai.app' },
    { name: 'Mia Lopez', company: 'Trailblaze', email: 'mia@trailblaze.xyz' },
  ]

  const leadRows = demoLeads.map(l => ({
    owner_email: ownerEmail,
    email: l.email.toLowerCase(),
    name: l.name,
    company: l.company,
  }))

  const { data: insertedLeads, error: leadErr } = await admin
    .from('leads')
    .upsert(leadRows, { onConflict: 'owner_email,email', ignoreDuplicates: true })
    .select('email')

  if (leadErr) {
    return new Response(JSON.stringify({ ok: false, error: 'lead_insert_error' }), { status: 500, headers: { 'content-type': 'application/json' } })
  }

  // Create a 3-step demo sequence
  const steps = [
    { step: 1, delayDays: 0, subject: 'Quick idea for {{company}}', body: 'Hey {{name}}, noticed {{company}} could boost reply rates in <10min with SmartSend.' },
    { step: 2, delayDays: 3, subject: 'Worth a try?', body: 'Happy to share a quick demo. It takes minutes to launch.' },
    { step: 3, delayDays: 7, subject: 'Last nudge', body: 'If now isn\'t right, mind if I circle back next month?' },
  ]

  const { data: sequence, error: seqErr } = await admin
    .from('sequences')
    .insert({
      user_id: user.id,
      status: 'active',
      address: ownerEmail,
      steps,
    })
    .select('id')
    .maybeSingle()

  if (seqErr) {
    return new Response(JSON.stringify({ ok: false, error: 'sequence_insert_error' }), { status: 500, headers: { 'content-type': 'application/json' } })
  }

  // Seed 5 queued+sent emails for step 1
  const now = new Date().toISOString()
  const sendRows = demoLeads.map(l => ({
    user_id: user.id,
    inbox_id: null,
    to_email: l.email.toLowerCase(),
    subject: steps[0].subject.replace('{{company}}', l.company),
    body: steps[0].body.replace('{{name}}', l.name).replace('{{company}}', l.company),
    status: 'sent',
    sent_at: now,
  }))

  const { error: sendErr } = await admin.from('email_sends').insert(sendRows)
  if (sendErr) {
    return new Response(JSON.stringify({ ok: false, error: 'send_insert_error' }), { status: 500, headers: { 'content-type': 'application/json' } })
  }

  // Seed analytics events: 3 opens, 1 reply
  const openEvents = demoLeads.slice(0, 3).map(l => ({ name: 'email.open', user_id: user.id, context: { to_email: l.email.toLowerCase() } }))
  const replyEvents = demoLeads.slice(0, 1).map(l => ({ name: 'email.reply', user_id: user.id, context: { to_email: l.email.toLowerCase() } }))
  await admin.from('analytics_events').insert([...openEvents, ...replyEvents] as any)

  return new Response(JSON.stringify({ ok: true, leads: insertedLeads?.length || 0, sends: sendRows.length, opens: openEvents.length, replies: replyEvents.length, sequence_id: sequence?.id }), { status: 200, headers: { 'content-type': 'application/json' } })
}

