import 'server-only'
import { getFreeDailyQuota, getUsageCountToday, getUserSubscriptionStatus, isPro } from '@/lib/usage'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const url = new URL(req.url)
  const kind = (url.searchParams.get('kind') || 'demo').toString()
  try {
    const { user, status } = await getUserSubscriptionStatus()
    if (!user) {
      return new Response(JSON.stringify({ ok: true, anonymous: true, quota: 0, used: 0, remaining: 0 }), {
        status: 200,
        headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
      })
    }
    const used = await getUsageCountToday(user.id, kind)
    const freeLimit = Number(process.env.FREE_DAILY_LIMIT || 50) || getFreeDailyQuota(kind)
    const proLimit = Number(process.env.PRO_DAILY_LIMIT || 500) || 500
    const quota = isPro(status) ? proLimit : freeLimit
    const remaining = Math.max(quota - used, 0)
    return new Response(JSON.stringify({ ok: true, quota, used, remaining, isPro: isPro(status) }), {
      status: 200,
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    })
  } catch {
    return new Response(JSON.stringify({ ok: false, error: 'unknown' }), {
      status: 200,
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    })
  }
}

