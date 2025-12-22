// hooks/useTasks.ts
import useSWR from "swr";

export function useTasks(status: "open" | "completed" = "open") {
  const { data, error, mutate } = useSWR(
    `/api/tasks?status=${status}`,
    (url) => fetch(url).then((r) => r.json())
  );

  return {
    tasks: data || [],
    loading: !data && !error,
    error,
    refresh: mutate,
  };
}
















