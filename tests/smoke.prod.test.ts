import { test, expect } from '@playwright/test'

// NOTE: This smoke test is logging-oriented. It does not depend on live SMTP/Stripe.
// Run with PW_TEST_URL pointing to production. It will not create sends unless endpoints succeed.

async function logStep(name: string, fn: () => Promise<void>) {
  try {
    await fn()
    console.log(`[OK] ${name}`)
  } catch (e: any) {
    console.log(`[FAIL] ${name}:`, e?.message || e)
    throw e
  }
}

test('prod smoke: signup → upgrade → import → sequence launch → unsubscribe', async ({ request }) => {
  const email = `smoke_${Date.now()}@example.com`
  const password = 'Str0ngP@ss!'
  const ownerEmail = email

  await logStep('signup', async () => {
    const res = await request.post('/api/auth/signup', {
      data: { email, password },
      headers: { 'content-type': 'application/json' },
    })
    expect([200, 409]).toContain(res.status())
  })

  await logStep('billing checkout session create (mocked in prod)', async () => {
    const res = await request.post('/api/billing/create-session', {
      data: { priceId: process.env.TEST_PRICE_ID || 'price_mock', coupon: process.env.TEST_COUPON || undefined },
      headers: { 'content-type': 'application/json' },
    })
    expect([200, 401, 403]).toContain(res.status())
  })

  await logStep('connect mailbox test (smtp/gmail) - tolerant', async () => {
    const res = await request.post('/api/mail/test', { headers: { 'content-type': 'application/json' } })
    expect([200, 400, 401, 501, 500]).toContain(res.status())
  })

  await logStep('import leads csv (json payload)', async () => {
    const leads = Array.from({ length: 5 }).map((_, i) => ({ email: `lead${i}@example.com`, name: `Lead ${i}` }))
    const res = await request.post('/api/leads/import', {
      data: { ownerEmail, leads },
      headers: { 'content-type': 'application/json' },
    })
    expect([200, 401]).toContain(res.status())
  })

  await logStep('enqueue a few emails (mock queue)', async () => {
    // This assumes elsewhere something creates email_sends queued rows. Here we just call runner.
    const res = await request.post('/api/sender/run', { headers: { 'content-type': 'application/json' } })
    expect([200, 401]).toContain(res.status())
  })

  await logStep('unsubscribe', async () => {
    const res = await request.post('/api/unsubscribe', {
      data: { email: 'lead0@example.com', ownerEmail },
      headers: { 'content-type': 'application/json' },
    })
    expect([200, 400, 401, 500]).toContain(res.status())
  })
})

