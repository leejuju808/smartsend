import { SupabaseClient } from "@supabase/supabase-js";

export type RoofingJobRow = {
  job_id: string;
  org_id: string;
  homeowner_name: string | null;
  homeowner_email: string | null;
  homeowner_phone: string | null;
  status: string | null;
  created_at: string;
  updated_at: string;

  latest_score: number | null;
  score_bucket: "hot" | "warm" | "cold" | null;
  last_calculated_at: string | null;

  // Block 273600 — Cash Certainty
  cash_awaiting_payment_amount: number | null;
  cash_days_until_expected: number | null;
  cash_is_stalled: boolean | null;
};

export async function fetchRoofingJobsWithHealth(
  supabase: SupabaseClient,
  orgId: string,
  sortBy: "created_at" | "latest_score" = "latest_score",
  bucketFilter?: "hot" | "warm" | "cold"
): Promise<RoofingJobRow[]> {
  let query = supabase
    .from("roofing_jobs_with_health")
    .select(
      "job_id, org_id, homeowner_name, homeowner_email, homeowner_phone, status, created_at, updated_at, latest_score, score_bucket, last_calculated_at, cash_awaiting_payment_amount, cash_days_until_expected, cash_is_stalled"
    )
    .eq("org_id", orgId);

  if (bucketFilter) {
    query = query.eq("score_bucket", bucketFilter);
  }

  if (sortBy === "latest_score") {
    query = query.order("latest_score", { ascending: false, nullsFirst: false });
  } else {
    query = query.order("created_at", { ascending: false });
  }

  const { data, error } = await query;

  if (error) {
    console.error("Failed to fetch roofing jobs with health", error);
    return [];
  }

  return data ?? [];
}

