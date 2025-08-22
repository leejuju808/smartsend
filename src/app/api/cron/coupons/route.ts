import 'server-only'
import { stripe } from '@/lib/stripe'
import { sendEmail } from '@/lib/notify/mailer'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
}

export async function POST(req: Request) {
  const auth = req.headers.get('authorization') || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  if (!process.env.CRON_SECRET || token !== process.env.CRON_SECRET) {
    return new Response('Unauthorized', { status: 401 })
  }
  const ids = [
    process.env.STRIPE_RESCUE_COUPON_ID,
    process.env.STRIPE_RESCUE_COUPON_ID_A,
    process.env.STRIPE_RESCUE_COUPON_ID_B,
    process.env.STRIPE_RESCUE_COUPON_ID_C,
  ].filter(Boolean) as string[]
  if (ids.length === 0) return new Response('OK', { status: 200 })

  const problems: Array<{ id: string; reason: string }> = []
  for (const id of ids) {
    try {
      const c = await stripe.coupons.retrieve(id)
      const now = Math.floor(Date.now() / 1000)
      const expired = c.redeem_by ? c.redeem_by < now : false
      const invalid = c.valid === false
      if (expired || invalid) {
        problems.push({ id, reason: expired ? 'redeem_by passed' : 'invalid=false' })
      }
    } catch (e: any) {
      problems.push({ id, reason: `retrieve_error: ${String(e)}` })
    }
  }
  if (problems.length > 0) {
    const list = problems.map(p => `- ${p.id}: ${p.reason}`).join('\n')
    const emails = adminEmails()
    for (const to of emails) {
      await sendEmail({
        to,
        subject: 'Coupon monitor: problem detected',
        text: `Some rescue coupons need attention:\n\n${list}\n\nUpdate envs or create new coupons.`,
      })
    }
  }
  return new Response(JSON.stringify({ ok: true, checked: ids.length, problems }), { status: 200, headers: { 'content-type': 'application/json' } })
}

