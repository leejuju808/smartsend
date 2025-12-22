// Block 16600 — SmartSend Activity Log v2
// React Hook for fetching activity logs

"use client";

import useSWR from "swr";
import { ActivityLog } from "@/components/activity/ActivityFeed";

interface UseActivityLogsOptions {
  contactId?: string;
  category?: string;
  type?: string;
  severity?: string;
  pipelineStage?: string;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
  cursor?: string;
}

interface ActivityLogsResponse {
  logs: ActivityLog[];
  pagination: {
    hasMore: boolean;
    nextCursor: string | null;
    limit: number;
  };
  contact?: {
    id: string;
    email: string;
    name: string;
  };
}

const fetcher = async (url: string): Promise<ActivityLogsResponse> => {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error("Failed to fetch activity logs");
  }
  return res.json();
};

export function useActivityLogs(options: UseActivityLogsOptions = {}) {
  const {
    contactId,
    category,
    type,
    severity,
    pipelineStage,
    dateFrom,
    dateTo,
    limit = 50,
    cursor,
  } = options;

  // Build query string
  const params = new URLSearchParams();
  if (category) params.append("category", category);
  if (type) params.append("type", type);
  if (severity) params.append("severity", severity);
  if (pipelineStage) params.append("pipeline_stage", pipelineStage);
  if (dateFrom) params.append("date_from", dateFrom);
  if (dateTo) params.append("date_to", dateTo);
  if (limit) params.append("limit", limit.toString());
  if (cursor) params.append("cursor", cursor);
  if (contactId) params.append("contact_id", contactId);

  const url = contactId
    ? `/api/contacts/${contactId}/activity-v2?${params.toString()}`
    : `/api/activity?${params.toString()}`;

  const { data, error, isLoading, mutate } = useSWR<ActivityLogsResponse>(
    url,
    fetcher,
    {
      revalidateOnFocus: false,
      revalidateOnReconnect: true,
    }
  );

  return {
    logs: data?.logs || [],
    pagination: data?.pagination,
    contact: data?.contact,
    loading: isLoading,
    error,
    mutate,
  };
}





















































