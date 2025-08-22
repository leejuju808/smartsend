import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const ref = (url.searchParams.get('ref') || '').toString().trim()
  const dest = new URL('/signup', url.origin)
  const res = NextResponse.redirect(dest)
  if (ref) {
    res.cookies.set({ name: 'ss_ref', value: ref, httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 90 })
  }
  return res
}

