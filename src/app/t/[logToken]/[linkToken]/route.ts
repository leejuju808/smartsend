import { NextResponse } from "next/server"
import { headers } from "next/headers"
import { supabaseAdmin } from "@/lib/supabase/admin"

export async function GET(
  req: Request,
  { params }: { params: { logToken: string, linkToken: string } }
) {
  const ua = req.headers.get("user-agent") ?? ""
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? ""

  // Lookup original URL
  const { data: link, error } = await supabaseAdmin
    .from("message_links")
    .select("original_url")
    .eq("tracking_token", params.logToken)
    .eq("link_token", params.linkToken)
    .single()

  if (error || !link) {
    return NextResponse.redirect(new URL("/", process.env.NEXT_PUBLIC_APP_URL!), 302)
  }

  // Record click + bump counters (fire-and-forget)
  supabaseAdmin.rpc("bump_click", {
    _tok: params.logToken,
    _ltok: params.linkToken,
    _ua: ua,
    _ip: ip
  }).catch(() => {})

  // 302 to the destination
  return NextResponse.redirect(link.original_url, 302)
}
