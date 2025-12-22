import { getServerSupabase } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { AgencyDashboardClient } from "./AgencyDashboardClient";

export const metadata = {
  title: "Agency Dashboard | SmartSend",
  description: "Master dashboard for managing all roofing company clients",
};

export default async function AgencyDashboardPage() {
  const supabase = await getServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Get user's agencies
  const { data: agencies, error: agenciesError } = await supabase
    .rpc("get_user_agencies", { p_user_id: user.id });

  if (agenciesError || !agencies || agencies.length === 0) {
    // No agencies - redirect to create agency or regular dashboard
    redirect("/dashboard");
  }

  // For now, use the first agency (later we'll add agency switching)
  const agency = agencies[0];

  // Get agency dashboard stats
  const { data: stats, error: statsError } = await supabase
    .rpc("get_agency_dashboard_stats", { p_agency_id: agency.agency_id });

  // Get agency companies
  const { data: companies, error: companiesError } = await supabase
    .rpc("get_agency_companies", { p_agency_id: agency.agency_id });

  return (
    <AgencyDashboardClient
      agency={agency}
      stats={stats?.[0] || null}
      companies={companies || []}
    />
  );
}



























