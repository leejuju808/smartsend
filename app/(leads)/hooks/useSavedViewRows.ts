import useSWR from "swr";

export type SavedViewRow = {
  lead_id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  company_name: string | null;
  company_domain: string | null;
  company_employee_count: number | null;
  company_industry: string | null;
  company_category: string | null;
  tech_stack: unknown;
};

type SavedViewResponse = {
  rows: SavedViewRow[];
  error?: string;
};

export function useSavedViewRows(viewId?: string, limit = 100, offset = 0) {
  const key = viewId
    ? `/api/saved-views/${viewId}/query?limit=${limit}&offset=${offset}`
    : null;

  const { data, error, isLoading, mutate } = useSWR<SavedViewResponse>(
    key,
    async (url) => {
      const res = await fetch(url, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.error ?? "Failed to load saved view");
      }
      return json;
    }
  );

  return {
    rows: data?.rows ?? [],
    errorMessage: error instanceof Error ? error.message : data?.error,
    isLoading,
    mutate,
  };
}

