import useSWR from "swr";
import type { LeadListResponse } from "@/types/leads_list";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function useLeadsList(params: {
  status?: string;
  campaignId?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  pageSize?: number;
}) {
  const sp = new URLSearchParams(
    Object.fromEntries(
      Object.entries({
        ...params,
        page: params.page?.toString(),
        pageSize: params.pageSize?.toString(),
      })
        .filter(([, v]) => v != null && v !== "")
        .map(([k, v]) => [k, String(v)])
    )
  );

  const { data, error, isLoading, mutate } = useSWR<LeadListResponse>(
    `/api/leads?${sp.toString()}`,
    fetcher
  );

  return { data, error, isLoading, mutate };
}

