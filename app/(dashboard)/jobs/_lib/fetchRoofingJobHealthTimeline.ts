import { SupabaseClient } from "@supabase/supabase-js";

export type RoofingHealthTimelineEvent = {
  id: string;
  source_event_type: string;
  title: string;
  description: string | null;
  latest_score: number;
  score_bucket: "hot" | "warm" | "cold";
  created_at: string;
};

export async function fetchRoofingJobHealthTimeline(
  supabase: SupabaseClient,
  orgId: string,
  jobId: string
): Promise<RoofingHealthTimelineEvent[]> {
  const { data, error } = await supabase
    .from("roofing_job_health_timeline")
    .select(
      "id, source_event_type, title, description, latest_score, score_bucket, created_at"
    )
    .eq("org_id", orgId)
    .eq("job_id", jobId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Failed to fetch roofing job health timeline", error);
    return [];
  }

  return data ?? [];
}















































