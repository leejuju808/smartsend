import useSWR from "swr";

export function useRevenueByCampaign() {
  const { data, error } = useSWR("/api/dashboard/revenue-by-campaign", (url) =>
    fetch(url).then((r) => r.json())
  );

  return {
    campaigns: data || [],
    loading: !data && !error,
    error,
  };
}
















