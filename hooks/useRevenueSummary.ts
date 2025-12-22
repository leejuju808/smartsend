import useSWR from "swr";

export function useRevenueSummary() {
  const { data, error } = useSWR("/api/dashboard/revenue", (url) =>
    fetch(url).then((r) => r.json())
  );

  return {
    revenue: data,
    loading: !data && !error,
    error,
  };
}
















