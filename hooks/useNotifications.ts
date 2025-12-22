// Block 14800 — Hot Lead Alerts v1
// Hook for fetching and managing notifications

import useSWR from "swr";

export function useNotifications() {
  const { data, error, mutate } = useSWR("/api/notifications", (url) =>
    fetch(url).then((r) => r.json())
  );

  return {
    notifications: data || [],
    loading: !data && !error,
    error,
    refresh: mutate,
  };
}
















