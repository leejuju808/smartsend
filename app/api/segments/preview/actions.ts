"use server";

import { createClient } from "@/utils/supabase/server";
import { filterLeadsBySegment } from "@/utils/segments/filter";

export type SegmentPreviewLead = {
  id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  company: string | null;
  title: string | null;
  city: string | null;
  country: string | null;
};

export type SegmentPreview = {
  total: number;
  sample: SegmentPreviewLead[];
};

export async function getSegmentPreview(
  accountId: string,
  segmentId: string
): Promise<SegmentPreview> {
  const supabase = createClient();

  // Use the same helper as launchCampaign so preview matches actual targeting
  const leads = await filterLeadsBySegment(accountId, segmentId);

  const total = leads.length;
  const sample = (leads as any[])
    .slice(0, 20)
    .map((l) => ({
      id: l.id as string,
      email: (l.email as string) ?? null,
      first_name: (l.first_name as string) ?? null,
      last_name: (l.last_name as string) ?? null,
      company: (l.company as string) ?? null,
      title: (l.title as string) ?? null,
      city: (l.city as string) ?? null,
      country: (l.country as string) ?? null,
    }));

  return { total, sample };
}
