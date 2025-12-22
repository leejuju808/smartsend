import { NextResponse } from "next/server"

export async function GET() {
  try {
    const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    const SUPABASE_SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!
    const OWNER_USER_ID = process.env.OWNER_USER_ID!

    if (!OWNER_USER_ID) {
      return NextResponse.json({ email_address: null }, { status: 200 })
    }

    const r = await fetch(`${SUPABASE_URL}/rest/v1/gmail_connections?user_id=eq.${OWNER_USER_ID}&select=email_address`, {
      headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${SUPABASE_SERVICE}` },
      cache: "no-store",
    })
    
    const [conn] = await r.json()
    if (!conn) {
      return NextResponse.json({ email_address: null }, { status: 200 })
    }

    return NextResponse.json({ email_address: conn.email_address }, { status: 200 })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "failed to check status" }, { status: 500 })
  }
}

