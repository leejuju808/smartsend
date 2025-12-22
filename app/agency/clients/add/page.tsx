import { getServerSupabase } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { AddCompanyWizard } from "./AddCompanyWizard";

export const metadata = {
  title: "Add Company | Agency Dashboard",
  description: "Onboard a new roofing company client",
};

export default async function AddCompanyPage() {
  const supabase = await getServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Get user's agencies
  const { data: agencies, error: agenciesError } = await supabase
    .rpc("get_user_agencies", { p_user_id: user.id });

  if (agenciesError || !agencies || agencies.length === 0) {
    redirect("/agency/create");
  }

  // For now, use the first agency
  const agency = agencies[0];

  return <AddCompanyWizard agencyId={agency.agency_id} />;
}



























