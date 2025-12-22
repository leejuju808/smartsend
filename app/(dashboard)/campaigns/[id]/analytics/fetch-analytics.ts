// Server-side function to fetch campaign analytics
// This mirrors the API route logic but uses Supabase server client directly

import { createClient } from "@/utils/supabase/server";
import { CampaignAnalytics } from "./types";

export async function fetchCampaignAnalytics(
  campaignId: string
): Promise<CampaignAnalytics> {
  const supabase = createClient();

  // Get campaign with sequence_id
  const { data: campaign, error: campaignError } = await supabase
    .from("campaigns")
    .select("id, name, workspace_id, sequence_id")
    .eq("id", campaignId)
    .single();

  if (campaignError || !campaign) {
    throw new Error("Campaign not found");
  }

  // 1. Summary Stats
  const { count: emailsSentCount } = await supabase
    .from("send_queue")
    .select("*", { count: "exact", head: true })
    .eq("campaign_id", campaignId)
    .in("status", ["sent", "completed"]);

  const emailsSent = emailsSentCount || 0;

  // Total contacts targeted
  const { count: totalContacts } = await supabase
    .from("campaign_leads")
    .select("*", { count: "exact", head: true })
    .eq("campaign_id", campaignId);

  let contactsCount = totalContacts || 0;
  if (contactsCount === 0) {
    const { count: altCount } = await supabase
      .from("campaign_contacts")
      .select("*", { count: "exact", head: true })
      .eq("campaign_id", campaignId);
    contactsCount = altCount || 0;
  }

  // Replies
  const { count: repliesCount } = await supabase
    .from("reply_threads")
    .select("*", { count: "exact", head: true })
    .eq("campaign_id", campaignId);

  // Unique replies
  const { count: uniqueRepliesCount } = await supabase
    .from("reply_threads")
    .select("lead_id", { count: "exact", head: true })
    .eq("campaign_id", campaignId);

  // HOT leads
  const { count: hotLeadsCount } = await supabase
    .from("reply_threads")
    .select("*", { count: "exact", head: true })
    .eq("campaign_id", campaignId)
    .eq("latest_intent", "hot");

  // WARM leads
  const { count: warmLeadsCount } = await supabase
    .from("reply_threads")
    .select("*", { count: "exact", head: true })
    .eq("campaign_id", campaignId)
    .eq("latest_intent", "warm");

  const replies = repliesCount || 0;
  const uniqueReplies = uniqueRepliesCount || 0;
  const hotLeads = hotLeadsCount || 0;
  const warmLeads = warmLeadsCount || 0;

  // Calculate rates
  const replyRate = emailsSent > 0 ? (replies / emailsSent) * 100 : 0;
  const hotRate = emailsSent > 0 ? (hotLeads / emailsSent) * 100 : 0;
  const warmRate = emailsSent > 0 ? (warmLeads / emailsSent) * 100 : 0;

  // Estimate requests and jobs won
  const { count: estimateRequestsCount } = await supabase
    .from("campaign_members")
    .select("lead_id", { count: "exact", head: true })
    .eq("campaign_id", campaignId);

  // Get contacts with estimate_booked and is_customer
  const { data: campaignMembers } = await supabase
    .from("campaign_members")
    .select("lead_id")
    .eq("campaign_id", campaignId);

  let estimateRequests = 0;
  let jobsWon = 0;
  let estimatedRevenue = 0;

  if (campaignMembers && campaignMembers.length > 0) {
    const leadIds = campaignMembers.map((cm) => cm.lead_id);
    const { data: contacts } = await supabase
      .from("contacts")
      .select("id, estimate_booked, is_customer, job_value")
      .in("id", leadIds);

    estimateRequests = contacts?.filter((c) => c.estimate_booked).length || 0;
    jobsWon = contacts?.filter((c) => c.is_customer).length || 0;
    estimatedRevenue =
      contacts
        ?.filter((c) => c.is_customer && c.job_value)
        .reduce((sum, c) => sum + Number(c.job_value || 0), 0) || 0;
  }

  const summary = {
    totalContacts: contactsCount,
    delivered: emailsSent,
    replies,
    uniqueHotLeads: hotLeads,
    warmLeads: warmLeads,
    estimateRequests,
    jobsWon,
    estimatedRevenue,
    replyRate: Math.round(replyRate * 100) / 100,
    hotRate: Math.round(hotRate * 100) / 100,
    warmRate: Math.round(warmRate * 100) / 100,
  };

  // 2. Step-Level Performance
  let steps: CampaignAnalytics["steps"] = [];

  if (campaign.sequence_id) {
    const { data: sequenceSteps } = await supabase
      .from("sequence_steps")
      .select("id, step_number, position, subject_template, body_template")
      .eq("sequence_id", campaign.sequence_id)
      .order("position", { ascending: true })
      .order("step_number", { ascending: true });

    if (sequenceSteps && sequenceSteps.length > 0) {
      steps = await Promise.all(
        sequenceSteps.map(async (step) => {
          const stepId = step.id;
          const stepNo = step.step_number || step.position || 0;

          let stepSent = 0;
          const { count: stepSentById } = await supabase
            .from("send_queue")
            .select("*", { count: "exact", head: true })
            .eq("campaign_id", campaignId)
            .in("status", ["sent", "completed"])
            .eq("step_id", stepId);

          if (stepSentById !== null && stepSentById > 0) {
            stepSent = stepSentById;
          } else {
            const { count: stepSentByNo } = await supabase
              .from("send_queue")
              .select("*", { count: "exact", head: true })
              .eq("campaign_id", campaignId)
              .in("status", ["sent", "completed"])
              .eq("step_no", stepNo);
            stepSent = stepSentByNo || 0;
          }

          const { count: stepReplies } = await supabase
            .from("reply_threads")
            .select("*", { count: "exact", head: true })
            .eq("campaign_id", campaignId);

          const { count: stepHot } = await supabase
            .from("reply_threads")
            .select("*", { count: "exact", head: true })
            .eq("campaign_id", campaignId)
            .eq("latest_intent", "hot");

          const { count: stepWarm } = await supabase
            .from("reply_threads")
            .select("*", { count: "exact", head: true })
            .eq("campaign_id", campaignId)
            .eq("latest_intent", "warm");

          const sent = stepSent || 0;
          const replies = stepReplies || 0;
          const hot = stepHot || 0;
          const warm = stepWarm || 0;

          return {
            stepId: step.id,
            stepName: `Step ${stepNo + 1}: ${step.subject_template || "Email"}`,
            stepNo: stepNo + 1,
            deliveries: sent,
            replies,
            hotLeads: hot,
            warmLeads: warm,
            replyRate: sent > 0 ? Math.round((replies / sent) * 10000) / 100 : 0,
            hotRate: sent > 0 ? Math.round((hot / sent) * 10000) / 100 : 0,
            warmRate: sent > 0 ? Math.round((warm / sent) * 10000) / 100 : 0,
            customers: 0,
            revenue: 0,
          };
        })
      );
    }
  }

  if (steps.length === 0) {
    steps = [
      {
        stepId: null,
        stepName: "Step 1: Opener",
        stepNo: 1,
        deliveries: emailsSent,
        replies,
        hotLeads: hotLeads,
        warmLeads: warmLeads,
        replyRate: Math.round(replyRate * 100) / 100,
        hotRate: Math.round(hotRate * 100) / 100,
        warmRate: Math.round(warmRate * 100) / 100,
        customers: jobsWon,
        revenue: estimatedRevenue,
      },
    ];
  }

  // 3. Contact Outcomes
  const { data: campaignLeads } = await supabase
    .from("campaign_leads")
    .select("lead_id")
    .eq("campaign_id", campaignId)
    .limit(1000);

  const leadIds = campaignLeads?.map((cl) => cl.lead_id) || [];

  let contactIds: string[] = leadIds;
  if (contactIds.length === 0) {
    const { data: campaignContacts } = await supabase
      .from("campaign_contacts")
      .select("contact_id")
      .eq("campaign_id", campaignId)
      .limit(1000);
    contactIds = campaignContacts?.map((cc) => cc.contact_id) || [];
  }

  const contacts = await Promise.all(
    contactIds.slice(0, 500).map(async (contactId) => {
      const { data: contact } = await supabase
        .from("contacts")
        .select("id, email, first_name, last_name, is_customer, estimate_booked, job_value")
        .eq("id", contactId)
        .single();

      let contactData = contact;
      if (!contactData) {
        const { data: altContact } = await supabase
          .from("leads")
          .select("id, email, first_name, last_name")
          .eq("id", contactId)
          .single();
        contactData = altContact;
      }

      if (!contactData) {
        return null;
      }

      const { data: thread } = await supabase
        .from("reply_threads")
        .select("id, latest_intent, last_message_at, latest_message_id")
        .eq("campaign_id", campaignId)
        .eq("lead_id", contactId)
        .single();

      const replied = !!thread;
      const latestIntent = thread?.latest_intent || "unclassified";
      const lastActivity = thread?.last_message_at || null;

      const { count: replyCount } = await supabase
        .from("reply_threads")
        .select("*", { count: "exact", head: true })
        .eq("campaign_id", campaignId)
        .eq("lead_id", contactId);

      // Get step they replied to
      let replyStepId: number | null = null;
      if (thread?.latest_message_id) {
        const { data: message } = await supabase
          .from("messages")
          .select("campaign_step_id")
          .eq("id", thread.latest_message_id)
          .single();

        if (message?.campaign_step_id) {
          const { data: campaignStep } = await supabase
            .from("campaign_steps")
            .select("step_no")
            .eq("id", message.campaign_step_id)
            .single();

          if (campaignStep) {
            replyStepId = campaignStep.step_no;
          }
        }
      }

      // Determine outcome
      let outcome = "No Reply";
      const contact = contactData as any;
      if (contact?.is_customer) {
        outcome = "Customer";
      } else if (contact?.estimate_booked) {
        outcome = "Estimate Booked";
      } else if (latestIntent === "hot") {
        outcome = "Hot Lead";
      } else if (latestIntent === "warm") {
        outcome = "Warm Lead";
      } else if (replied) {
        outcome = "Replied";
      }

      return {
        contactId: contactData.id,
        name: `${contactData.first_name || ""} ${contactData.last_name || ""}`.trim() || "Unknown",
        email: contactData.email || "",
        status: replied ? "replied" : "not_replied",
        latestIntent,
        replied,
        lastActivity: lastActivity || null,
        repliesCount: replyCount || 0,
        replyStepName: replyStepId ? `Step ${replyStepId}` : null,
        stepReplied: replyStepId,
        outcome,
        revenue: contact?.is_customer ? Number(contact?.job_value || 0) : null,
      };
    })
  );

  const validContacts = contacts.filter((c) => c !== null) as CampaignAnalytics["contacts"];

  // Outcome distribution
  const { data: allThreads } = await supabase
    .from("reply_threads")
    .select("latest_intent, lead_id")
    .eq("campaign_id", campaignId);

  const outcomeDistribution = {
    hot: allThreads?.filter((t) => t.latest_intent === "hot").length || 0,
    warm: allThreads?.filter((t) => t.latest_intent === "warm").length || 0,
    notInterested: allThreads?.filter((t) => t.latest_intent === "not_interested").length || 0,
    noReply: contactsCount - (allThreads?.length || 0),
    customer: jobsWon,
  };

  return {
    summary,
    steps,
    contacts: validContacts,
    outcomeDistribution,
  };
}

