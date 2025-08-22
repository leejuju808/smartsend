import { NextRequest, NextResponse } from 'next/server'
import { sendEmail } from '@/lib/notify/mailer'
import { enforceQuotaAndLog } from '@/lib/usage'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const gate = await enforceQuotaAndLog({ source: 'troubleshoot_send_test' })
    if (!(gate as any).ok) {
      if ((gate as any).status === 402) {
        return NextResponse.json({ error: 'QuotaExceeded', upgradeUrl: (gate as any).redirectTo, summary: (gate as any).summary }, { status: 402 })
      }
      return NextResponse.json(gate as any, { status: (gate as any).status || 400 })
    }
    const contentType = req.headers.get('content-type') || ''
    let to: string | undefined
    if (contentType.includes('application/json')) {
      const j = await req.json()
      to = j?.to
    } else {
      const form = await req.formData()
      to = form.get('to')?.toString()
    }
    if (!to) return NextResponse.json({ ok: false, error: 'Missing to' }, { status: 400 })
    await sendEmail({ to, subject: 'SmartSend Test Email', text: 'This is a test email from SmartSend troubleshoot.' })
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'failed' }, { status: 500 })
  }
}

