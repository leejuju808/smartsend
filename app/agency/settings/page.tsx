import { getServerSupabase } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { WhiteLabelSettingsClient } from "./WhiteLabelSettingsClient";

export const metadata = {
  title: "White-Label Settings | Agency Dashboard",
  description: "Configure white-label branding for your agency",
};

export default async function WhiteLabelSettingsPage() {
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

  const agency = agencies[0];

  // Get white-label settings
  const { data: settings, error: settingsError } = await supabase
    .from("white_label_settings")
    .select("*")
    .eq("agency_id", agency.agency_id)
    .single();

  // Get agency details
  const { data: agencyData, error: agencyError } = await supabase
    .from("agencies")
    .select("*")
    .eq("id", agency.agency_id)
    .single();

  return (
    <WhiteLabelSettingsClient
      agencyId={agency.agency_id}
      agency={agencyData}
      settings={settings}
    />
  );
}



























