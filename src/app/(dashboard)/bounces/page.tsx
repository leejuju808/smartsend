import { redirect } from "next/navigation"
import { getServerSupabase } from "@/lib/supabase/server"
import BouncesClient from "./bounces.client"

export default async function BouncesPage() {
  const supabase = getServerSupabase()
  
  // Get user session
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) {
    redirect("/login")
  }

  // Fetch bounces
  const { data: bounces, error } = await supabase
    .from("bounces")
    .select(`
      id,
      created_at,
      bounce_type,
      reason,
      raw_snippet,
      provider,
      thread_id,
      leads!inner(
        id,
        email,
        first_name,
        last_name,
        status
      )
    `)
    .order("created_at", { ascending: false })
    .limit(100)

  if (error) {
    console.error("Error fetching bounces:", error)
  }

  return <BouncesClient initialBounces={bounces || []} />
}
