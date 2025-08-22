import { NextRequest, NextResponse } from 'next/server'
import { enforceQuotaAndLog } from '@/lib/usage'

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const meta = (body?.meta as any) || {}
  const result = await enforceQuotaAndLog(meta)
  return NextResponse.json(result, { status: (result as any).status || 200 })
}

