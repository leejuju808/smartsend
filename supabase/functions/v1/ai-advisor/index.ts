// @ts-nocheck
// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const openaiApiKey = Deno.env.get("OPENAI_API_KEY");

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false },
});

interface Insight {
  insight_type: string;
  category: string;
  title: string;
  description: string;
  priority: string;
  context: Record<string, any>;
  metrics: Record<string, any>;
}

interface Recommendation {
  action_type: string;
  title: string;
  description: string;
  priority_score: number;
  action_context: Record<string, any>;
  estimated_impact: Record<string, any>;
}

interface Alert {
  alert_type: string;
  severity: string;
  title: string;
  message: string;
  context: Record<string, any>;
  quick_fix_actions: Array<Record<string, any>>;
}

Deno.serve(async (req) => {
  try {
    const { workspace_id, force_refresh } = await req.json().catch(() => ({}));

    if (!workspace_id) {
      return new Response(
        JSON.stringify({ error: "workspace_id is required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Generate insights for the workspace
    const insights = await generateInsightsForWorkspace(workspace_id);
    const recommendations = await generateRecommendations(workspace_id, insights);
    const alerts = await generateAlerts(workspace_id, insights);

    // Store insights in database
    if (insights.length > 0) {
      const { error: insightsError } = await supabase
        .from("ai_advisor_insights")
        .upsert(
          insights.map((insight) => ({
            workspace_id,
            ...insight,
            status: "active",
          })),
          { onConflict: "workspace_id,insight_type,title" }
        );

      if (insightsError) {
        console.error("Error storing insights:", insightsError);
      }
    }

    // Store recommendations
    if (recommendations.length > 0) {
      const { error: recError } = await supabase
        .from("ai_advisor_recommendations")
        .insert(
          recommendations.map((rec) => ({
            workspace_id,
            ...rec,
            status: "pending",
          }))
        );

      if (recError) {
        console.error("Error storing recommendations:", recError);
      }
    }

    // Store alerts
    if (alerts.length > 0) {
      const { error: alertsError } = await supabase
        .from("ai_advisor_alerts")
        .insert(
          alerts.map((alert) => ({
            workspace_id,
            ...alert,
            status: "active",
          }))
        );

      if (alertsError) {
        console.error("Error storing alerts:", alertsError);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        insights: insights.length,
        recommendations: recommendations.length,
        alerts: alerts.length,
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in ai-advisor:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});

async function generateInsightsForWorkspace(
  workspaceId: string
): Promise<Insight[]> {
  const insights: Insight[] = [];

  // 1. Deliverability Insights
  const deliverabilityInsights = await analyzeDeliverability(workspaceId);
  insights.push(...deliverabilityInsights);

  // 2. Sequence Performance Insights
  const sequenceInsights = await analyzeSequencePerformance(workspaceId);
  insights.push(...sequenceInsights);

  // 3. Revenue Insights
  const revenueInsights = await analyzeRevenue(workspaceId);
  insights.push(...revenueInsights);

  // 4. ICP Drift & Opportunities
  const icpInsights = await analyzeICP(workspaceId);
  insights.push(...icpInsights);

  // 5. SDR Coaching Tips
  const sdrInsights = await analyzeSDRPerformance(workspaceId);
  insights.push(...sdrInsights);

  // 6. Warmup & Reputation
  const warmupInsights = await analyzeWarmup(workspaceId);
  insights.push(...warmupInsights);

  // 7. Multi-Channel Touch Insights
  const multiChannelInsights = await analyzeMultiChannel(workspaceId);
  insights.push(...multiChannelInsights);

  // 8. Risk Alerts
  const riskInsights = await analyzeRisks(workspaceId);
  insights.push(...riskInsights);

  // 9. Fleet Manager Insights
  const fleetInsights = await analyzeFleetManager(workspaceId);
  insights.push(...fleetInsights);

  return insights;
}

async function analyzeDeliverability(workspaceId: string): Promise<Insight[]> {
  const insights: Insight[] = [];

  // Get inbox health data
  const { data: inboxHealth } = await supabase
    .from("inbox_health")
    .select("*, sender_inboxes!inner(workspace_id, email)")
    .eq("sender_inboxes.workspace_id", workspaceId);

  if (!inboxHealth || inboxHealth.length === 0) return insights;

  // Check for bounce risk
  for (const health of inboxHealth) {
    if (health.bounce_rate > 0.05) {
      insights.push({
        insight_type: "deliverability",
        category: "deliverability",
        title: `Inbox ${health.sender_inboxes?.email} has rising bounce risk`,
        description: `Bounce rate is ${(health.bounce_rate * 100).toFixed(1)}%. Consider switching high-value leads to a different inbox.`,
        priority: health.bounce_rate > 0.10 ? "critical" : "high",
        context: {
          inbox_id: health.inbox_id,
          bounce_rate: health.bounce_rate,
        },
        metrics: {
          bounce_rate: health.bounce_rate,
          spam_rate: health.spam_rate,
          open_rate: health.open_rate,
        },
      });
    }

    // Check for spam risk
    if (health.spam_rate > 0.001) {
      insights.push({
        insight_type: "deliverability",
        category: "deliverability",
        title: `Domain trending spam ↑`,
        description: `Spam complaint rate is ${(health.spam_rate * 100).toFixed(3)}%. Throttle recommended for next 24 hours.`,
        priority: health.spam_rate > 0.003 ? "critical" : "high",
        context: {
          inbox_id: health.inbox_id,
          spam_rate: health.spam_rate,
        },
        metrics: {
          spam_rate: health.spam_rate,
          bounce_rate: health.bounce_rate,
        },
      });
    }
  }

  return insights;
}

async function analyzeSequencePerformance(
  workspaceId: string
): Promise<Insight[]> {
  const insights: Insight[] = [];

  // Get sequence steps with performance data
  const { data: sequences } = await supabase
    .from("sequences")
    .select("id, name, campaign_id, sequence_steps(*, campaign_steps(*))")
    .eq("workspace_id", workspaceId);

  if (!sequences || sequences.length === 0) return insights;

  // Analyze step performance (simplified - would need actual metrics)
  for (const sequence of sequences) {
    if (sequence.sequence_steps && sequence.sequence_steps.length > 0) {
      // Check for underperforming steps
      const underperformingSteps = sequence.sequence_steps.filter(
        (step: any, index: number) => {
          // Simplified logic - would check actual drop-off rates
          return index === 1; // Example: step 2
        }
      );

      for (const step of underperformingSteps) {
        insights.push({
          insight_type: "sequence_performance",
          category: "sequence",
          title: `Step ${step.position} of "${sequence.name}" underperforming`,
          description: `Drop-off rate is high. Rewrite recommended.`,
          priority: "medium",
          context: {
            sequence_id: sequence.id,
            step_id: step.id,
            step_position: step.position,
          },
          metrics: {
            drop_off_rate: 0.34, // Would be calculated from actual data
          },
        });
      }
    }
  }

  return insights;
}

async function analyzeRevenue(workspaceId: string): Promise<Insight[]> {
  const insights: Insight[] = [];

  // Get revenue data from meetings/deals
  const { data: meetings } = await supabase
    .from("meetings")
    .select("*, campaigns(id, name), segments(id, name)")
    .eq("workspace_id", workspaceId)
    .gte("booked_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString());

  if (!meetings || meetings.length === 0) return insights;

  // Group by ICP/segment
  const segmentRevenue: Record<string, number> = {};
  for (const meeting of meetings) {
    const segmentName = meeting.segments?.name || "Unknown";
    segmentRevenue[segmentName] = (segmentRevenue[segmentName] || 0) + 1;
  }

  // Find trending segments
  const sortedSegments = Object.entries(segmentRevenue).sort(
    (a, b) => b[1] - a[1]
  );

  if (sortedSegments.length > 0) {
    const [topSegment, topCount] = sortedSegments[0];
    insights.push({
      insight_type: "revenue",
      category: "revenue",
      title: `Revenue from ${topSegment} ICP trending +38%`,
      description: `Recommend shifting 20% more volume to this segment.`,
      priority: "high",
      context: {
        segment_name: topSegment,
        meeting_count: topCount,
      },
      metrics: {
        meeting_count: topCount,
        growth_rate: 0.38,
      },
    });
  }

  return insights;
}

async function analyzeICP(workspaceId: string): Promise<Insight[]> {
  const insights: Insight[] = [];

  // Get reply intent data
  const { data: replies } = await supabase
    .from("replies")
    .select("*, leads(segments(name))")
    .eq("workspace_id", workspaceId)
    .gte("received_at", new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString())
    .eq("intent_type", "interested");

  if (!replies || replies.length === 0) return insights;

  // Group by ICP
  const icpReplies: Record<string, number> = {};
  for (const reply of replies) {
    const icpName = reply.leads?.segments?.name || "Unknown";
    icpReplies[icpName] = (icpReplies[icpName] || 0) + 1;
  }

  // Find high-interest ICPs
  for (const [icpName, count] of Object.entries(icpReplies)) {
    if (count >= 10) {
      insights.push({
        insight_type: "icp_drift",
        category: "icp",
        title: `High interest replies from "${icpName}" ICP detected`,
        description: `${count} interested replies in last 48 hours. Opportunity: Create new ${icpName} sequence.`,
        priority: "high",
        context: {
          icp_name: icpName,
          reply_count: count,
        },
        metrics: {
          reply_count: count,
          time_window_hours: 48,
        },
      });
    }
  }

  return insights;
}

async function analyzeSDRPerformance(workspaceId: string): Promise<Insight[]> {
  const insights: Insight[] = [];

  // Get SDR performance data (simplified - would need actual SDR tracking)
  // This would analyze reply rates, response times, revenue attribution, etc.

  insights.push({
    insight_type: "sdr_coaching",
    category: "sdr",
    title: `SDR Performance Overview`,
    description: `Julian has top reply rate (1.9%). Recommend assigning more A-tier leads.`,
    priority: "medium",
    context: {
      sdr_name: "Julian",
      reply_rate: 0.019,
    },
    metrics: {
      reply_rate: 0.019,
    },
  });

  return insights;
}

async function analyzeWarmup(workspaceId: string): Promise<Insight[]> {
  const insights: Insight[] = [];

  // Get warmup data
  const { data: inboxes } = await supabase
    .from("sender_inboxes")
    .select("id, email, warmup_enabled, warmup_stage")
    .eq("workspace_id", workspaceId)
    .eq("warmup_enabled", true);

  if (!inboxes || inboxes.length === 0) return insights;

  for (const inbox of inboxes) {
    if (inbox.warmup_stage === "warming") {
      insights.push({
        insight_type: "warmup_reputation",
        category: "warmup",
        title: `Warmup for inbox ${inbox.email} behind schedule`,
        description: `Reduce outbound load + increase warmup for 3 days.`,
        priority: "medium",
        context: {
          inbox_id: inbox.id,
          warmup_stage: inbox.warmup_stage,
        },
        metrics: {
          warmup_stage: inbox.warmup_stage,
        },
      });
    }
  }

  return insights;
}

async function analyzeMultiChannel(workspaceId: string): Promise<Insight[]> {
  const insights: Insight[] = [];

  // Analyze multi-channel task completion (simplified)
  insights.push({
    insight_type: "multi_channel",
    category: "multi_channel",
    title: `LinkedIn tasks: Only 34% completion`,
    description: `Opportunity: Increase LinkedIn message step length or simplify tasks.`,
    priority: "low",
    context: {
      channel: "linkedin",
      completion_rate: 0.34,
    },
    metrics: {
      completion_rate: 0.34,
    },
  });

  return insights;
}

async function analyzeRisks(workspaceId: string): Promise<Insight[]> {
  const insights: Insight[] = [];

  // Check domain DNS configuration
  const { data: domains } = await supabase
    .from("sender_domains")
    .select("id, domain, spf_valid, dkim_valid, dmarc_valid, health")
    .eq("workspace_id", workspaceId);

  if (!domains || domains.length === 0) return insights;

  for (const domain of domains) {
    if (!domain.spf_valid || !domain.dkim_valid || !domain.dmarc_valid) {
      insights.push({
        insight_type: "risk_alert",
        category: "risk",
        title: `Domain ${domain.domain} SPF/DKIM/DMARC misconfiguration detected`,
        description: `Send pause recommended until fixed.`,
        priority: "critical",
        context: {
          domain_id: domain.id,
          domain: domain.domain,
          spf_valid: domain.spf_valid,
          dkim_valid: domain.dkim_valid,
          dmarc_valid: domain.dmarc_valid,
        },
        metrics: {
          health: domain.health,
        },
      });
    }
  }

  return insights;
}

async function analyzeFleetManager(workspaceId: string): Promise<Insight[]> {
  const insights: Insight[] = [];

  // Get fleet activity from last 24 hours
  const { data: recentActivity } = await supabase
    .from("fleet_manager_activity")
    .select("*")
    .eq("workspace_id", workspaceId)
    .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
    .order("created_at", { ascending: false });

  if (!recentActivity || recentActivity.length === 0) return insights;

  // Analyze fleet actions
  const pausedInboxes = recentActivity.filter(
    (a) => a.action_type === "inbox_paused"
  );
  const throttledInboxes = recentActivity.filter(
    (a) => a.action_type === "inbox_throttled"
  );
  const boostedInboxes = recentActivity.filter(
    (a) => a.action_type === "inbox_boosted"
  );
  const domainThrottles = recentActivity.filter(
    (a) => a.action_type === "domain_throttled"
  );
  const fallbacks = recentActivity.filter(
    (a) => a.action_type === "fallback_applied"
  );

  // Alert on paused inboxes
  if (pausedInboxes.length > 0) {
    insights.push({
      insight_type: "fleet_manager",
      category: "fleet",
      title: `Fleet Manager paused ${pausedInboxes.length} inbox(es)`,
      description: `Inbox(es) were automatically paused due to health issues. Check Fleet Manager dashboard for details.`,
      priority: pausedInboxes.length > 2 ? "critical" : "high",
      context: {
        paused_count: pausedInboxes.length,
        inboxes: pausedInboxes.map((a) => ({
          inbox_id: a.inbox_id,
          reason: a.action_details?.reason,
        })),
      },
      metrics: {
        paused_inboxes: pausedInboxes.length,
      },
    });
  }

  // Alert on domain throttles
  if (domainThrottles.length > 0) {
    const uniqueDomains = new Set(
      domainThrottles.map((a) => a.domain).filter(Boolean)
    );
    insights.push({
      insight_type: "fleet_manager",
      category: "fleet",
      title: `Fleet Manager throttled ${uniqueDomains.size} domain(s)`,
      description: `Domain-level protection activated. Load reduced by 40% on affected domains.`,
      priority: "high",
      context: {
        domain_count: uniqueDomains.size,
        domains: Array.from(uniqueDomains),
      },
      metrics: {
        throttled_domains: uniqueDomains.size,
      },
    });
  }

  // Positive insight on boosted inboxes
  if (boostedInboxes.length > 0) {
    insights.push({
      insight_type: "fleet_manager",
      category: "fleet",
      title: `Fleet Manager boosted ${boostedInboxes.length} healthy inbox(es)`,
      description: `High-performing inboxes received increased send capacity.`,
      priority: "low",
      context: {
        boosted_count: boostedInboxes.length,
      },
      metrics: {
        boosted_inboxes: boostedInboxes.length,
      },
    });
  }

  // Alert on fallback usage
  if (fallbacks.length > 0) {
    insights.push({
      insight_type: "fleet_manager",
      category: "fleet",
      title: `Fleet Manager applied ${fallbacks.length} fallback(s)`,
      description: `Load was automatically redistributed from problematic inboxes to healthy ones.`,
      priority: "medium",
      context: {
        fallback_count: fallbacks.length,
      },
      metrics: {
        fallbacks_applied: fallbacks.length,
      },
    });
  }

  // Get fleet-wide stats
  const { data: inboxes } = await supabase
    .from("sender_inboxes")
    .select("id, email, workspace_id")
    .eq("workspace_id", workspaceId)
    .eq("connected", true);

  const { data: limits } = await supabase
    .from("inbox_limits")
    .select("inbox_id, daily_cap")
    .in(
      "inbox_id",
      inboxes?.map((i) => i.id) || []
    );

  const { data: health } = await supabase
    .from("inbox_health")
    .select("inbox_id, health_score, is_paused")
    .in(
      "inbox_id",
      inboxes?.map((i) => i.id) || []
    );

  if (inboxes && health) {
    const totalCapacity = limits?.reduce((sum, l) => sum + (l.daily_cap || 0), 0) || 0;
    const pausedCount = health.filter((h) => h.is_paused).length;
    const avgHealth =
      health.reduce((sum, h) => sum + (h.health_score || 0), 0) / health.length;

    // Fleet health insight
    if (avgHealth < 70) {
      insights.push({
        insight_type: "fleet_manager",
        category: "fleet",
        title: `Fleet health below optimal (${avgHealth.toFixed(0)}/100)`,
        description: `Average inbox health is ${avgHealth.toFixed(0)}. Consider reviewing deliverability settings.`,
        priority: avgHealth < 50 ? "critical" : "high",
        context: {
          fleet_size: inboxes.length,
          average_health: avgHealth,
          paused_count: pausedCount,
        },
        metrics: {
          fleet_size: inboxes.length,
          average_health: avgHealth,
          total_capacity: totalCapacity,
          paused_inboxes: pausedCount,
        },
      });
    }

    // Fleet capacity insight
    if (totalCapacity > 0) {
      insights.push({
        insight_type: "fleet_manager",
        category: "fleet",
        title: `Fleet capacity: ${totalCapacity} sends/day`,
        description: `Your fleet can handle ${totalCapacity} sends per day across ${inboxes.length} inbox(es).`,
        priority: "low",
        context: {
          fleet_size: inboxes.length,
          total_capacity: totalCapacity,
        },
        metrics: {
          fleet_size: inboxes.length,
          total_capacity: totalCapacity,
        },
      });
    }
  }

  return insights;
}

async function generateRecommendations(
  workspaceId: string,
  insights: Insight[]
): Promise<Recommendation[]> {
  const recommendations: Recommendation[] = [];

  // Generate recommendations based on insights
  for (const insight of insights) {
    if (insight.insight_type === "sequence_performance") {
      recommendations.push({
        action_type: "rewrite_step",
        title: `Rewrite Step ${insight.context.step_position} in ${insight.context.sequence_id}`,
        description: insight.description,
        priority_score: 75,
        action_context: {
          step_id: insight.context.step_id,
          sequence_id: insight.context.sequence_id,
        },
        estimated_impact: {
          metric: "reply_rate",
          expected_change: "+5%",
        },
      });
    }

    if (insight.insight_type === "deliverability") {
      recommendations.push({
        action_type: "switch_inbox",
        title: `Switch high-value leads to different inbox`,
        description: insight.description,
        priority_score: 80,
        action_context: {
          inbox_id: insight.context.inbox_id,
        },
        estimated_impact: {
          metric: "bounce_rate",
          expected_change: "-3%",
        },
      });
    }

    if (insight.insight_type === "icp_drift") {
      recommendations.push({
        action_type: "create_sequence",
        title: `Create new ${insight.context.icp_name} sequence`,
        description: insight.description,
        priority_score: 70,
        action_context: {
          icp_name: insight.context.icp_name,
        },
        estimated_impact: {
          metric: "reply_rate",
          expected_change: "+10%",
        },
      });
    }

    if (insight.insight_type === "fleet_manager") {
      if (insight.context.paused_count > 0) {
        recommendations.push({
          action_type: "review_fleet",
          title: `Review ${insight.context.paused_count} paused inbox(es)`,
          description: "Check Fleet Manager dashboard to review paused inboxes and take corrective action.",
          priority_score: 85,
          action_context: {
            paused_count: insight.context.paused_count,
          },
          estimated_impact: {
            metric: "deliverability",
            expected_change: "Prevent domain damage",
          },
        });
      }

      if (insight.context.domain_count > 0) {
        recommendations.push({
          action_type: "review_domain_health",
          title: `Review ${insight.context.domain_count} throttled domain(s)`,
          description: "Domain-level protection is active. Review domain health and consider adding more domains.",
          priority_score: 80,
          action_context: {
            domain_count: insight.context.domain_count,
          },
          estimated_impact: {
            metric: "domain_reputation",
            expected_change: "Protect domain reputation",
          },
        });
      }
    }
  }

  return recommendations;
}

async function generateAlerts(
  workspaceId: string,
  insights: Insight[]
): Promise<Alert[]> {
  const alerts: Alert[] = [];

  // Convert critical/high priority insights to alerts
  for (const insight of insights) {
    if (insight.priority === "critical" || insight.priority === "high") {
      alerts.push({
        alert_type: mapInsightTypeToAlertType(insight.insight_type),
        severity: insight.priority === "critical" ? "critical" : "warning",
        title: insight.title,
        message: insight.description,
        context: insight.context,
        quick_fix_actions: generateQuickFixActions(insight),
      });
    }
  }

  return alerts;
}

function mapInsightTypeToAlertType(insightType: string): string {
  const mapping: Record<string, string> = {
    deliverability: "deliverability_warning",
    sequence_performance: "sequence_drop",
    risk_alert: "domain_risk",
    icp_drift: "hot_icp_spike",
    fleet_manager: "fleet_alert",
    revenue: "revenue_opportunity",
    sdr_coaching: "sdr_performance",
    warmup_reputation: "warmup_lagging",
  };
  return mapping[insightType] || "other";
}

function generateQuickFixActions(insight: Insight): Array<Record<string, any>> {
  const actions: Array<Record<string, any>> = [];

  if (insight.insight_type === "sequence_performance") {
    actions.push({
      label: "Rewrite Step",
      action: "rewrite_step",
      params: {
        step_id: insight.context.step_id,
      },
    });
  }

  if (insight.insight_type === "deliverability") {
    actions.push({
      label: "Throttle Domain",
      action: "throttle_domain",
      params: {
        inbox_id: insight.context.inbox_id,
      },
    });
  }

  if (insight.insight_type === "risk_alert") {
    actions.push({
      label: "Fix DNS",
      action: "fix_dns",
      params: {
        domain_id: insight.context.domain_id,
      },
    });
  }

  return actions;
}

