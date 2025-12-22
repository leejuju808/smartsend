import LeadThreadClient from "./thread.client"
import { getServerSupabase } from "@/lib/supabase/server"
import { notFound } from "next/navigation"

export default async function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const supabase = getServerSupabase()
  const { id } = await params
  const leadId = id

  // Fetch contact details - using contacts table
  const { data: lead } = await supabase
    .from("contacts")
    .select("id, first_name, last_name, email, lead_score")
    .eq("id", leadId)
    .single()
  
  if (!lead) return notFound()

  return <LeadThreadClient leadId={lead.id} />
}
