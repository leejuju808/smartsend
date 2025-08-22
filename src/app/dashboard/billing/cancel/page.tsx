import 'server-only'
import { applySaveOffer, beginCancelFlow } from '@/app/actions/billing'
import { getActivePriceInfos, computeAnnualSavings } from '@/lib/pricing'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'

export const dynamic = 'force-dynamic'

export default async function CancelPage() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
  const jar = cookies()
  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      get(name: string) {
        return jar.get(name)?.value
      },
      set() {},
      remove() {},
    },
  })
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return (
      <div className="max-w-xl mx-auto py-10">
        <h1 className="text-2xl font-semibold">Cancel subscription</h1>
        <p className="mt-2 text-sm text-slate-600">Please <a href="/login" className="underline">sign in</a> first.</p>
      </div>
    )
  }
  const { data: prof } = await supabase.from('profiles').select('subscription_status, plan_interval').eq('id', user.id).maybeSingle()
  const isPro = (prof as any)?.subscription_status === 'pro'
  const planInterval = (prof as any)?.plan_interval as string | null
  const prices = await getActivePriceInfos().catch(() => null)
  const showOffer = isPro && planInterval !== 'year' && Boolean(process.env.SAVE_PROMOTION_CODE || process.env.SAVE_COUPON_ID)
  const savings = prices?.annual && prices?.monthly
    ? computeAnnualSavings(prices.monthly.unitAmount ?? null, prices.annual.unitAmount ?? null)
    : null
  return (
    <div className="max-w-2xl mx-auto py-10 space-y-6">
      <h1 className="text-2xl font-semibold">Before you go</h1>
      <div className="space-y-4">
        <form className="space-y-4" action={beginCancelFlow}>
          <div>
            <label className="block text-sm text-slate-600 mb-1">What’s the main reason you’re canceling?</label>
            <select name="reason" className="w-full rounded-lg border px-3 py-2 text-sm">
              <option value="">— Select a reason —</option>
              <option value="too_expensive">Too expensive</option>
              <option value="missing_feature">Missing a feature</option>
              <option value="not_using">Not using it</option>
              <option value="support">Support issue</option>
              <option value="other">Other</option>
            </select>
          </div>
          <button type="submit" className="rounded-lg border px-3 py-2 text-sm">Continue to cancel</button>
        </form>
        {showOffer ? (
          <form action={applySaveOffer}>
            <input type="hidden" name="reason" value="accepted_offer" />
            <button className="rounded-lg bg-green-600 text-white px-3 py-2 text-sm">
              {savings ? `Save ${savings.percent}%` : 'Save now'} — keep Pro
            </button>
          </form>
        ) : null}
        <p className="text-xs text-slate-500">Cancel happens in the Stripe Customer Portal; you can still return here anytime.</p>
      </div>
    </div>
  )
}

