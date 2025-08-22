import 'server-only'
import { getUserSubscriptionStatus, isPro, getUsageCountToday, getFreeDailyQuota } from '@/lib/usage'

export default async function UsageBadge() {
  const { user, status } = await getUserSubscriptionStatus()
  if (!user) return null
  if (isPro(status)) {
    return <span className="inline-block rounded-full bg-green-100 text-green-800 text-xs px-2.5 py-0.5">Unlimited</span>
  }
  const used = await getUsageCountToday(user.id, 'demo')
  const quota = getFreeDailyQuota('demo')
  return (
    <span className="inline-block rounded-full bg-slate-100 text-slate-700 text-xs px-2.5 py-0.5">
      {used}/{quota} free today
    </span>
  )
}

