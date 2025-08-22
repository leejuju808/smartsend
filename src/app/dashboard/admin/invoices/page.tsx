import 'server-only'
import { notFound } from 'next/navigation'
import Stripe from 'stripe'
import { cookies } from 'next/headers'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function isAdminEmail(email?: string | null): boolean {
  const list = (process.env.ADMIN_EMAILS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
  return !!(email && list.includes(email.toLowerCase()))
}

export default async function InvoicesPage({ searchParams }: { searchParams?: { q?: string } }) {
  const { createServerClient } = await import('@supabase/ssr')
  const jar = cookies()
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL as string, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string, {
    cookies: {
      get(n: string) { return jar.get(n)?.value },
      set() {},
      remove() {},
    },
  })
  const { data: { user } } = await supabase.auth.getUser()
  const email = user?.email
  if (!isAdminEmail(email)) {
    notFound()
  }

  const q = (searchParams?.q || '').toLowerCase().trim()
  const sinceSec = Math.floor((Date.now() - 90 * 24 * 60 * 60 * 1000) / 1000)
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, { apiVersion: '2024-06-20' })
  const rows: any[] = []
  let count = 0
  const iter = stripe.invoices.list({ created: { gte: sinceSec }, limit: 100, expand: ['data.customer'] })
  for await (const inv of (iter as any).autoPagingEach()) {
    if (count >= 300) break
    const rec = {
      id: inv.id,
      number: inv.number,
      created: new Date(inv.created * 1000).toISOString(),
      status: inv.status,
      total: inv.total,
      currency: (inv.currency || 'usd').toUpperCase(),
      customer_id: typeof inv.customer === 'string' ? inv.customer : inv.customer?.id,
      customer_email: inv.customer_email || (typeof inv.customer !== 'string' ? (inv.customer?.email ?? null) : null),
      hosted_invoice_url: inv.hosted_invoice_url,
      pdf: (inv as any).invoice_pdf || null,
    }
    const text = `${rec.number} ${rec.customer_id} ${rec.customer_email ?? ''}`.toLowerCase()
    if (!q || text.includes(q)) {
      rows.push(rec)
      count++
    }
  }

  const fmtMoney = (cents: number, cur: string) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: cur }).format((cents || 0) / 100)

  return (
    <div className="max-w-5xl mx-auto py-10 space-y-6">
      <h1 className="text-2xl font-semibold">Invoices (90d)</h1>
      <form className="flex items-center gap-2">
        <input
          name="q"
          defaultValue={q}
          placeholder="Filter by email, customer, or invoice #"
          className="w-96 rounded-lg border px-3 py-2 text-sm"
        />
        <button className="rounded-lg bg-black text-white text-sm px-3 py-2">Search</button>
      </form>
      <div className="overflow-x-auto rounded-xl border bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="px-3 py-2 text-left">Date</th>
              <th className="px-3 py-2 text-left">Invoice #</th>
              <th className="px-3 py-2 text-left">Email</th>
              <th className="px-3 py-2 text-left">Amount</th>
              <th className="px-3 py-2 text-left">Status</th>
              <th className="px-3 py-2 text-left">Links</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="px-3 py-2">{new Date(r.created).toLocaleString()}</td>
                <td className="px-3 py-2">{r.number ?? r.id}</td>
                <td className="px-3 py-2">{r.customer_email ?? '—'}</td>
                <td className="px-3 py-2">{fmtMoney(r.total, r.currency)}</td>
                <td className="px-3 py-2">{r.status}</td>
                <td className="px-3 py-2 space-x-2">
                  {r.hosted_invoice_url ? <a className="underline" href={r.hosted_invoice_url} target="_blank">View</a> : null}
                  {r.pdf ? <a className="underline" href={r.pdf} target="_blank">PDF</a> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

import 'server-only'
import { notFound } from 'next/navigation'
import { stripe } from '@/lib/stripe'
import { getUserSubscriptionStatus } from '@/lib/usage'
import { createServerComponentClient } from '@/lib/supabase'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function isAdminEmail(email?: string | null): boolean {
  const list = (process.env.ADMIN_EMAILS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
  return !!(email && list.includes(email.toLowerCase()))
}

export default async function InvoicesPage({ searchParams }: { searchParams?: { q?: string } }) {
  const { user } = await getUserSubscriptionStatus()
  const supabase = createServerComponentClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  const email = authUser?.email as string | undefined
  if (!isAdminEmail(email)) {
    notFound()
  }
  const q = (searchParams?.q || '').toLowerCase().trim()
  const sinceSec = Math.floor((Date.now() - 90 * 24 * 60 * 60 * 1000) / 1000)
  const rows: any[] = []
  let count = 0

  const pager = stripe.invoices.list({ created: { gte: sinceSec }, limit: 100, expand: ['data.customer'] }) as any
  for await (const inv of pager) {
    if (count >= 300) break
    const rec = {
      id: inv.id,
      number: inv.number,
      created: new Date(inv.created * 1000).toISOString(),
      status: inv.status,
      total: inv.total,
      currency: (inv.currency || 'usd').toUpperCase(),
      customer_id: typeof inv.customer === 'string' ? inv.customer : inv.customer?.id,
      customer_email: inv.customer_email || (typeof inv.customer !== 'string' ? (inv.customer?.email ?? null) : null),
      hosted_invoice_url: inv.hosted_invoice_url,
      pdf: (inv as any).invoice_pdf || null,
    }
    const text = `${rec.number} ${rec.customer_id} ${rec.customer_email ?? ''}`.toLowerCase()
    if (!q || text.includes(q)) {
      rows.push(rec)
      count++
    }
  }

  const fmtMoney = (cents: number, cur: string) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: cur }).format((cents || 0) / 100)

  return (
    <div className="max-w-5xl mx-auto py-10 space-y-6">
      <h1 className="text-2xl font-semibold">Invoices (90d)</h1>
      <form className="flex items-center gap-2">
        <input
          name="q"
          defaultValue={q}
          placeholder="Filter by email, customer, or invoice #"
          className="w-96 rounded-lg border px-3 py-2 text-sm"
        />
        <button className="rounded-lg bg-black text-white text-sm px-3 py-2">Search</button>
      </form>
      <div className="overflow-x-auto rounded-xl border bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="px-3 py-2 text-left">Date</th>
              <th className="px-3 py-2 text-left">Invoice #</th>
              <th className="px-3 py-2 text-left">Email</th>
              <th className="px-3 py-2 text-left">Amount</th>
              <th className="px-3 py-2 text-left">Status</th>
              <th className="px-3 py-2 text-left">Links</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="px-3 py-2">{new Date(r.created).toLocaleString()}</td>
                <td className="px-3 py-2">{r.number ?? r.id}</td>
                <td className="px-3 py-2">{r.customer_email ?? '—'}</td>
                <td className="px-3 py-2">{fmtMoney(r.total, r.currency)}</td>
                <td className="px-3 py-2">{r.status}</td>
                <td className="px-3 py-2 space-x-2">
                  {r.hosted_invoice_url ? <a className="underline" href={r.hosted_invoice_url} target="_blank">View</a> : null}
                  {r.pdf ? <a className="underline" href={r.pdf} target="_blank">PDF</a> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
