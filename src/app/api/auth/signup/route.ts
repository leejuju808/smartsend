import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const { email, password, ref } = await req.json()

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 })
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

    if (!supabaseUrl || !anonKey) {
      return NextResponse.json({ error: 'Supabase is not configured' }, { status: 500 })
    }

    const endpoint = `${supabaseUrl}/auth/v1/signup`
    const payload = {
      email,
      password,
      data: { ref },
      // REST API expects redirect_to (underscore), not camelCase
      redirect_to: `${appUrl}/auth/callback${ref ? `?ref=${encodeURIComponent(ref)}` : ''}`,
    } as Record<string, unknown>

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
      },
      body: JSON.stringify(payload),
    })

    const data = await res.json().catch(() => ({}))

    if (!res.ok) {
      const message = (data && (data.error_description || data.error || data.msg)) || 'Signup failed'
      console.error('Supabase signup failed', { status: res.status, endpoint, payload, data })
      return NextResponse.json({ error: message }, { status: res.status })
    }

    return NextResponse.json(data)
  } catch (error: any) {
    console.error('Signup route error', error)
    return NextResponse.json({ error: error.message || 'Internal error' }, { status: 500 })
  }
}

