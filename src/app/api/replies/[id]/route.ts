import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { get: (name) => cookieStore.get(name)?.value } }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  // First, get the Gmail message_id and user_id from the reply
  const { data: reply } = await supabase
    .from("email_replies")
    .select("provider_message_id, email_log_id, email_log:email_logs(user_id)")
    .eq("id", params.id)
    .single()

  if (!reply?.provider_message_id) {
    return NextResponse.json({ error: "No Gmail message ID found" }, { status: 404 })
  }

  // Get user_id from email_log or use current user
  const userId = (reply.email_log as any)?.user_id || user.id

  // Invoke Edge Function to get the full thread
  const { data, error } = await supabase.functions.invoke("get-thread", {
    body: { user_id: userId, message_id: reply.provider_message_id }
  })
  
  if (error) return NextResponse.json({ error: String(error) }, { status: 500 })

  return NextResponse.json(data)
}

