import 'server-only'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /api/referrals?ref=<code> (or ?set=)
// Stores an httpOnly cookie for later association during signup
export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const ref = (url.searchParams.get('ref') || url.searchParams.get('set') || '').toString().trim()
  if (!ref) return NextResponse.json({ ok: false, error: 'missing_ref' }, { status: 400 })
  const jar = cookies()
  // 90 days
  jar.set('ss_ref_code', ref, { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 90 })
  return NextResponse.json({ ok: true })
}

