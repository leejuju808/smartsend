import { NextResponse } from "next/server"
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs"
import { cookies } from "next/headers"

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const supabase = createRouteHandlerClient({ cookies })
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

  const { subject, body, tone, length } = await req.json()
  // Ensure ownership via join on templates
  const { data: t, error: terr } = await supabase.from("templates").select("id,user_id").eq("id", params.id).maybeSingle()
  if (terr || !t || t.user_id !== user.id) return NextResponse.json({ error: "not_found" }, { status: 404 })

  const { error } = await supabase.from("template_variants").insert({ template_id: t.id, subject, body, tone, length })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

