// Block 21878 — SmartSend Roofing Company Daily Command Center v1
// The One Screen Owners Check Every Morning — Default Homepage for Roofing Owners

import { redirect } from "next/navigation";
import { getServerSupabase } from "@/lib/supabase/server";
import { getActiveWorkspaceId } from "@/lib/workspace/context";
import { CompanyCommandCenter } from "@/components/dashboard/CompanyCommandCenter";

export default async function RoofingCommandCenterPage() {
  const supabase = await getServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) {
    redirect("/welcome");
  }

  return (
    <div className="min-h-screen bg-gray-950">
      <div className="max-w-7xl mx-auto">
        <header className="border-b border-gray-800 p-6">
          <h1 className="text-3xl font-bold text-white">
            Daily Command Center
          </h1>
          <p className="text-gray-400 mt-1">
            Your morning briefing — everything you need to know about your roofing business today
          </p>
        </header>
        <CompanyCommandCenter workspaceId={workspaceId} />
      </div>
    </div>
  );
}









































