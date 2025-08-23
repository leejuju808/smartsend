import { supabaseAdmin } from "@/server/supabase";

export default async function UsageBadge({ userId }: { userId: string }) {
  const { data: prof } = await supabaseAdmin.from("profiles")
    .select("team_id").eq("id", userId).maybeSingle();
  if (!prof?.team_id) return null;

  const { data: team } = await supabaseAdmin.from("teams")
    .select("current_period_start, current_period_end")
    .eq("id", prof.team_id).maybeSingle();

  const start = team?.current_period_start;
  const end = team?.current_period_end;

  let count = 0;
  if (start) {
    const { count: c } = await supabaseAdmin.from("ai_reply_events")
      .select("id", { count: "exact", head: true })
      .eq("team_id", prof.team_id)
      .gte("created_at", start)
      .lte("created_at", end || new Date().toISOString());
    count = c || 0;
  }

  return (
    <div className="text-xs px-2 py-1 rounded bg-blue-100 text-blue-800">
      {count} AI replies this period
    </div>
  );
} 