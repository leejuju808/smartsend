// Block 14900 — Lead Pipeline Board v1
// Hook for loading pipeline board data

import useSWR from "swr";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function usePipelineBoard() {
  const { data, error, mutate } = useSWR("/api/pipeline", fetcher);

  return {
    stages: data?.stages || [],
    contactsByStage: data?.contactsByStage || {},
    loading: !data && !error,
    error,
    refresh: mutate,
  };
}
















