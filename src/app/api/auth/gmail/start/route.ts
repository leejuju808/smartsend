import { NextRequest, NextResponse } from "next/server"
import { buildGoogleAuthUrl } from "@/lib/googleOAuth"

export async function GET(req: NextRequest) {
  // minimal CSRF: echo a nonce-y state; for MVP you can skip storing it
  const state = crypto.randomUUID()
  const url = buildGoogleAuthUrl(state)
  return NextResponse.redirect(url)
}

