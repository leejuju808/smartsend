import { redirect } from "next/navigation";
import { getServerSupabase } from "@/lib/supabase/server";
import HomePageClient from "./page-client";

export default async function HomePage() {
  const supabase = await getServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();

  // Redirect logged-in users to dashboard
  if (user) {
    // BLOCK 271000 — Default Reality Sprint
    // Logged-in users should land on the single daily operating screen.
    redirect("/dashboard/daily");
  }

  return <HomePageClient />;
}
