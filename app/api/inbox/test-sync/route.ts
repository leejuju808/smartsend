import { NextRequest, NextResponse } from "next/server"

export async function POST(req: NextRequest) {
  // Read workspace from cookie or header set by your auth middleware
  const workspaceId = req.headers.get("x-workspace-id") || req.cookies.get("workspace_id")?.value
  if (!workspaceId) return NextResponse.json({ error: "Missing workspace" }, { status: 400 })

  const res = await fetch(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/gmail-poller`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY!}`, // server-only
      },
      body: JSON.stringify({ workspaceId }),
    }
  )

  const json = await res.json().catch(() => ({}))
  return NextResponse.json({ ok: res.ok, ...json }, { status: res.status })
} 