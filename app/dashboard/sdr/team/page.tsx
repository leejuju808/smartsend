import { createClient } from "@/utils/supabase/server";
import { SdrTeamBoard } from "./SdrTeamBoard";

export default async function SdrTeamPage() {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("sdr_user_performance_metrics")
    .select("*")
    .order("meetings_30d", { ascending: false });

  if (error) {
    console.error("sdr_user_performance_metrics error", error);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">
            SDR Team Performance
          </h1>
          <p className="text-xs text-muted-foreground">
            See how each rep performs across owned leads, replies, meetings, and AI usage.
          </p>
        </div>
      </div>

      <SdrTeamBoard rows={(data ?? []) as any[]} />
    </div>
  );
}

