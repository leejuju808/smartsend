import useSWR from "swr";

export interface WorkspaceProfile {
  id: string;
  workspace_id: string;
  company_name: string | null;
  niche: string;
  primary_city: string | null;
  service_area: string | null;
  typical_job_types: string | null;
  avg_job_value: number | null;
  tone_style: string;
  created_at: string;
  updated_at: string;
}

export interface WorkspaceProfileResponse {
  workspace_id: string;
  profile: WorkspaceProfile | null;
}

export function useWorkspaceProfile() {
  const { data, error, mutate } = useSWR<WorkspaceProfileResponse>(
    "/api/workspace/profile",
    (url) => fetch(url).then((r) => r.json())
  );

  return {
    workspaceId: data?.workspace_id as string | undefined,
    profile: data?.profile || null,
    loading: !data && !error,
    error,
    refresh: mutate,
  };
}



























































