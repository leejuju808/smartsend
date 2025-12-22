import useSWR from "swr";

export type CampaignTemplate = {
  id: string;
  slug: string;
  name: string;
  niche: string;
  goal: string;
  description: string | null;
  recommended_steps: number;
  is_active: boolean;
  created_at: string;
};

export type CampaignTemplateStep = {
  id: string;
  template_id: string;
  step_order: number;
  delay_days: number;
  subject_template: string;
  body_template: string;
  created_at: string;
};

export type CampaignTemplateWithSteps = {
  template: CampaignTemplate;
  steps: CampaignTemplateStep[];
};

export function useCampaignTemplate(slug: string | null) {
  const { data, error } = useSWR<CampaignTemplateWithSteps>(
    slug ? `/api/campaign-templates/${slug}` : null,
    (url) => fetch(url).then((r) => r.json())
  );

  return {
    template: data?.template,
    steps: data?.steps || [],
    loading: !data && !error,
    error,
  };
}



























































