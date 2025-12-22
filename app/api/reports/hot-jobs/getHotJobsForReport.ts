import { SupabaseClient } from "@supabase/supabase-js";

export type HotJobReportRow = {
  job_id: string;
  homeowner_name: string | null;
  homeowner_email: string | null;
  status: string | null;
  latest_score: number | null;
  score_bucket: "hot" | "warm" | "cold" | null;
  last_calculated_at: string | null;
  created_at: string;
};

export async function getHotJobsForReport(
  supabase: SupabaseClient,
  orgId: string
): Promise<HotJobReportRow[]> {
  const { data, error } = await supabase
    .from("roofing_jobs_with_health")
    .select(
      "job_id, homeowner_name, homeowner_email, status, latest_score, score_bucket, last_calculated_at, created_at"
    )
    .eq("org_id", orgId)
    .eq("score_bucket", "hot")
    .order("latest_score", { ascending: false });

  if (error) {
    console.error("Failed to fetch hot jobs for report", error);
    return [];
  }

  return (data ?? []) as HotJobReportRow[];
}















































