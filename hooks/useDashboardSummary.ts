// hooks/useDashboardSummary.ts
import useSWR from "swr";

export interface DashboardSummary {
  emails_sent: number;
  replies_received: number;
  hot_leads: number;
  warm_leads: number;
  booked_leads: number;
  won_leads: number;
  pipeline_events: number;
  notes_created: number;
}

export function useDashboardSummary() {
  const { data, error } = useSWR<DashboardSummary>(
    "/api/dashboard/summary",
    (url) => fetch(url).then((r) => r.json())
  );

  return {
    stats: data,
    loading: !data && !error,
    error,
  };
}



























































