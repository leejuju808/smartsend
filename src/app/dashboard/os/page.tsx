import { redirect } from "next/navigation";
import { getServerSupabase } from "@/lib/supabase/server";
import OSClient from "./ui/OSClient";

export default async function DashboardOSPage() {
  const supabase = await getServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  return <OSClient />;
}




