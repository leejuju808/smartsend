import { NextRequest, NextResponse } from "next/server"

const SURL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const SRV = process.env.SUPABASE_SERVICE_ROLE_KEY!

export async function GET(_: NextRequest, { params }: { params: { leadId: string } }) {
  const leadId = params.leadId
  const h = { apikey: ANON, Authorization: `Bearer ${SRV}` }

  // Lead header
  const leadR = await fetch(
    `${SURL}/rest/v1/leads?id=eq.${leadId}&select=id,first_name,last_name,email,company,status`,
    { headers: h, cache: "no-store" }
  )
  if (!leadR.ok) return NextResponse.json({ error: await leadR.text() }, { status: 500 })
  const lead = (await leadR.json())[0]
  if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 })

  // Messages
  const msgR = await fetch(
    `${SURL}/rest/v1/email_messages?lead_id=eq.${leadId}&select=id,is_inbound,subject,body_plain,from_email,to_email,sent_at,thread_id,provider_message_id,in_reply_to&order=sent_at.asc`,
    { headers: h, cache: "no-store" }
  )
  if (!msgR.ok) return NextResponse.json({ error: await msgR.text() }, { status: 500 })
  const messages = await msgR.json()

  return NextResponse.json({ lead, messages })
}

