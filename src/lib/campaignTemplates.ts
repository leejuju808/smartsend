import type { SupabaseClient } from "@supabase/supabase-js";

type LeadLike = {
  email: string;
  first_name?: string | null;
  last_name?: string | null;
  company?: string | null;
  title?: string | null;
};

export interface CampaignTemplate {
  id: string;
  campaign_id: string;
  name: string;
  variant: string;
  weight: number;
  subject: string;
  body_text: string | null;
  body_html: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Render template string with merge fields
 */
export function renderTemplate(str: string, lead: LeadLike): string {
  const dict: Record<string, string> = {
    first_name: lead.first_name || "",
    last_name: lead.last_name || "",
    company: lead.company || "",
    title: lead.title || "",
    email: lead.email || "",
  };
  
  return str.replace(/\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g, (_, k) => dict[k] ?? "");
}

/**
 * Pick an item from an array using weighted random selection
 */
export function weightedPick<T extends { weight?: number }>(items: T[]): T | null {
  if (!items.length) return null;
  const total = items.reduce((a, b) => a + (b.weight ?? 1), 0);
  if (total === 0) return items[0];
  
  let r = Math.random() * total;
  for (const it of items) {
    r -= (it.weight ?? 1);
    if (r <= 0) return it;
  }
  return items[items.length - 1];
}

/**
 * Fetch active templates for a campaign
 */
export async function getCampaignTemplates(
  supabase: SupabaseClient,
  campaignId: string
): Promise<CampaignTemplate[]> {
  const { data, error } = await supabase
    .from("campaign_email_templates")
    .select("*")
    .eq("campaign_id", campaignId)
    .eq("is_active", true);
  
  if (error) {
    console.error("Error fetching campaign templates:", error);
    return [];
  }
  
  return (data ?? []) as CampaignTemplate[];
}

/**
 * Merge and select a template for sending
 */
export function selectAndRenderTemplate(
  templates: CampaignTemplate[],
  lead: LeadLike
): { subject: string; text: string | undefined; html: string | undefined; templateId: string } | null {
  if (!templates.length) return null;
  
  const template = weightedPick(templates);
  if (!template) return null;
  
  return {
    subject: renderTemplate(template.subject, lead),
    text: template.body_text ? renderTemplate(template.body_text, lead) : undefined,
    html: template.body_html ? renderTemplate(template.body_html, lead) : undefined,
    templateId: template.id
  };
}
