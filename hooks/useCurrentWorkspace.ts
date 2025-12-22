import useSWR from "swr";

export interface WorkspaceBillingInfo {
  id: string;
  name: string;
  plan_key: string;
  email_limit_monthly: number;
  email_used_this_period: number;
  billing_period_ends_at: string | null;
  plan_emails_sent_this_period?: number;
  plan_period_start?: string | null;
  plan_period_end?: string | null;
  stripe_subscription_id: string | null;
}

export interface CurrentWorkspaceResponse {
  workspace: WorkspaceBillingInfo;
  role: string;
}

export function useCurrentWorkspace() {
  const { data, error, mutate } = useSWR<CurrentWorkspaceResponse>(
    "/api/workspace/current",
    (url) => fetch(url).then((r) => r.json())
  );

  return {
    workspace: data?.workspace,
    role: data?.role,
    loading: !data && !error,
    error,
    refresh: mutate,
  };
}

