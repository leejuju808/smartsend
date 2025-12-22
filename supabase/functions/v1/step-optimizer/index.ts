// Block 455 — Sequence Optimizer v1
// AI Analysis • Step Scoring • Variant Winner Selection • Drop-Off Diagnosis • Rewrite Suggestions

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } }
);

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
const OPENAI_MODEL = Deno.env.get("OPENAI_MODEL") || "gpt-4o-mini";

interface StepOptimizationInput {
  step_id?: string;
  campaign_id?: string;
  force?: boolean; // Force re-optimization even if recent
}

interface StepOptimizationOutput {
  step_id: string;
  score: number;
  reasoning: string[];
  suggestions: OptimizationSuggestion[];
  ai_rewrite_prompt?: string;
}

interface OptimizationSuggestion {
  type: string;
  text: string;
  priority: "low" | "medium" | "high" | "critical";
  metadata?: Record<string, any>;
  ai_rewrite_prompt?: string;
}

Deno.serve(async (req) => {
  try {
    const { step_id, campaign_id, force } = (await req.json()) as StepOptimizationInput;

    if (!step_id && !campaign_id) {
      return new Response(
        JSON.stringify({ error: "Either step_id or campaign_id is required" }),
        { status: 400, headers: { "content-type": "application/json" } }
      );
    }

    if (campaign_id) {
      // Optimize all steps in campaign
      const result = await optimizeCampaign(campaign_id, force);
      return new Response(JSON.stringify(result), {
        headers: { "content-type": "application/json" },
      });
    } else {
      // Optimize single step
      const result = await optimizeStep(step_id!, force);
      return new Response(JSON.stringify(result), {
        headers: { "content-type": "application/json" },
      });
    }
  } catch (error: any) {
    console.error("Step optimizer error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      { status: 500, headers: { "content-type": "application/json" } }
    );
  }
});

async function optimizeStep(
  stepId: string,
  force = false
): Promise<StepOptimizationOutput> {
  // Get step details
  const { data: step, error: stepError } = await supabase
    .from("campaign_steps")
    .select(`
      *,
      campaign:campaigns!inner(
        id,
        workspace_id,
        name
      )
    `)
    .eq("id", stepId)
    .single();

  if (stepError || !step) {
    throw new Error(`Step not found: ${stepId}`);
  }

  // Check if we should skip (recent optimization)
  if (!force) {
    const { data: recentScore } = await supabase
      .from("step_score")
      .select("last_updated")
      .eq("step_id", stepId)
      .single();

    if (recentScore && recentScore.last_updated) {
      const hoursSinceUpdate =
        (Date.now() - new Date(recentScore.last_updated).getTime()) / (1000 * 60 * 60);
      if (hoursSinceUpdate < 6) {
        // Skip if optimized within last 6 hours
        return await getExistingOptimization(stepId);
      }
    }
  }

  // Get step stats
  const { data: stats } = await supabase.rpc("get_step_stats", {
    p_step_id: stepId,
  });

  if (!stats || stats.length === 0) {
    throw new Error("No stats available for step");
  }

  const stepStats = stats[0];

  // Get variant stats
  // Note: campaign_step_variants uses campaign_id + step_no, not step_id
  const stepNo = step.step_no || step.step_index || step.step_number || 0;
  const { data: variants } = await supabase
    .from("campaign_step_variants")
    .select(`
      *,
      stats:campaign_step_variant_stats(*)
    `)
    .eq("campaign_id", step.campaign_id)
    .eq("step_no", stepNo)
    .eq("enabled", true);

  // Get previous step stats for drop-off analysis
  const { data: prevStep } = await supabase
    .from("campaign_steps")
    .select("id")
    .eq("campaign_id", step.campaign_id)
    .eq("step_no", (step.step_no || 0) - 1)
    .single();

  let prevStepStats = null;
  if (prevStep) {
    const { data: prevStats } = await supabase.rpc("get_step_stats", {
      p_step_id: prevStep.id,
    });
    if (prevStats && prevStats.length > 0) {
      prevStepStats = prevStats[0];
    }
  }

  // Get inbox/domain health
  const inboxHealth = await getInboxHealth(step.campaign_id);
  const domainHealth = await getDomainHealth(step.campaign_id);

  // Get reply intents
  const replyIntents = await getReplyIntents(stepId);

  // Calculate score
  await supabase.rpc("update_step_score", { p_step_id: stepId });

  const { data: scoreData } = await supabase
    .from("step_score")
    .select("*")
    .eq("step_id", stepId)
    .single();

  // Generate AI analysis
  const analysis = await generateAIAnalysis({
    step,
    stepStats,
    variants: variants || [],
    prevStepStats,
    inboxHealth,
    domainHealth,
    replyIntents,
    scoreData,
  });

  // Save suggestions
  await saveSuggestions(stepId, analysis.suggestions);

  // Log activity
  await logActivity({
    workspace_id: step.campaign.workspace_id,
    type: "campaign",
    subtype: "step_optimized",
    campaign_id: step.campaign.id,
    step_id: stepId,
    metadata: {
      score: scoreData?.score || 0,
      suggestions_count: analysis.suggestions.length,
    },
  });

  return {
    step_id: stepId,
    score: scoreData?.score || 0,
    reasoning: analysis.reasoning,
    suggestions: analysis.suggestions,
    ai_rewrite_prompt: analysis.ai_rewrite_prompt,
  };
}

async function optimizeCampaign(
  campaignId: string,
  force = false
): Promise<{ campaign_id: string; steps: StepOptimizationOutput[]; diagnosis: any }> {
  // Get all steps
  const { data: steps } = await supabase
    .from("campaign_steps")
    .select("*")
    .eq("campaign_id", campaignId)
    .order("step_no", { ascending: true });

  if (!steps || steps.length === 0) {
    throw new Error("No steps found for campaign");
  }

  // Optimize each step
  const stepOptimizations = await Promise.all(
    steps.map((step) => optimizeStep(step.id, force))
  );

  // Generate campaign-level diagnosis
  const diagnosis = await generateCampaignDiagnosis(campaignId, stepOptimizations);

  // Save campaign diagnosis
  await saveCampaignDiagnosis(campaignId, diagnosis);

  // Analyze ICP/Segment performance
  const icpSuggestions = await analyzeICPSegments(campaignId);
  if (icpSuggestions.length > 0) {
    diagnosis.suggestions = [...(diagnosis.suggestions || []), ...icpSuggestions];
  }

  // Log activity
  const { data: campaign } = await supabase
    .from("campaigns")
    .select("workspace_id")
    .eq("id", campaignId)
    .single();

  if (campaign?.workspace_id) {
    await logActivity({
      workspace_id: campaign.workspace_id,
      type: "campaign",
      subtype: "optimized",
      campaign_id: campaignId,
      metadata: {
        steps_optimized: stepOptimizations.length,
        avg_score: stepOptimizations.reduce((sum, opt) => sum + opt.score, 0) / stepOptimizations.length,
        suggestions_count: diagnosis.suggestions?.length || 0,
      },
    });
  }

  return {
    campaign_id: campaignId,
    steps: stepOptimizations,
    diagnosis,
  };
}

async function generateAIAnalysis(context: any): Promise<{
  reasoning: string[];
  suggestions: OptimizationSuggestion[];
  ai_rewrite_prompt?: string;
}> {
  const {
    step,
    stepStats,
    variants,
    prevStepStats,
    inboxHealth,
    domainHealth,
    replyIntents,
    scoreData,
  } = context;

  const reasoning: string[] = [];
  const suggestions: OptimizationSuggestion[] = [];

  // Analyze open rate
  const openRate = stepStats.open_rate || 0;
  if (openRate < 20) {
    reasoning.push(`Subject line underperforming benchmark (${openRate.toFixed(1)}% open)`);
    suggestions.push({
      type: "rewrite_subject",
      text: `Rewrite subject line to improve open rate (currently ${openRate.toFixed(1)}%)`,
      priority: "high",
      ai_rewrite_prompt: `Rewrite this subject line to increase open rate:
- Make it more compelling and personalized
- Keep it under 6 words
- Remove spammy words
- Add urgency or curiosity hook

Current subject: ${step.subject_template || step.subject || ""}`,
    });
  }

  // Analyze reply rate
  const replyRate = stepStats.reply_rate || 0;
  if (replyRate < 0.5) {
    reasoning.push(`Reply rate below benchmark (${replyRate.toFixed(2)}%)`);
    suggestions.push({
      type: "rewrite_template",
      text: `Rewrite email body to increase reply rate (currently ${replyRate.toFixed(2)}%)`,
      priority: "high",
      ai_rewrite_prompt: `Rewrite this email template to increase reply rate:
- Use a direct hook for the industry
- Be 30% shorter
- Remove corporate tone
- Add 1 clear CTA only
- Make it more conversational

Current body: ${(step.body_template || step.body_html || "").substring(0, 500)}`,
    });
  }

  // Analyze bounce rate
  const bounceRate = stepStats.bounce_rate || 0;
  if (bounceRate > 4) {
    reasoning.push(`Bounce rate elevated (${bounceRate.toFixed(2)}%)`);
    suggestions.push({
      type: "remove_spam_flags",
      text: `High bounce rate detected. Review email content for spam triggers`,
      priority: bounceRate > 6 ? "critical" : "high",
      metadata: { bounce_rate: bounceRate },
    });
  }

  // Analyze spam rate
  const spamRate = stepStats.spam_rate || 0;
  if (spamRate > 0.2) {
    reasoning.push(`Spam rate elevated (${spamRate.toFixed(2)}%)`);
    suggestions.push({
      type: "remove_spam_flags",
      text: `High spam rate detected. Remove spammy content and links`,
      priority: spamRate > 0.3 ? "critical" : "high",
      metadata: { spam_rate: spamRate },
    });
  }

  // Analyze variants
  if (variants && variants.length > 1) {
    const variantPerformance = variants
      .map((v: any) => {
        const stats = v.stats?.[0] || {};
        const sent = stats.sent || 0;
        const openRate = sent > 0 ? ((stats.opened || 0) / sent) * 100 : 0;
        const replyRate = sent > 0 ? ((stats.replied || 0) / sent) * 100 : 0;
        return {
          id: v.id,
          name: v.name,
          sent,
          openRate,
          replyRate,
        };
      })
      .filter((v: any) => v.sent >= 10) // Only compare variants with enough data
      .sort((a: any, b: any) => b.openRate - a.openRate);

    if (variantPerformance.length >= 2) {
      const best = variantPerformance[0];
      const worst = variantPerformance[variantPerformance.length - 1];
      const openDiff = best.openRate - worst.openRate;
      const replyDiff = best.replyRate - worst.replyRate;

      if (openDiff > 15 || replyDiff > 0.4) {
        reasoning.push(
          `Variant ${best.name} strongly outperforms Variant ${worst.name} (${openDiff.toFixed(1)}% open rate difference)`
        );
        suggestions.push({
          type: "choose_best_variant",
          text: `Disable Variant ${worst.name} - Variant ${best.name} is performing significantly better`,
          priority: "medium",
          metadata: {
            best_variant_id: best.id,
            worst_variant_id: worst.id,
            open_diff: openDiff,
            reply_diff: replyDiff,
          },
        });
      }
    }
  }

  // Analyze drop-off
  if (prevStepStats && prevStepStats.sent > 0) {
    const dropoffRate =
      ((prevStepStats.sent - stepStats.sent) / prevStepStats.sent) * 100;
    if (dropoffRate > 30) {
      reasoning.push(
        `Drop-off too steep from previous step (${dropoffRate.toFixed(1)}% drop-off)`
      );

      // Check reply intents for unsubscribe signals
      const unsubscribeCount = replyIntents.filter(
        (r: any) => r.intent === "unsubscribe"
      ).length;
      if (unsubscribeCount > 0) {
        suggestions.push({
          type: "rewrite_template",
          text: `High drop-off detected. Many recipients unsubscribed. Rewrite to reduce opt-outs`,
          priority: "high",
        });
      } else {
        suggestions.push({
          type: "suggest_delay_timing",
          text: `High drop-off detected. Consider delaying this step by +1 day`,
          priority: "medium",
          metadata: { current_delay: step.delay_days || 0, suggested_delay: (step.delay_days || 0) + 1 },
        });
      }
    }
  }

  // Analyze inbox health
  if (inboxHealth && inboxHealth.health_score < 50) {
    reasoning.push(`Inbox ${inboxHealth.inbox_email} shows lower health (score: ${inboxHealth.health_score})`);
    suggestions.push({
      type: "switch_inbox",
      text: `Switch to healthier inbox. Current inbox health score: ${inboxHealth.health_score}`,
      priority: inboxHealth.health_score < 30 ? "critical" : "high",
      metadata: { inbox_id: inboxHealth.inbox_id, health_score: inboxHealth.health_score },
    });
  }

  // Analyze domain health
  if (domainHealth && domainHealth.health_score < 50) {
    reasoning.push(`Domain ${domainHealth.domain} trending bounce ↑ (health: ${domainHealth.health_score})`);
    suggestions.push({
      type: "switch_domain",
      text: `Consider switching domain. Current domain health score: ${domainHealth.health_score}`,
      priority: domainHealth.health_score < 30 ? "critical" : "high",
      metadata: { domain: domainHealth.domain, health_score: domainHealth.health_score },
    });
  }

  // Generate AI rewrite prompt if needed
  let aiRewritePrompt: string | undefined;
  if (suggestions.some((s) => s.type === "rewrite_template")) {
    const rewriteSuggestion = suggestions.find((s) => s.type === "rewrite_template");
    aiRewritePrompt = rewriteSuggestion?.ai_rewrite_prompt;
  }

  return {
    reasoning,
    suggestions,
    ai_rewrite_prompt: aiRewritePrompt,
  };
}

async function generateCampaignDiagnosis(
  campaignId: string,
  stepOptimizations: StepOptimizationOutput[]
): Promise<any> {
  if (!OPENAI_API_KEY) {
    // Fallback to rule-based diagnosis
    return generateRuleBasedDiagnosis(stepOptimizations);
  }

  try {
    const { data: campaign } = await supabase
      .from("campaigns")
      .select("*")
      .eq("id", campaignId)
      .single();

    const prompt = `Analyze this campaign and provide a diagnosis summary:

Campaign: ${campaign?.name || campaignId}
Steps analyzed: ${stepOptimizations.length}

Step Performance:
${stepOptimizations
  .map(
    (opt, idx) =>
      `Step ${idx + 1}: Score ${opt.score}/100. Issues: ${opt.reasoning.join("; ")}`
  )
  .join("\n")}

Provide a concise diagnosis with:
1. Overall campaign health
2. Key issues identified
3. Top 3-5 recommendations

Format as JSON:
{
  "diagnosis_text": "...",
  "suggestions": [
    {"type": "...", "text": "...", "priority": "..."}
  ]
}`;

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.3,
        response_format: { type: "json_object" },
      }),
    });

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    if (content) {
      const parsed = JSON.parse(content);
      return parsed;
    }
  } catch (error) {
    console.error("AI diagnosis error:", error);
  }

  return generateRuleBasedDiagnosis(stepOptimizations);
}

function generateRuleBasedDiagnosis(
  stepOptimizations: StepOptimizationOutput[]
): any {
  const avgScore =
    stepOptimizations.reduce((sum, opt) => sum + opt.score, 0) /
    stepOptimizations.length;

  const allSuggestions = stepOptimizations.flatMap((opt) => opt.suggestions);
  const criticalSuggestions = allSuggestions.filter(
    (s) => s.priority === "critical"
  );
  const highSuggestions = allSuggestions.filter((s) => s.priority === "high");

  const diagnosisText = `Campaign Analysis — ${new Date().toLocaleDateString()}

• Average step score: ${avgScore.toFixed(1)}/100
• ${criticalSuggestions.length} critical issues identified
• ${highSuggestions.length} high-priority improvements available

Key Recommendations:
${[...criticalSuggestions, ...highSuggestions]
  .slice(0, 5)
  .map((s) => `  - ${s.text}`)
  .join("\n")}`;

  return {
    diagnosis_text: diagnosisText,
    suggestions: [...criticalSuggestions, ...highSuggestions].slice(0, 10),
  };
}

async function getInboxHealth(campaignId: string): Promise<any> {
  // Get inbox used by campaign (from send_logs or campaign settings)
  const { data: sendLogs } = await supabase
    .from("send_logs")
    .select("sender_inbox_id")
    .eq("campaign_id", campaignId)
    .limit(1)
    .single();

  if (sendLogs?.sender_inbox_id) {
    const { data: health } = await supabase
      .from("inbox_health")
      .select("*")
      .eq("inbox_id", sendLogs.sender_inbox_id)
      .single();

    if (health) {
      const { data: inbox } = await supabase
        .from("sender_inboxes")
        .select("email")
        .eq("id", sendLogs.sender_inbox_id)
        .single();

      return {
        ...health,
        inbox_id: sendLogs.sender_inbox_id,
        inbox_email: inbox?.email,
      };
    }
  }

  return null;
}

async function getDomainHealth(campaignId: string): Promise<any> {
  const { data: sendLogs } = await supabase
    .from("send_logs")
    .select("sender_inbox_id")
    .eq("campaign_id", campaignId)
    .limit(1)
    .single();

  if (sendLogs?.sender_inbox_id) {
    const { data: inbox } = await supabase
      .from("sender_inboxes")
      .select("domain_id")
      .eq("id", sendLogs.sender_inbox_id)
      .single();

    if (inbox?.domain_id) {
      const { data: domain } = await supabase
        .from("sender_domains")
        .select("domain")
        .eq("id", inbox.domain_id)
        .single();

      if (domain?.domain) {
        const { data: health } = await supabase
          .from("domain_health")
          .select("*")
          .eq("domain", domain.domain)
          .single();

        return health ? { ...health, domain: domain.domain } : null;
      }
    }
  }

  return null;
}

async function getReplyIntents(stepId: string): Promise<any[]> {
  // Get replies for this step via send_logs
  const { data: replies } = await supabase
    .from("send_logs")
    .select(`
      id,
      email_replies:intent,
      inbox_messages:ai_label
    `)
    .eq("step_id", stepId)
    .not("replied_at", "is", null)
    .limit(100);

  // Extract intents from replies
  const intents: any[] = [];
  if (replies) {
    replies.forEach((reply: any) => {
      if (reply.email_replies) {
        intents.push({ intent: reply.email_replies, confidence: 0.8 });
      } else if (reply.inbox_messages) {
        // Try to infer intent from ai_label
        const label = reply.inbox_messages;
        if (label === "unsubscribe" || label === "opt_out") {
          intents.push({ intent: "unsubscribe", confidence: 0.9 });
        } else if (label === "interested" || label === "positive") {
          intents.push({ intent: "interested", confidence: 0.8 });
        }
      }
    });
  }

  return intents;
}

async function saveSuggestions(
  stepId: string,
  suggestions: OptimizationSuggestion[]
): Promise<void> {
  // Delete existing unapplied suggestions
  await supabase
    .from("step_optimization_suggestions")
    .delete()
    .eq("step_id", stepId)
    .is("applied_at", null);

  // Insert new suggestions
  if (suggestions.length > 0) {
    await supabase.from("step_optimization_suggestions").insert(
      suggestions.map((s) => ({
        step_id: stepId,
        suggestion_type: s.type,
        suggestion_text: s.text,
        priority: s.priority,
        metadata: s.metadata || {},
        ai_rewrite_prompt: s.ai_rewrite_prompt,
      }))
    );
  }
}

async function getExistingOptimization(
  stepId: string
): Promise<StepOptimizationOutput> {
  const { data: score } = await supabase
    .from("step_score")
    .select("*")
    .eq("step_id", stepId)
    .single();

  const { data: suggestions } = await supabase
    .from("step_optimization_suggestions")
    .select("*")
    .eq("step_id", stepId)
    .is("applied_at", null)
    .order("priority", { ascending: false });

  return {
    step_id: stepId,
    score: score?.score || 0,
    reasoning: [],
    suggestions:
      suggestions?.map((s) => ({
        type: s.suggestion_type,
        text: s.suggestion_text,
        priority: s.priority as any,
        metadata: s.metadata,
        ai_rewrite_prompt: s.ai_rewrite_prompt,
      })) || [],
  };
}

async function analyzeICPSegments(campaignId: string): Promise<OptimizationSuggestion[]> {
  const suggestions: OptimizationSuggestion[] = [];

  try {
    // Get leads with segment/ICP data
    const { data: leads } = await supabase
      .from("campaign_leads")
      .select(`
        lead_id,
        lead:leads!inner(
          id,
          industry,
          title,
          company,
          custom
        ),
        send_logs!inner(
          id,
          opened_at,
          replied_at
        )
      `)
      .eq("campaign_id", campaignId)
      .limit(1000);

    if (!leads || leads.length === 0) {
      return suggestions;
    }

    // Group by industry/segment
    const segmentPerformance = new Map<string, {
      total: number;
      opened: number;
      replied: number;
    }>();

    leads.forEach((cl: any) => {
      const lead = cl.lead;
      const segment = lead?.industry || lead?.custom?.segment || "Unknown";
      const logs = cl.send_logs || [];
      
      const stats = segmentPerformance.get(segment) || { total: 0, opened: 0, replied: 0 };
      stats.total += 1;
      if (logs.some((l: any) => l.opened_at)) stats.opened += 1;
      if (logs.some((l: any) => l.replied_at)) stats.replied += 1;
      segmentPerformance.set(segment, stats);
    });

    // Find best and worst performing segments
    const segments = Array.from(segmentPerformance.entries())
      .map(([segment, stats]) => ({
        segment,
        ...stats,
        openRate: stats.total > 0 ? (stats.opened / stats.total) * 100 : 0,
        replyRate: stats.total > 0 ? (stats.replied / stats.total) * 100 : 0,
      }))
      .filter((s) => s.total >= 10) // Only segments with enough data
      .sort((a, b) => b.replyRate - a.replyRate);

    if (segments.length >= 2) {
      const best = segments[0];
      const worst = segments[segments.length - 1];
      const replyDiff = best.replyRate - worst.replyRate;

      if (replyDiff > 1.0) {
        suggestions.push({
          type: "change_hook",
          text: `Your "${best.segment}" segment outperforms "${worst.segment}" by ${replyDiff.toFixed(1)}x reply rate. Consider shifting more volume to ${best.segment} or rewriting messaging for ${worst.segment}.`,
          priority: "medium",
          metadata: {
            best_segment: best.segment,
            worst_segment: worst.segment,
            reply_diff: replyDiff,
          },
        });
      }
    }

    // Check role performance
    const rolePerformance = new Map<string, {
      total: number;
      replied: number;
    }>();

    leads.forEach((cl: any) => {
      const lead = cl.lead;
      const role = lead?.title || "Unknown";
      const logs = cl.send_logs || [];
      
      const stats = rolePerformance.get(role) || { total: 0, replied: 0 };
      stats.total += 1;
      if (logs.some((l: any) => l.replied_at)) stats.replied += 1;
      rolePerformance.set(role, stats);
    });

    const roles = Array.from(rolePerformance.entries())
      .map(([role, stats]) => ({
        role,
        ...stats,
        replyRate: stats.total > 0 ? (stats.replied / stats.total) * 100 : 0,
      }))
      .filter((r) => r.total >= 10)
      .sort((a, b) => b.replyRate - a.replyRate);

    if (roles.length >= 2) {
      const bestRole = roles[0];
      const worstRole = roles[roles.length - 1];
      const roleDiff = bestRole.replyRate - worstRole.replyRate;

      if (roleDiff > 0.5) {
        suggestions.push({
          type: "add_personalization",
          text: `Outreach to ${bestRole.role} roles outperforms ${worstRole.role} by ${roleDiff.toFixed(1)}% reply rate. Consider rewriting messaging for ${worstRole.role} roles.`,
          priority: "low",
          metadata: {
            best_role: bestRole.role,
            worst_role: worstRole.role,
            reply_diff: roleDiff,
          },
        });
      }
    }
  } catch (error) {
    console.error("ICP segment analysis error:", error);
  }

  return suggestions;
}

async function saveCampaignDiagnosis(
  campaignId: string,
  diagnosis: any
): Promise<void> {
  const { data: campaign } = await supabase
    .from("campaigns")
    .select("workspace_id")
    .eq("id", campaignId)
    .single();

  if (!campaign) {
    return;
  }

  await supabase
    .from("campaign_diagnosis")
    .upsert({
      campaign_id: campaignId,
      workspace_id: campaign.workspace_id,
      diagnosis_text: diagnosis.diagnosis_text || "",
      suggestions: diagnosis.suggestions || [],
      generated_at: new Date().toISOString(),
    }, {
      onConflict: "campaign_id",
    });
}

async function logActivity(params: {
  workspace_id: string;
  type: string;
  subtype: string;
  campaign_id?: string;
  step_id?: string;
  metadata?: Record<string, any>;
}): Promise<void> {
  try {
    await supabase.from("workspace_activity").insert({
      workspace_id: params.workspace_id,
      type: params.type,
      subtype: params.subtype,
      campaign_id: params.campaign_id,
      step_id: params.step_id,
      metadata: params.metadata || {},
    });
  } catch (error) {
    console.error("Activity log error:", error);
    // Don't throw - activity logging shouldn't break optimization
  }
}

