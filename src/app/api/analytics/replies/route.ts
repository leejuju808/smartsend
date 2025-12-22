import { NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"

export async function GET() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: (k) => cookieStore.get(k)?.value } }
  )
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  // Totals
  const { data: totals } = await supabase.rpc("analytics_totals", { p_user: user.id })
  // Time series (last 14 days)
  const { data: series } = await supabase.rpc("analytics_series", { p_user: user.id, p_days: 14 })

  return NextResponse.json({ totals: totals ?? {}, series: series ?? [] })
}

