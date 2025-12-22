// Block 24580 — SmartSend Roofing Neighborhood Heatmap v1
// Page: /dashboard/heatmap

import { redirect } from "next/navigation";
import { getServerSupabase } from "@/lib/supabase/server";
import { getActiveWorkspaceId } from "@/lib/workspace/context";
import { NeighborhoodHeatmap } from "@/components/heatmap/NeighborhoodHeatmap";

export const metadata = {
  title: "Neighborhood Heatmap | SmartSend",
  description: "See where your roofing leads are coming from with geographic intelligence",
};

export default async function HeatmapPage() {
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
    <div className="flex flex-col gap-6 p-6 max-w-7xl mx-auto">
      <header className="flex items-center justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-bold tracking-tight">
            Neighborhood Heatmap
          </h1>
          <p className="text-sm text-muted-foreground">
            See where the money is coming from. Identify high-ROI neighborhoods, storm impact zones, and optimize your targeting.
          </p>
        </div>
      </header>

      <NeighborhoodHeatmap workspaceId={workspaceId} />
    </div>
  );
}






































