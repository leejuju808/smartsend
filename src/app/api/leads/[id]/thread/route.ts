import { NextResponse } from "next/server"
import { getServerSupabase } from "@/lib/supabase/server"

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = getServerSupabase()
  const { id } = await params
  const leadId = id

  // Get lead meta - using contacts table as that's the actual schema
  const { data: lead, error: eLead } = await supabase
    .from("contacts")
    .select("id, first_name, last_name, email, lead_score")
    .eq("id", leadId)
    .single()
  
  if (eLead || !lead) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 })
  }

  // Timeline from v_thread_timeline view
  // Note: We need to adapt to actual schema - using email as lead identifier
  const { data: items, error: eItems } = await supabase
    .from("v_thread_timeline")
    .select("*")
    .eq("lead_id", lead.email)
    .order("ts", { ascending: true }) // oldest -> newest
  
  if (eItems) {
    return NextResponse.json({ error: eItems.message }, { status: 400 })
  }

  // Try to infer a threadId for Gmail deep link (first non-null)
  const threadId = items?.find(i => i.thread_id)?.thread_id as string | undefined
  const gmailUrl = threadId ? `https://mail.google.com/mail/u/0/#inbox/${threadId}` : null

  return NextResponse.json({ 
    lead: {
      id: lead.id,
      first_name: lead.first_name,
      last_name: lead.last_name,
      email: lead.email,
      status: lead.lead_score ? 'active' : 'active' // Map lead_score to status if needed
    }, 
    items, 
    gmailUrl 
  })
}
