import { createServerClient } from "@/lib/supabaseServer";
import { fetchRoofingHealthSettings } from "./_lib/notificationSettings";
import { RoofingHealthSettingsForm } from "./components/RoofingHealthSettingsForm";
import { getCurrentOrgId } from "@/lib/org-helpers";

export default async function RoofingHealthSettingsPage() {
  const supabase = createServerClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const orgId = session?.user?.user_metadata?.org_id as string | undefined;
  
  // Fallback to getCurrentOrgId if user_metadata doesn't have org_id
  const finalOrgId = orgId || (await getCurrentOrgId());
  
  if (!finalOrgId) {
    return (
      <div className="p-4 text-sm text-red-400">
        Missing organization. Please contact support.
      </div>
    );
  }

  const settings = await fetchRoofingHealthSettings(supabase, finalOrgId);

  return (
    <div className="max-w-xl space-y-6 p-4">
      <div>
        <h1 className="text-base font-semibold text-zinc-50">
          Roofing Job Health Settings
        </h1>
        <p className="mt-1 text-sm text-zinc-400">
          Control how SmartSend scores roofing jobs and how often we email you
          about your hottest opportunities.
        </p>
      </div>

      <RoofingHealthSettingsForm orgId={finalOrgId} initialSettings={settings} />
    </div>
  );
}















































