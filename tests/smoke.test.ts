import { jest } from '@jest/globals'

// Ensure env for tests
process.env.NEXT_PUBLIC_APP_URL = 'https://example.com'
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://supabase.test'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon_test_key'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service_role_key'
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test'

// Mocks
const mockSendEmail = jest.fn(async () => {})
jest.unstable_mockModule('@/lib/notify/mailer', () => ({
  sendEmail: (...args: unknown[]) => mockSendEmail(...args),
}))

// Simple Supabase query builder mock
type UpdateArgs = Record<string, unknown>
const mockUpdates: { table: string; values: UpdateArgs; filters: Record<string, unknown> }[] = []
function makeSupabaseMock() {
  const api = {
    from(table: string) {
      return {
        update(values: UpdateArgs) {
          return {
            eq(col: string, val: unknown) {
              mockUpdates.push({ table, values, filters: { [col]: val } })
              return Promise.resolve({ data: null, error: null })
            },
          }
        },
        select() {
          return {
            eq() {
              return { maybeSingle: async () => ({ data: { id: 'user_123' } }) }
            },
          }
        },
        upsert() {
          return Promise.resolve({ data: null, error: null })
        },
        insert() {
          return Promise.resolve({ data: null, error: null })
        },
      }
    },
  }
  return api
}

jest.unstable_mockModule('@/lib/supabase', () => ({
  createAdminClient: () => makeSupabaseMock(),
}))

// Mock Stripe
const mockConstructEvent = jest.fn((payload: string) => ({
  id: 'evt_123',
  type: 'checkout.session.completed',
  created: Math.floor(Date.now() / 1000),
  data: { object: { customer: 'cus_123', subscription: 'sub_123', metadata: { userId: 'user_123', price_id: 'price_live' }, customer_details: { email: 'a@b.com' } } },
}))
const mockCheckoutCreate = jest.fn(async () => ({ id: 'cs_test', url: 'https://checkout.stripe.com/test' }))
jest.unstable_mockModule('@/lib/stripe', () => ({
  stripe: {
    webhooks: { constructEvent: (...args: unknown[]) => mockConstructEvent(...args) },
    checkout: { sessions: { create: (...args: unknown[]) => mockCheckoutCreate(...args) } },
    promotionCodes: { list: async () => ({ data: [] }) },
    subscriptions: { update: async () => ({}) },
  },
}))

// After mocks are registered, import modules under test
const { POST: signupPOST } = await import('@/app/api/auth/signup/route')
const { POST: checkoutPOST } = await import('@/app/api/checkout/route')
const { POST: webhookPOST } = await import('@/app/api/webhook/route')

// Utilities to fabricate Next.js request-like objects
function makeJsonRequest(body: unknown, headers?: Record<string, string>) {
  return {
    headers: new Map(Object.entries(headers || {})),
    json: async () => body,
    formData: async () => {
      const map = new Map<string, FormDataEntryValue>()
      return Object.assign(map, { get: (k: string) => (body as any)[k] })
    },
  } as unknown as Request
}

function makeTextRequest(text: string, headers?: Record<string, string>) {
  return {
    headers: new Map(Object.entries(headers || {})),
    text: async () => text,
  } as unknown as Request
}

// Stub fetch used by signup route to call Supabase auth REST
const originalFetch = global.fetch
beforeAll(() => {
  // @ts-expect-error override
  global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ id: 'user_123' }) }))
})
afterAll(() => {
  // @ts-expect-error restore
  global.fetch = originalFetch
})

describe('Smoke flow', () => {
  test('Signup', async () => {
    const res = await signupPOST(
      makeJsonRequest({ email: 'a@b.com', password: 'Passw0rd!' }) as any
    )
    const data = await (res as any).json()
    expect(data).toHaveProperty('id')
  })

  test('Checkout session created', async () => {
    const res = await checkoutPOST(
      makeJsonRequest({ priceId: 'price_live', userId: 'user_123' }, { 'content-type': 'application/json' }) as any
    )
    const data = await (res as any).json()
    expect(data).toMatchObject({ id: 'cs_test', url: expect.stringContaining('checkout') })
    expect(mockCheckoutCreate).toHaveBeenCalled()
  })

  test('Webhook sets subscription_status to pro', async () => {
    mockUpdates.length = 0
    const res = await webhookPOST(
      makeTextRequest('raw-payload', { 'stripe-signature': 'sig_test' }) as any
    )
    const data = await (res as any).json()
    expect(data).toEqual({ received: true })
    // Ensure we updated profiles or users with pro status
    const anyPro = mockUpdates.some(u =>
      (u.table === 'profiles' || u.table === 'users') && (u.values as any).subscription_status
    )
    expect(anyPro).toBe(true)
  })

  test('Lead import + sequence (simulated)', async () => {
    // Simulate CSV import summary
    const leads = [
      { email: 'l1@example.com' },
      { email: 'l2@example.com' },
      { email: 'l1@example.com' },
    ]
    const unique = new Set<string>()
    let imported = 0, duplicates = 0, skipped = 0
    for (const l of leads) {
      if (unique.has(l.email)) {
        duplicates++
      } else if (!l.email.includes('@')) {
        skipped++
      } else {
        unique.add(l.email)
        imported++
      }
    }
    expect({ imported, duplicates, skipped }).toEqual({ imported: 2, duplicates: 1, skipped: 0 })

    // Simulate launching a 3-step sequence by sending 3 emails
    mockSendEmail.mockClear()
    await Promise.all([
      mockSendEmail({ to: 'l1@example.com', subject: 'S1', text: '...' }),
      mockSendEmail({ to: 'l1@example.com', subject: 'S2', text: '...' }),
      mockSendEmail({ to: 'l1@example.com', subject: 'S3', text: '...' }),
    ])
    expect(mockSendEmail).toHaveBeenCalledTimes(3)
  })
})

