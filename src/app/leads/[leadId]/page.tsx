import LeadTimelineCard from "@/components/timeline/LeadTimelineCard";
import LeadReplyHistory from "@/components/replies/LeadReplyHistory";
import { SchedulePreviewBar } from "@/components/schedule-preview-bar";
import { LeadNotes } from "@/components/leads/notes";
import { ProbabilityExplanationCard } from "@/components/leads/ProbabilityExplanationCard";
import { LeadQualityCard } from "@/components/leads/LeadQualityCard";
import { getServerSupabase } from "@/lib/supabase/server";
import { notFound } from "next/navigation";

export default async function LeadPage({ params }: { params: Promise<{ leadId: string }> }) {
  const supabase = getServerSupabase();
  const { leadId } = await params;

  const { data: lead } = await supabase
    .from("leads")
    .select("id, email, name, tz, meta, job_probability, probability_explanation")
    .eq("id", leadId)
    .single();

  if (!lead) return notFound();

  const leadMeta = (lead.meta as Record<string, any> | null) ?? null;
  const leadTz: string | null = (lead.tz as string | null) ?? (leadMeta?.tz as string | null) ?? null;

  const { data: campaignLinks } = await supabase
    .from("campaign_leads")
    .select("campaign_id")
    .eq("lead_id", leadId)
    .limit(1);

  const primaryCampaignId = campaignLinks && campaignLinks.length > 0 ? campaignLinks[0]?.campaign_id : null;

  return (
    <div className="p-6 space-y-6">
      <div className="mb-4">
        <h1 className="text-2xl font-bold">{lead.name || lead.email}</h1>
        <p className="text-muted-foreground">{lead.email}</p>
      </div>

      {primaryCampaignId ? (
        <SchedulePreviewBar campaignId={primaryCampaignId} leadId={leadId} leadTz={leadTz} />
      ) : (
        <div className="rounded-2xl border bg-muted/30 p-4 text-sm text-muted-foreground">
          This lead is not currently assigned to a campaign.
        </div>
      )}

      {/* Block 34888: Lead Quality & Qualification */}
      <LeadQualityCard leadId={leadId} />

      {/* Block 21912: Job Probability Explainer */}
      {lead.job_probability !== null && lead.job_probability !== undefined && (
        <ProbabilityExplanationCard
          leadId={leadId}
          probability={lead.job_probability}
          explanation={lead.probability_explanation as any}
        />
      )}

      <LeadTimelineCard leadId={leadId} />
      <LeadReplyHistory leadId={leadId} />
      
      <div>
        <h2 className="text-xl font-semibold mb-4">Notes</h2>
        <LeadNotes leadId={leadId} />
      </div>
    </div>
  );
}

