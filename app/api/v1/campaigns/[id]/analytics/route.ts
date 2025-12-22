// GET /v1/campaigns/{id}/analytics - Campaign Analytics v2
// Block 11300 — Campaign Performance Dashboard v2
// Returns summary stats, step-level performance, lead outcomes, revenue estimates, and comparison

import { NextRequest, NextResponse } from "next/server";
import { withApiAuth, ApiError } from "@/lib/api/v1-auth";
import { createClient } from "@supabase/supabase-js";

export const GET = withApiAuth(async (req: NextRequest, auth) => {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const campaignId = req.nextUrl.pathname.split("/").pop();
  if (!campaignId) {
    throw new ApiError("400_INVALID_BODY", "Campaign ID is required");
  }

  // Verify campaign belongs to workspace
  const { data: campaign, error: campaignError } = await supabase
    .from("campaigns")
    .select("id, name, workspace_id, created_at")
    .eq("id", campaignId)
    .eq("workspace_id", auth.workspaceId)
    .single();

  if (campaignError || !campaign) {
    throw new ApiError("404_NOT_FOUND", "Campaign not found");
  }

  // Try to use campaign_totals_view if available, otherwise fallback to manual queries
  const { data: campaignTotals } = await supabase
    .from("campaign_totals_view")
    .select("*")
    .eq("campaign_id", campaignId)
    .single();

  let summary: any;
  
  if (campaignTotals) {
    // Use view data
    const delivered = campaignTotals.delivered || 0;
    const replies = campaignTotals.replies || 0;
    const replyRate = delivered > 0 ? (replies / delivered) * 100 : 0;
    const hotRate = delivered > 0 ? (campaignTotals.unique_hot_leads / delivered) * 100 : 0;
    const warmRate = delivered > 0 ? (campaignTotals.warm_leads / delivered) * 100 : 0;

    summary = {
      totalContacts: campaignTotals.total_contacts || 0,
      delivered: delivered,
      replies: replies,
      uniqueHotLeads: campaignTotals.unique_hot_leads || 0,
      warmLeads: campaignTotals.warm_leads || 0,
      estimateRequests: campaignTotals.estimate_requests || 0,
      jobsWon: campaignTotals.jobs_won || 0,
      estimatedRevenue: Number(campaignTotals.estimated_revenue || 0),
      replyRate: Math.round(replyRate * 100) / 100,
      hotRate: Math.round(hotRate * 100) / 100,
      warmRate: Math.round(warmRate * 100) / 100,
    };
  } else {
    // Fallback: manual queries
    const { count: emailsSentCount } = await supabase
      .from("send_queue")
      .select("*", { count: "exact", head: true })
      .eq("campaign_id", campaignId)
      .in("status", ["sent", "completed"]);

    const delivered = emailsSentCount || 0;

    // Total contacts
    const { count: totalContacts } = await supabase
      .from("campaign_members")
      .select("*", { count: "exact", head: true })
      .eq("campaign_id", campaignId);

    // Replies
    const { count: repliesCount } = await supabase
      .from("reply_threads")
      .select("*", { count: "exact", head: true })
      .eq("campaign_id", campaignId);

    // Hot/Warm leads
    const { count: hotLeadsCount } = await supabase
      .from("reply_threads")
      .select("*", { count: "exact", head: true })
      .eq("campaign_id", campaignId)
      .eq("latest_intent", "hot");

    const { count: warmLeadsCount } = await supabase
      .from("reply_threads")
      .select("*", { count: "exact", head: true })
      .eq("campaign_id", campaignId)
      .eq("latest_intent", "warm");

    // Estimate requests and jobs won
    const { count: estimateRequestsCount } = await supabase
      .from("campaign_members")
      .select("lead_id", { count: "exact", head: true })
      .eq("campaign_id", campaignId)
      .eq("contacts.estimate_booked", true);

    const { count: jobsWonCount } = await supabase
      .from("campaign_members")
      .select("lead_id", { count: "exact", head: true })
      .eq("campaign_id", campaignId)
      .eq("contacts.is_customer", true);

    // Estimated revenue
    const { data: revenueData } = await supabase
      .from("campaign_members")
      .select("contacts!inner(job_value)")
      .eq("campaign_id", campaignId)
      .eq("contacts.is_customer", true);

    const estimatedRevenue = revenueData?.reduce((sum, item: any) => {
      return sum + (Number(item.contacts?.job_value) || 0);
    }, 0) || 0;

    const replies = repliesCount || 0;
    const replyRate = delivered > 0 ? (replies / delivered) * 100 : 0;
    const hotRate = delivered > 0 ? ((hotLeadsCount || 0) / delivered) * 100 : 0;
    const warmRate = delivered > 0 ? ((warmLeadsCount || 0) / delivered) * 100 : 0;

    summary = {
      totalContacts: totalContacts || 0,
      delivered: delivered,
      replies: replies,
      uniqueHotLeads: hotLeadsCount || 0,
      warmLeads: warmLeadsCount || 0,
      estimateRequests: estimateRequestsCount || 0,
      jobsWon: jobsWonCount || 0,
      estimatedRevenue: estimatedRevenue,
      replyRate: Math.round(replyRate * 100) / 100,
      hotRate: Math.round(hotRate * 100) / 100,
      warmRate: Math.round(warmRate * 100) / 100,
    };
  }

  // 2. Step-Level Performance
  // Try to use campaign_performance_view if available
  const { data: stepPerformance } = await supabase
    .from("campaign_performance_view")
    .select("*")
    .eq("campaign_id", campaignId)
    .order("step_no", { ascending: true });

  let steps: any[] = [];

  if (stepPerformance && stepPerformance.length > 0) {
    // Get step names from campaign_steps or sequence_steps
    const { data: campaignWithSequence } = await supabase
      .from("campaigns")
      .select("sequence_id")
      .eq("id", campaignId)
      .single();

    const stepMap = new Map<string, string>();
    
    if (campaignWithSequence?.sequence_id) {
      const { data: sequenceSteps } = await supabase
        .from("sequence_steps")
        .select("id, step_number, position, subject_template")
        .eq("sequence_id", campaignWithSequence.sequence_id);

      sequenceSteps?.forEach((step) => {
        const stepId = step.id;
        const stepNo = step.step_number || step.position || 0;
        stepMap.set(stepId, `Step ${stepNo + 1}: ${step.subject_template || "Email"}`);
      });
    }

    // Also check campaign_steps
    const { data: campaignSteps } = await supabase
      .from("campaign_steps")
      .select("id, step_no, subject, subject_template")
      .eq("campaign_id", campaignId);

    campaignSteps?.forEach((step) => {
      const stepId = step.id;
      const stepNo = step.step_no || 1;
      const subject = step.subject_template || step.subject || "Email";
      stepMap.set(stepId, `Step ${stepNo}: ${subject}`);
    });

    // Block 11600: Load variant stats for steps with A/B testing enabled
    const { data: variantStats } = await supabase
      .from("campaign_step_variant_stats")
      .select("*")
      .eq("campaign_id", campaignId);

    // Create a map of variant stats by step_no and variant_used
    const variantStatsMap = new Map<string, any>();
    variantStats?.forEach((stat) => {
      const key = `${stat.step_no}_${stat.variant_used}`;
      variantStatsMap.set(key, stat);
    });

    steps = await Promise.all(stepPerformance.map(async (perf) => {
      const stepName = stepMap.get(perf.step_id) || `Step ${perf.step_no || 1}`;
      const deliveries = perf.deliveries || 0;
      const replies = perf.replies || 0;
      const hotLeads = perf.hot_leads || 0;
      const warmLeads = perf.warm_leads || 0;
      const replyRate = deliveries > 0 ? (replies / deliveries) * 100 : 0;
      const hotRate = deliveries > 0 ? (hotLeads / deliveries) * 100 : 0;
      const warmRate = deliveries > 0 ? (warmLeads / deliveries) * 100 : 0;

      // Check if this step has variants enabled
      const { data: stepConfig } = await supabase
        .from("campaign_steps")
        .select("enable_variant, variant_split")
        .eq("campaign_id", campaignId)
        .eq("step_no", perf.step_no || 1)
        .maybeSingle();

      const hasVariants = stepConfig?.enable_variant || false;
      let variantA: any = null;
      let variantB: any = null;
      let winner: any = null;

      if (hasVariants) {
        // Get variant A stats
        const variantAKey = `${perf.step_no || 1}_A`;
        const variantAStat = variantStatsMap.get(variantAKey);
        if (variantAStat) {
          const aDeliveries = variantAStat.deliveries || 0;
          const aReplies = variantAStat.replies || 0;
          const aHotLeads = variantAStat.hot_leads || 0;
          const aWarmLeads = variantAStat.warm_leads || 0;
          variantA = {
            deliveries: aDeliveries,
            replies: aReplies,
            hotLeads: aHotLeads,
            warmLeads: aWarmLeads,
            replyRate: aDeliveries > 0 ? Math.round((aReplies / aDeliveries) * 10000) / 100 : 0,
            hotRate: aDeliveries > 0 ? Math.round((aHotLeads / aDeliveries) * 10000) / 100 : 0,
            warmRate: aDeliveries > 0 ? Math.round((aWarmLeads / aDeliveries) * 10000) / 100 : 0,
          };
        }

        // Get variant B stats
        const variantBKey = `${perf.step_no || 1}_B`;
        const variantBStat = variantStatsMap.get(variantBKey);
        if (variantBStat) {
          const bDeliveries = variantBStat.deliveries || 0;
          const bReplies = variantBStat.replies || 0;
          const bHotLeads = variantBStat.hot_leads || 0;
          const bWarmLeads = variantBStat.warm_leads || 0;
          variantB = {
            deliveries: bDeliveries,
            replies: bReplies,
            hotLeads: bHotLeads,
            warmLeads: bWarmLeads,
            replyRate: bDeliveries > 0 ? Math.round((bReplies / bDeliveries) * 10000) / 100 : 0,
            hotRate: bDeliveries > 0 ? Math.round((bHotLeads / bDeliveries) * 10000) / 100 : 0,
            warmRate: bDeliveries > 0 ? Math.round((bWarmLeads / bDeliveries) * 10000) / 100 : 0,
          };
        }

        // Determine winner (need at least 10 deliveries for statistical significance)
        if (variantA && variantB && variantA.deliveries >= 10 && variantB.deliveries >= 10) {
          if (variantA.replyRate > variantB.replyRate) {
            const improvement = variantB.replyRate > 0 
              ? ((variantA.replyRate - variantB.replyRate) / variantB.replyRate) * 100
              : variantA.replyRate;
            winner = {
              variant: 'A',
              improvement: Math.round(improvement * 100) / 100,
              metric: 'replyRate',
            };
          } else if (variantB.replyRate > variantA.replyRate) {
            const improvement = variantA.replyRate > 0 
              ? ((variantB.replyRate - variantA.replyRate) / variantA.replyRate) * 100
              : variantB.replyRate;
            winner = {
              variant: 'B',
              improvement: Math.round(improvement * 100) / 100,
              metric: 'replyRate',
            };
          }
        }
      }

      return {
        stepId: perf.step_id,
        stepName: stepName,
        stepNo: perf.step_no || 1,
        deliveries: deliveries,
        replies: replies,
        hotLeads: hotLeads,
        warmLeads: warmLeads,
        replyRate: Math.round(replyRate * 100) / 100,
        hotRate: Math.round(hotRate * 100) / 100,
        warmRate: Math.round(warmRate * 100) / 100,
        customers: perf.customers || 0,
        revenue: Number(perf.revenue || 0),
        // Block 11600: Variant-level data
        ...(hasVariants ? {
          variantA,
          variantB,
          winner,
        } : {}),
      };
    }));
  } else {
    // Fallback: manual step queries
    const { data: campaignWithSequence } = await supabase
      .from("campaigns")
      .select("sequence_id")
      .eq("id", campaignId)
      .single();

    if (campaignWithSequence?.sequence_id) {
      const { data: sequenceSteps } = await supabase
        .from("sequence_steps")
        .select("id, step_number, position, subject_template")
        .eq("sequence_id", campaignWithSequence.sequence_id)
        .order("position", { ascending: true })
        .order("step_number", { ascending: true });

      if (sequenceSteps && sequenceSteps.length > 0) {
        steps = await Promise.all(
          sequenceSteps.map(async (step) => {
            const stepId = step.id;
            const stepNo = step.step_number || step.position || 0;

            // Get sends for this step
            const { count: stepSent } = await supabase
              .from("send_queue")
              .select("*", { count: "exact", head: true })
              .eq("campaign_id", campaignId)
              .in("status", ["sent", "completed"])
              .or(`step_id.eq.${stepId},step_no.eq.${stepNo}`);

            // Get replies for this step (via messages.campaign_step_id)
            const { data: stepReplies } = await supabase
              .from("reply_threads")
              .select("id, latest_intent, latest_message_id")
              .eq("campaign_id", campaignId);

            // Filter replies by step
            let stepReplyCount = 0;
            let stepHot = 0;
            let stepWarm = 0;

            if (stepReplies) {
              const messageIds = stepReplies.map((r) => r.latest_message_id).filter(Boolean);
              if (messageIds.length > 0) {
                const { data: messages } = await supabase
                  .from("messages")
                  .select("id, campaign_step_id")
                  .in("id", messageIds)
                  .eq("campaign_step_id", stepId);

                const matchingMessageIds = new Set(messages?.map((m) => m.id) || []);
                stepReplies.forEach((reply) => {
                  if (matchingMessageIds.has(reply.latest_message_id)) {
                    stepReplyCount++;
                    if (reply.latest_intent === "hot") stepHot++;
                    if (reply.latest_intent === "warm") stepWarm++;
                  }
                });
              }
            }

            const deliveries = stepSent || 0;
            const replyRate = deliveries > 0 ? (stepReplyCount / deliveries) * 100 : 0;
            const hotRate = deliveries > 0 ? (stepHot / deliveries) * 100 : 0;
            const warmRate = deliveries > 0 ? (stepWarm / deliveries) * 100 : 0;

            return {
              stepId: step.id,
              stepName: `Step ${stepNo + 1}: ${step.subject_template || "Email"}`,
              stepNo: stepNo + 1,
              deliveries: deliveries,
              replies: stepReplyCount,
              hotLeads: stepHot,
              warmLeads: stepWarm,
              replyRate: Math.round(replyRate * 100) / 100,
              hotRate: Math.round(hotRate * 100) / 100,
              warmRate: Math.round(warmRate * 100) / 100,
              customers: 0,
              revenue: 0,
            };
          })
        );
      }
    }

    // If no steps found, create a single "Step 1" entry
    if (steps.length === 0) {
      steps = [
        {
          stepId: null,
          stepName: "Step 1: Opener",
          stepNo: 1,
          deliveries: summary.delivered,
          replies: summary.replies,
          hotLeads: summary.uniqueHotLeads,
          warmLeads: summary.warmLeads,
          replyRate: summary.replyRate,
          hotRate: summary.hotRate,
          warmRate: summary.warmRate,
          customers: summary.jobsWon,
          revenue: summary.estimatedRevenue,
        },
      ];
    }
  }

  // 3. Outcome Distribution
  const { data: allThreads } = await supabase
    .from("reply_threads")
    .select("latest_intent, lead_id")
    .eq("campaign_id", campaignId);

  const { data: campaignMembers } = await supabase
    .from("campaign_members")
    .select("lead_id")
    .eq("campaign_id", campaignId);

  const totalMembers = campaignMembers?.length || 0;
  const repliedCount = allThreads?.length || 0;
  const noReplyCount = totalMembers - repliedCount;

  const outcomeDistribution = {
    hot: allThreads?.filter((t) => t.latest_intent === "hot").length || 0,
    warm: allThreads?.filter((t) => t.latest_intent === "warm").length || 0,
    notInterested: allThreads?.filter((t) => t.latest_intent === "not_interested").length || 0,
    noReply: noReplyCount,
    customer: summary.jobsWon,
  };

  // 4. Contact Outcomes (for lead journeys table)
  const { data: campaignLeads } = await supabase
    .from("campaign_members")
    .select("lead_id")
    .eq("campaign_id", campaignId)
    .limit(1000);

  const leadIds = campaignLeads?.map((cl) => cl.lead_id) || [];

  const contacts = await Promise.all(
    leadIds.slice(0, 500).map(async (contactId) => {
      const { data: contact } = await supabase
        .from("contacts")
        .select("id, email, first_name, last_name, is_customer, estimate_booked, job_value")
        .eq("id", contactId)
        .single();

      if (!contact) {
        const { data: lead } = await supabase
          .from("leads")
          .select("id, email, first_name, last_name")
          .eq("id", contactId)
          .single();
        if (!lead) return null;
        return {
          contactId: lead.id,
          name: `${lead.first_name || ""} ${lead.last_name || ""}`.trim() || "Unknown",
          email: lead.email || "",
          status: "not_replied",
          latestIntent: "unclassified",
          replied: false,
          lastActivity: null,
          repliesCount: 0,
          replyStepName: null,
          stepReplied: null,
          outcome: "No Reply",
          revenue: null,
        };
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

      // Get step they replied to
      let replyStepId: number | null = null;
      if (thread?.latest_message_id) {
        const { data: message } = await supabase
          .from("messages")
          .select("campaign_step_id")
          .eq("id", thread.latest_message_id)
          .single();

        if (message?.campaign_step_id) {
          // Get step_no from campaign_steps or sequence_steps
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
      if (contact.is_customer) {
        outcome = "Customer";
      } else if (contact.estimate_booked) {
        outcome = "Estimate Booked";
      } else if (latestIntent === "hot") {
        outcome = "Hot Lead";
      } else if (latestIntent === "warm") {
        outcome = "Warm Lead";
      } else if (replied) {
        outcome = "Replied";
      }

      return {
        contactId: contact.id,
        name: `${contact.first_name || ""} ${contact.last_name || ""}`.trim() || "Unknown",
        email: contact.email || "",
        status: replied ? "replied" : "not_replied",
        latestIntent: latestIntent,
        replied: replied,
        lastActivity: lastActivity || null,
        repliesCount: replied ? 1 : 0,
        replyStepName: replyStepId ? `Step ${replyStepId}` : null,
        stepReplied: replyStepId,
        outcome: outcome,
        revenue: contact.is_customer ? Number(contact.job_value) : null,
      };
    })
  );

  const validContacts = contacts.filter((c) => c !== null);

  // 5. Comparison with previous campaign
  const { data: previousCampaign } = await supabase
    .from("campaigns")
    .select("id")
    .eq("workspace_id", auth.workspaceId)
    .lt("created_at", campaign.created_at)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  let comparison = undefined;
  if (previousCampaign) {
    const { data: prevTotals } = await supabase
      .from("campaign_totals_view")
      .select("*")
      .eq("campaign_id", previousCampaign.id)
      .single();

    if (prevTotals) {
      const prevDelivered = prevTotals.delivered || 0;
      const prevReplies = prevTotals.replies || 0;
      const prevHot = prevTotals.unique_hot_leads || 0;
      const prevRevenue = Number(prevTotals.estimated_revenue || 0);

      const prevReplyRate = prevDelivered > 0 ? (prevReplies / prevDelivered) * 100 : 0;
      const prevHotRate = prevDelivered > 0 ? (prevHot / prevDelivered) * 100 : 0;

      comparison = {
        replyRateChange: summary.replyRate - prevReplyRate,
        hotLeadRateChange: summary.hotRate - prevHotRate,
        estimatedRevenueChange: summary.estimatedRevenue - prevRevenue,
      };
    }
  }

  return NextResponse.json({
    data: {
      summary,
      steps,
      contacts: validContacts,
      outcomeDistribution,
      comparison,
    },
  });
});
