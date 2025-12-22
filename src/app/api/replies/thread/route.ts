import { NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import { createServerClient } from "@supabase/ssr"

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id")
  if (!id) return NextResponse.json({ error: "missing id" }, { status: 400 })

  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { 
      cookies: {
        get: (name: string) => cookieStore.get(name)?.value,
        set: () => {},
        remove: () => {}
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  // authorize via join to threads
  const { data: msgs, error } = await supabase
    .from("messages")
    .select("id, direction, from_email, to_email, subject, body_text, body_html, created_at, thread_id, threads!inner(user_id)")
    .eq("thread_id", id)
    .order("created_at", { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!msgs?.length || (msgs[0].threads as any).user_id !== user.id) return NextResponse.json({ error: "Not found" }, { status: 404 })

  // strip join field
  const safe = msgs.map(({ threads, ...m }) => m)
  return NextResponse.json({ messages: safe })
}

