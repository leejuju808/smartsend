import { NextResponse } from "next/server"
import { getServerSupabase } from "@/lib/supabase/server"

export async function POST(_: Request, { params }: { params: { id: string } }) {
  const supabase = getServerSupabase()
  const leadId = params.id

  const { data: lead, error: e1 } = await supabase.from("leads").select("status").eq("id", leadId).single()
  if (e1 || !lead) return NextResponse.json({ error: e1?.message || "Lead not found" }, { status: 404 })

  const nextStatus = lead.status === "Replied" ? "Active" : "Replied"
  const patch: any = { status: nextStatus }
  if (nextStatus === "Replied") patch.replied_at = new Date().toISOString()

  const { error: e2 } = await supabase.from("leads").update(patch).eq("id", leadId)
  if (e2) return NextResponse.json({ error: e2.message }, { status: 400 })

  return NextResponse.json({ ok: true, status: nextStatus })
}
