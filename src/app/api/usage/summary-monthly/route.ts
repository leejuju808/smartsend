import { NextResponse } from 'next/server'
import { usageSummary } from '@/lib/usage'

export async function GET() {
  const res = await usageSummary()
  if (!(res as any).ok) return NextResponse.json(res, { status: (res as any).status || 400 })
  return NextResponse.json(res)
}

