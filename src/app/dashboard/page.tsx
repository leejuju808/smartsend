import { redirect } from "next/navigation";
import { getServerSupabase } from "@/lib/supabase/server";

export default async function DashboardPage() {
  // BLOCK 272700 — Lock-In Sprint
  // One-path daily execution: the dashboard always opens to the system-decided queue.
  const supabase = await getServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  redirect("/dashboard/daily");
}
