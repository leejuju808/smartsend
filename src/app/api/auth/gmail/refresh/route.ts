import { NextResponse } from "next/server"
import { getFreshGmailToken } from "@/lib/getFreshGmailToken"

export async function GET() {
  try {
    const token = await getFreshGmailToken()
    return NextResponse.json({ ok: true, tokenPreview: token.slice(0,12) + "..." })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "refresh error" }, { status: 500 })
  }
}

