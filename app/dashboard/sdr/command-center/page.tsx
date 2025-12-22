import { createClient } from "@/utils/supabase/server";
import { CommandCenterBoard } from "./CommandCenterBoard";

export default async function CommandCenterPage({
  searchParams,
}: {
  searchParams: {
    q?: string;
    stage?: string;
    intent?: string;
    hot?: string;
  };
}) {
  const supabase = createClient();

  const { q, stage, intent, hot } = searchParams;

  let query = supabase
    .from("sdr_command_center_view")
    .select("*")
    .order("conversion_score", { ascending: false })
    .limit(200);

  if (stage && stage !== "all") {
    query = query.eq("pipeline_stage", stage);
  }

  if (intent && intent !== "all") {
    query = query.eq("intent_label", intent);
  }

  // "hot=1" = high score and recent activity
  if (hot === "1") {
    const now = new Date();
    const recentIso = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    query = query
      .gte("conversion_score", 40)
      .gte("last_activity_at", recentIso);
  }

  if (q && q.trim()) {
    const search = q.trim();
    query = query.or(
      `email.ilike.%${search}%,first_name.ilike.%${search}%,last_name.ilike.%${search}%,company.ilike.%${search}%`,
    );
  }

  const { data: rows, error } = await query;

  if (error) {
    console.error("Command center query error", error);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-lg font-semibold tracking-tight">
          SDR Command Center
        </h1>
        <p className="text-xs text-muted-foreground">
          AI SDR + live replies in one place
        </p>
      </div>

      <CommandCenterBoard rows={rows ?? []} />
    </div>
  );
}

