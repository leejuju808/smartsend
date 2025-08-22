import 'server-only'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { stripe } from '@/lib/stripe'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export default async function UserInvoicesPage() {
  const jar = cookies()
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL as string, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string, {
    cookies: {
      get(n: string) { return jar.get(n)?.value },
      set() {},
      remove() {},
    },
  })
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return (
      <div className="max-w-2xl mx-auto py-10">
        <div className="rounded-2xl border p-6 bg-white space-y-2">
          <h2 className="text-xl font-semibold">Sign in required</h2>
          <p className="text-sm text-slate-600"><a href="/login" className="underline">Sign in</a> to view invoices.</p>
        </div>
      </div>
    )
  }

  const { data: prof } = await supabase
    .from('profiles')
    .select('stripe_customer_id')
    .eq('id', user.id)
    .maybeSingle()
  const customerId = (prof as any)?.stripe_customer_id as string | undefined

  if (!customerId) {
    return (
      <div className="max-w-2xl mx-auto py-10">
        <div className="rounded-2xl border p-6 bg-white space-y-2">
          <h2 className="text-xl font-semibold">No invoices yet</h2>
          <p className="text-sm text-slate-600">You don’t have a billing profile yet.</p>
        </div>
      </div>
    )
  }

  const sinceSec = Math.floor((Date.now() - 365 * 24 * 60 * 60 * 1000) / 1000)
  const rows: any[] = []
  const pager = (await stripe.invoices.list({ created: { gte: sinceSec }, customer: customerId, limit: 100 })) as any
  for await (const inv of pager) {
    rows.push({
      id: inv.id,
      number: inv.number,
      created: new Date(inv.created * 1000).toISOString(),
      status: inv.status,
      total: inv.total,
      currency: (inv.currency || 'usd').toUpperCase(),
      hosted_invoice_url: inv.hosted_invoice_url,
      pdf: (inv as any).invoice_pdf || null,
    })
  }

  const fmtMoney = (cents: number, cur: string) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: cur }).format((cents || 0) / 100)

  return (
    <div className="max-w-3xl mx-auto py-10 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Your invoices</h1>
        <a className="text-sm underline" href="/dashboard/billing/manage">Back to billing</a>
      </div>
      <div className="overflow-x-auto rounded-xl border bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="px-3 py-2 text-left">Date</th>
              <th className="px-3 py-2 text-left">Invoice #</th>
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
                <td className="px-3 py-2">{fmtMoney(r.total, r.currency)}</td>
                <td className="px-3 py-2">{r.status}</td>
                <td className="px-3 py-2 space-x-2">
                  {r.hosted_invoice_url ? <a className="underline" href={r.hosted_invoice_url} target="_blank">View</a> : null}
                  {r.pdf ? <a className="underline" href={r.pdf} target="_blank">PDF</a> : null}
                </td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td className="px-3 py-6 text-center text-slate-500" colSpan={5}>No invoices yet</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  )
}

