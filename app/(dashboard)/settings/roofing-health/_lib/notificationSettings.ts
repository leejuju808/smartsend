import { SupabaseClient } from "@supabase/supabase-js";

export type RoofingHealthSettings = {
  weekly_hot_jobs_enabled: boolean;
  weekly_hot_jobs_email: string | null;
  hot_threshold: number;
  warm_threshold: number;
  include_weekly_csv: boolean;
  fast_estimate_url?: string | null;
};

export async function fetchRoofingHealthSettings(
  supabase: SupabaseClient,
  orgId: string
): Promise<RoofingHealthSettings> {
  const { data, error } = await supabase
    .from("organization_notification_settings")
    .select(
      "weekly_hot_jobs_enabled, weekly_hot_jobs_email, hot_threshold, warm_threshold, include_weekly_csv, fast_estimate_url"
    )
    .eq("org_id", orgId)
    .maybeSingle();

  if (error) {
    console.error("Failed to fetch notification settings", error);
  }

  if (!data) {
    // sensible defaults
    return {
      weekly_hot_jobs_enabled: true,
      weekly_hot_jobs_email: null,
      hot_threshold: 75,
      warm_threshold: 40,
      include_weekly_csv: false,
      fast_estimate_url: null,
    };
  }

  return {
    weekly_hot_jobs_enabled: data.weekly_hot_jobs_enabled ?? true,
    weekly_hot_jobs_email: data.weekly_hot_jobs_email ?? null,
    hot_threshold: data.hot_threshold ?? 75,
    warm_threshold: data.warm_threshold ?? 40,
    include_weekly_csv: data.include_weekly_csv ?? false,
    fast_estimate_url: data.fast_estimate_url ?? null,
  };
}

export async function saveRoofingHealthSettings(
  supabase: SupabaseClient,
  orgId: string,
  settings: RoofingHealthSettings
) {
  const { error } = await supabase
    .from("organization_notification_settings")
    .upsert(
      {
        org_id: orgId,
        weekly_hot_jobs_enabled: settings.weekly_hot_jobs_enabled,
        weekly_hot_jobs_email: settings.weekly_hot_jobs_email,
        hot_threshold: settings.hot_threshold,
        warm_threshold: settings.warm_threshold,
        include_weekly_csv: settings.include_weekly_csv,
        fast_estimate_url: settings.fast_estimate_url,
      },
      { onConflict: "org_id" }
    );

  if (error) {
    console.error("Failed to save notification settings", error);
    throw error;
  }
}

