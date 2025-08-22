import 'server-only'
import Freewall from '@/components/billing/Freewall'
import { runDemoAction } from '@/app/actions/demo'
import { getUserSubscriptionStatus } from '@/lib/usage'

export default async function QuotaDemoPage() {
  const { user, status } = await getUserSubscriptionStatus()
  async function Action() {
    'use server'
    await runDemoAction()
  }
  return (
    <div className="max-w-2xl mx-auto py-10 space-y-4">
      <h1 className="text-2xl font-semibold">Quota Demo</h1>
      <p className="text-sm text-slate-600">User: {user ? user.id : 'anonymous'} | Status: {status}</p>
      {/* @ts-expect-error Server→Client boundary is fine */}
      <Freewall kind="demo">
        <form action={Action}>
          <button className="rounded-lg bg-black text-white text-sm px-3 py-2">Use one unit</button>
        </form>
      </Freewall>
    </div>
  )
}
