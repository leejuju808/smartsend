import { NextRequest, NextResponse } from "next/server"
import { googleAuthUrl } from "@/lib/google/oauth"
import crypto from "node:crypto"

export async function GET(_req: NextRequest) {
  const state = crypto.randomBytes(16).toString("hex")
  // set a short-lived state cookie for CSRF defense
  const res = NextResponse.redirect(googleAuthUrl(state))
  res.cookies.set("g_state", state, { httpOnly: true, sameSite: "lax", secure: true, maxAge: 600 })
  return res
}

