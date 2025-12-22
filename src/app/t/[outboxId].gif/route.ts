import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

// 1x1 transparent GIF bytes
const GIF = Uint8Array.from([71,73,70,56,57,97,1,0,1,0,128,0,0,0,0,0,255,255,255,33,249,4,1,0,0,0,0,44,0,0,0,0,1,0,1,0,0,2,2,68,1,0,59])

export async function GET(
  _req: Request,
  { params }: { params: { outboxId: string } }
) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )

  const outboxId = params.outboxId.replace(".gif", "")
  // Fetch outbox row
  const { data: row } = await supabase
    .from("emails_outbox")
    .select("id, user_id, lead_id, campaign_id, opened_at")
    .eq("id", outboxId)
    .single()

  if (row) {
    // Idempotent: create event + set opened_at if first time
    await supabase.from("email_events").insert({
      user_id: row.user_id,
      outbox_id: row.id,
      lead_id: row.lead_id,
      campaign_id: row.campaign_id,
      type: "opened",
      ua: _req.headers.get("user-agent") ?? undefined,
      ip: (_req.headers.get("x-forwarded-for") ?? "").split(",")[0] || undefined,
    })
    if (!row.opened_at) {
      await supabase.from("emails_outbox").update({ opened_at: new Date().toISOString() }).eq("id", row.id)
    }
  }

  return new NextResponse(GIF, {
    headers: {
      "Content-Type": "image/gif",
      "Cache-Control": "no-store, private, max-age=0",
    }
  })
}

