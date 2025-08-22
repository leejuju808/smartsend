import 'server-only'
import { getUserSubscriptionStatus, isPro } from '@/lib/usage'
import { createCustomerPortalSession, submitCancelFeedbackThenPortal } from '@/app/actions/billing'
import PaymentMethodButton from '@/components/billing/PaymentMethodButton'
import Link from 'next/link'
import RescueOfferCard from '@/components/billing/RescueOfferCard'
import { applyReferralCredit } from '@/app/actions/billing'

export default async function ManageBillingPage() {
  const { user, status } = await getUserSubscriptionStatus()
  if (!user) {
    return (
      <div className="max-w-2xl mx-auto py-10">
        <div className="rounded-2xl border p-6 bg-white space-y-3">
          <h2 className="text-xl font-semibold">Sign in required</h2>
          <p className="text-sm text-slate-600"><a href="/login" className="underline">Sign in</a> to manage billing.</p>
        </div>
      </div>
    )
  }
  const rescuePct = Number(process.env.RESCUE_DISCOUNT_PERCENT ?? 20)
  const rescueMonths = Number(process.env.RESCUE_DISCOUNT_MONTHS ?? 3)
  const reasons = (process.env.CANCEL_REASON_OPTIONS || 'too_expensive,missing_features,bugs_or_quality,not_using_enough,other')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
  return (
    <div className="max-w-2xl mx-auto py-10 space-y-6">
      <div className="rounded-2xl border p-6 bg-white space-y-4">
        <h1 className="text-2xl font-semibold">Manage subscription</h1>
        <div className="text-sm text-slate-600">You are on: <b>{isPro(status) ? 'Pro' : 'Free'}</b></div>
        {isPro(status) ? (
          <>
            {/* @ts-expect-error Client component */}
            <RescueOfferCard />
          </>
        ) : null}
        <div className="flex items-center gap-3">
          <form action={createCustomerPortalSession}>
            <button className="rounded-lg border text-sm px-3 py-2">
              Continue to cancel in Stripe
            </button>
          </form>
          <Link className="text-sm underline" href="/dashboard/billing/invoices">View invoices</Link>
        </div>
        <p className="text-xs text-slate-500">Discount applies immediately and can be canceled any time in the Stripe portal.</p>
      </div>
      <div className="rounded-2xl border p-6 bg-white space-y-3">
        <h2 className="text-lg font-semibold">Payment method</h2>
        {/* @ts-expect-error Client component */}
        <PaymentMethodButton />
      </div>
      <ReferralCreditsSection />
      <div className="rounded-2xl border p-6 bg-white space-y-3">
        <h2 className="text-lg font-semibold">Before you cancel</h2>
        <p className="text-sm text-slate-600">A quick note helps us improve. You’ll still be able to finish canceling right after.</p>
        <form action={submitCancelFeedbackThenPortal} className="space-y-3">
          <div className="grid grid-cols-1 gap-2">
            <label className="text-xs text-slate-600">Reason</label>
            <select name="reason" className="rounded-lg border px-3 py-2 text-sm">
              {reasons.map(r => <option key={r} value={r}>{r.replace(/_/g,' ')}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-1 gap-2">
            <label className="text-xs text-slate-600">Anything to add? (optional)</label>
            <textarea name="note" rows={3} className="rounded-lg border px-3 py-2 text-sm" placeholder="What made you decide to cancel?" />
          </div>
          <div>
            <button className="rounded-lg border text-sm px-3 py-2">Submit & continue to Stripe</button>
          </div>
        </form>
      </div>
    </div>
  )
}

// @ts-expect-error Server Component embedding client form
async function ReferralCreditsSection() {
  const { createServerComponentClient } = await import('@/lib/supabase')
  const supabase = createServerComponentClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: prof } = await supabase
    .from('profiles')
    .select('credit_months')
    .eq('id', user.id)
    .maybeSingle()
  const credits = Number((prof as any)?.credit_months || 0)
  return (
    <div className="rounded-2xl border p-6 bg-white space-y-3">
      <h2 className="text-lg font-semibold">Referral credits</h2>
      <div className="text-sm text-slate-600">Available free months: <b>{credits}</b></div>
      <form action={applyReferralCredit}>
        <button disabled={credits <= 0} className="rounded-lg border text-sm px-3 py-2 disabled:opacity-50">Apply 1 month credit</button>
      </form>
      <p className="text-xs text-slate-500">Applies a 100% off coupon to your next billing cycle and decrements available credits.</p>
    </div>
  )
}

