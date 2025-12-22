import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

export async function GET(
  req: Request,
  { params }: { params: { code: string } }
) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )

  const { data: link } = await supabase
    .from("tracked_links")
    .select("short_code, target_url, outbox_id, user_id")
    .eq("short_code", params.code)
    .single()

  if (!link) return NextResponse.redirect(new URL("/", req.url), 302)

  // Fetch outbox details separately
  const { data: outbox } = await supabase
    .from("emails_outbox").select("id, lead_id, campaign_id, clicked_at").eq("id", link.outbox_id).single()

  await supabase.from("email_events").insert({
    user_id: link.user_id,
    outbox_id: link.outbox_id,
    lead_id: outbox?.lead_id ?? null,
    campaign_id: outbox?.campaign_id ?? null,
    type: "clicked",
    meta: { short_code: link.short_code, target_url: link.target_url }
  })

  if (outbox && !outbox.clicked_at) {
    await supabase.from("emails_outbox").update({ clicked_at: new Date().toISOString() }).eq("id", link.outbox_id)
  }

  return NextResponse.redirect(link.target_url, 302)
}

