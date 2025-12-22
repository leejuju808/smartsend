import useSWR from "swr";

export type CampaignTemplate = {
  id: string;
  key?: string;
  slug?: string;
  name: string;
  industry?: string;
  niche?: string;
  goal: string;
  description?: string | null;
  audience_hint?: string | null;
  short_description?: string | null;
  recommended_plan?: string | null;
  recommended_steps?: number;
  is_active?: boolean;
  created_at?: string;
};

export function useCampaignTemplates() {
  const { data, error } = useSWR<{ templates: CampaignTemplate[] }>(
    "/api/campaign-templates",
    (url) => fetch(url).then((r) => r.json())
  );

  return {
    templates: data?.templates || [],
    loading: !data && !error,
    error,
  };
}

