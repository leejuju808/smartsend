import { NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase/admin"

const ONE_BY_ONE_GIF = Uint8Array.from([
  71,73,70,56,57,97,1,0,1,0,128,0,0,0,0,0,255,255,255,33,249,4,1,0,0,1,0,44,0,0,0,0,1,0,1,0,0,2,2,68,1,0,59
]) // tiny transparent GIF (safe for most clients)

export async function GET(req: Request, { params }: { params: { logToken: string } }) {
  const headers = await import("next/headers")
  const h = headers.headers()
  const ua = h.get("user-agent") ?? ""
  const ip = h.get("x-forwarded-for") ?? ""

  // Fire-and-forget; don't block pixel delivery on DB latency
  supabaseAdmin.rpc("bump_open", { _tok: params.logToken, _ua: ua, _ip: ip }).catch(() => {})

  return new NextResponse(ONE_BY_ONE_GIF, {
    status: 200,
    headers: {
      "Content-Type": "image/gif",
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0",
      "Content-Length": String(ONE_BY_ONE_GIF.length),
    }
  })
}