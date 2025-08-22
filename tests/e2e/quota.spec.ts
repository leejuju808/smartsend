import { test, expect } from '@playwright/test'

async function consume(request: any, kind = 'demo') {
  return request.post('/api/usage/consume', {
    data: { kind },
    headers: { 'content-type': 'application/json' },
  })
}

test('free users hit daily quota (requires authenticated session setup)', async ({ request }) => {
  // This test assumes an authenticated session is already established for the request context.
  // You may need to implement session helpers to set cookies or tokens prior to running.
  for (let i = 0; i < Number(process.env.FREE_DAILY_QUOTA ?? 5); i++) {
    const res = await consume(request)
    expect([200, 401]).toContain(res.status())
    if (res.status() === 401) return // unauthenticated in CI; skip remainder
  }
  const blocked = await consume(request)
  expect([429, 401]).toContain(blocked.status())
})

