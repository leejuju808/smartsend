import 'server-only'
import { createAdminClient } from '@/lib/supabase'
import { getUserWithSubscription } from '@/lib/getUserWithSubscription'
import { recordUsage } from '@/lib/usage'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST() {
  try {
    const { user } = await getUserWithSubscription()
    if (!user) {
      return new Response(JSON.stringify({ ok: false, error: 'unauthorized' }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      })
    }

    const sb = createAdminClient()

    const ownerEmail = user.email as string
    const userId = user.id as string

    // Seed 5 demo leads (idempotent on owner_email+email)
    const leads = [
      { email: 'jane@acme.co', name: 'Jane Doe', company: 'Acme Co' },
      { email: 'john@orbitlabs.io', name: 'John Park', company: 'Orbit Labs' },
      { email: 'ravi@pixelforge.dev', name: 'Ravi Shah', company: 'PixelForge' },
      { email: 'lisa@northstar.ai', name: 'Lisa Kim', company: 'Northstar AI' },
      { email: 'marco@bluefin.app', name: 'Marco Rivera', company: 'Bluefin' },
    ]

    await sb
      .from('leads')
      .upsert(
        leads.map((l) => ({ owner_email: ownerEmail, email: l.email, name: l.name, company: l.company })),
        { onConflict: 'owner_email,email' }
      )

    // Create a simple 3-step sequence (idempotent-ish via address uniqueness per user)
    const steps = [
      { dayOffset: 0, subject: 'Quick idea for {{company}}', body: 'Hey {{name}}, quick idea to improve replies by 2x.' },
      { dayOffset: 2, subject: 'Following up on the idea', body: 'Circling back in case this got buried.' },
      { dayOffset: 5, subject: 'Worth a 10-min chat?', body: 'If not now, happy to park for later.' },
    ]

    // We try to insert a new sequence each time; not harmful for demo
    const { data: seq, error: seqErr } = await sb
      .from('sequences')
      .insert({ user_id: userId, status: 'active', address: 'SmartSend Demo <demo@smartsend.ai>', steps })
      .select('id')
      .single()

    if (seqErr) {
      // Non-fatal for demo; continue
    }

    // Seed email_sends as already sent to show metrics immediately
    const now = new Date()
    const sentRows = leads.map((l, idx) => ({
      user_id: userId,
      to_email: l.email,
      subject: steps[0].subject.replace('{{company}}', l.company),
      body: steps[0].body.replace('{{name}}', l.name),
      status: 'sent',
      sent_at: new Date(now.getTime() - (idx + 1) * 60 * 1000).toISOString(),
    }))
    await sb.from('email_sends').insert(sentRows)

    // Record usage for the day
    await recordUsage(userId, 'emails', sentRows.length)

    // Fake engagement numbers for UI
    const sent = sentRows.length
    const opened = Math.max(1, Math.floor(sent * 0.6))
    const replied = Math.max(1, Math.floor(sent * 0.2))

    return new Response(JSON.stringify({ ok: true, sent, opened, replied }), {
      status: 200,
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    })
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: 'unknown' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }
}

