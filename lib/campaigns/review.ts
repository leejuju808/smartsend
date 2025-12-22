// lib/campaigns/review.ts
// Shared campaign review logic for Block 263

import type { SupabaseClient } from "@supabase/supabase-js";
import { applySegmentFilters } from "@/lib/segments/query-builder";
import type { SegmentRuleNode } from "@/lib/segments/debug";
import { spamRiskScore } from "@/lib/deliverability/spamRiskScore";

export type CheckStatus = "pass" | "warn" | "fail";

export interface Check {
  key: string;
  label: string;
  status: CheckStatus;
  details?: string;
  weight?: number;
}

export interface ReviewResult {
  status: "pass" | "warn" | "block";
  score: number;
  checks: Check[];
  estimatedRecipients?: number;
  mailboxEmail?: string | null;
  mailboxHealth?: number | null;
}

/**
 * Compute review score from checks
 */
export function computeReviewScore(checks: Check[]): number {
  let score = 100;

  for (const c of checks) {
    if (c.status === "warn") {
      score -= c.weight ?? 5;
    }
    if (c.status === "fail") {
      score -= c.weight ?? 20;
    }
  }

  return Math.max(0, score);
}

/**
 * Determine overall status from score and checks
 */
export function determineStatus(score: number, checks: Check[]): "pass" | "warn" | "block" {
  const hasFail = checks.some((c) => c.status === "fail");
  if (hasFail || score < 50) return "block";
  if (score < 80) return "warn";
  return "pass";
}

/**
 * Extract variables from template text (e.g. {{first_name}})
 */
function extractVariables(text: string): string[] {
  const matches = text.match(/\{\{([^}]+)\}\}/g);
  if (!matches) return [];
  return matches.map((m) => m.replace(/\{\{|\}\}/g, "").trim());
}

/**
 * Check if template has unsubscribe link or opt-out text
 */
function hasUnsubscribeToken(text: string): boolean {
  const lower = text.toLowerCase();
  return (
    lower.includes("{{unsubscribe_link}}") ||
    lower.includes("{{unsubscribe}}") ||
    lower.includes("unsubscribe") ||
    lower.includes("opt-out") ||
    lower.includes("opt out") ||
    lower.includes("remove me")
  );
}

/**
 * Count words in text (rough estimate)
 */
function countWords(text: string): number {
  // Remove HTML tags
  const plain = text.replace(/<[^>]*>/g, " ");
  return plain.trim().split(/\s+/).filter((w) => w.length > 0).length;
}

/**
 * Run campaign review checks
 */
export async function runCampaignReview(
  supabase: SupabaseClient,
  campaignId: string
): Promise<ReviewResult> {
  const checks: Check[] = [];

  // Load campaign, templates, segment, mailbox, plan
  const [
    { data: campaign, error: cErr },
    templatesResult,
    segmentResult,
    mailboxResult,
    planResult,
  ] = await Promise.all([
    supabase.from("campaigns").select("*").eq("id", campaignId).single(),
    supabase
      .from("templates")
      .select("*")
      .eq("campaign_id", campaignId)
      .then((r) => {
        if (!r.data || r.data.length === 0) {
          return supabase
            .from("campaign_email_templates")
            .select("*")
            .eq("campaign_id", campaignId);
        }
        return r;
      }),
    supabase
      .from("campaigns")
      .select("segment_id")
      .eq("id", campaignId)
      .single()
      .then(async (r) => {
        if (r.data?.segment_id) {
          return supabase
            .from("segments")
            .select("*")
            .eq("id", r.data.segment_id)
            .maybeSingle();
        }
        return { data: null, error: null };
      }),
    supabase
      .from("campaigns")
      .select("mailbox_id, workspace_id")
      .eq("id", campaignId)
      .single()
      .then(async (r) => {
        if (r.data?.mailbox_id) {
          return supabase
            .from("mailboxes")
            .select("*")
            .eq("id", r.data.mailbox_id)
            .maybeSingle();
        }
        return { data: null, error: null };
      }),
    supabase
      .from("campaigns")
      .select("workspace_id")
      .eq("id", campaignId)
      .single()
      .then(async (r) => {
        if (r.data?.workspace_id) {
          return supabase
            .from("send_plan")
            .select("*")
            .eq("workspace_id", r.data.workspace_id)
            .eq("date", new Date().toISOString().slice(0, 10))
            .maybeSingle();
        }
        return { data: null, error: null };
      }),
  ]);

  if (!campaign || cErr) {
    return {
      status: "block",
      score: 0,
      checks: [
        {
          key: "campaign_not_found",
          label: "Campaign not found",
          status: "fail",
          details: cErr?.message || "Campaign not found",
          weight: 100,
        },
      ],
    };
  }

  const templates = templatesResult.data || [];
  const segment = segmentResult.data;
  const mailbox = mailboxResult.data;
  const plan = planResult.data;

  // ============================================
  // A. Mailbox Wiring Checks
  // ============================================

  if (!mailbox || !campaign.mailbox_id) {
    checks.push({
      key: "has_mailbox",
      label: "Mailbox connected",
      status: "fail",
      details: "Campaign must have a mailbox connected",
      weight: 20,
    });
  } else {
    checks.push({
      key: "has_mailbox",
      label: "Mailbox connected",
      status: "pass",
      details: `Campaign is using mailbox ${mailbox.from_email || mailbox.email || "N/A"}`,
    });

    const healthScore = mailbox.health_score ?? 100;
    if (healthScore < 70) {
      checks.push({
        key: "mailbox_health",
        label: "Mailbox health",
        status: healthScore < 50 ? "fail" : "warn",
        details: `Mailbox health score is ${healthScore}/100 (below recommended threshold)`,
        weight: healthScore < 50 ? 20 : 10,
      });
    } else {
      checks.push({
        key: "mailbox_health",
        label: "Mailbox health",
        status: "pass",
        details: `Mailbox health score: ${healthScore}/100`,
      });
    }

    if (mailbox.paused) {
      checks.push({
        key: "mailbox_paused",
        label: "Mailbox status",
        status: "fail",
        details: "Mailbox is paused and cannot send emails",
        weight: 20,
      });
    }
  }

  // ============================================
  // B. Audience Size vs Send Plan
  // ============================================

  let estimatedRecipients = 0;
  if (!campaign.segment_id && !campaign.smartlist_id) {
    checks.push({
      key: "segment_defined",
      label: "Audience defined",
      status: "warn",
      details: "No segment or SmartList attached to campaign",
      weight: 10,
    });
  } else {
    let rules: SegmentRuleNode | null = null;

    if (campaign.smartlist_id) {
      const { data: smartlist } = await supabase
        .from("shared_resources")
        .select("llm_rules")
        .eq("id", campaign.smartlist_id)
        .eq("smart", true)
        .single();
      rules = (smartlist?.llm_rules as SegmentRuleNode | null) ?? null;
    } else if (segment) {
      rules = (segment.rule ?? segment.conditions ?? null) as SegmentRuleNode | null;
    }

    let leadQuery = supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", campaign.workspace_id) as any;

    leadQuery = applySegmentFilters(leadQuery, rules);

    const { count } = await leadQuery;
    estimatedRecipients = count ?? 0;

    if (estimatedRecipients === 0) {
      checks.push({
        key: "segment_defined",
        label: "Audience size",
        status: "fail",
        details: "Segment has no matching leads",
        weight: 20,
      });
    } else {
      checks.push({
        key: "segment_defined",
        label: "Audience defined",
        status: "pass",
        details: `Segment has ${estimatedRecipients} matching leads`,
      });
    }
  }

  // send_plan_capacity
  if (plan && estimatedRecipients > 0) {
    const planData = plan.plan as Array<{ mailbox_id: string; max_sends: number; status: string }> | null;
    if (planData && Array.isArray(planData)) {
      const totalDailySafeLimit = planData.reduce((sum, entry) => sum + (entry.max_sends || 0), 0);
      if (totalDailySafeLimit > 0) {
        const estimatedDays = Math.ceil(estimatedRecipients / totalDailySafeLimit);
        if (estimatedDays > 7) {
          checks.push({
            key: "send_plan_capacity",
            label: "Send plan capacity",
            status: "warn",
            details: `You're trying to send ${estimatedRecipients} emails but safe daily throughput is ~${totalDailySafeLimit}. This will take ~${estimatedDays} days.`,
            weight: 5,
          });
        } else {
          checks.push({
            key: "send_plan_capacity",
            label: "Send plan capacity",
            status: "pass",
            details: `Estimated ${estimatedDays} days to complete at safe volume`,
          });
        }
      }
    }
  }

  // ============================================
  // Block 272: Timezone Checks
  // ============================================

  // Check leads missing timezone
  if (estimatedRecipients > 0 && campaign.workspace_id) {
    let rules: SegmentRuleNode | null = null;
    if (campaign.smartlist_id) {
      const { data: smartlist } = await supabase
        .from("shared_resources")
        .select("llm_rules")
        .eq("id", campaign.smartlist_id)
        .maybeSingle();
      rules = (smartlist?.llm_rules as SegmentRuleNode | null) ?? null;
    } else if (segment) {
      rules = (segment.rule ?? segment.conditions ?? null) as SegmentRuleNode | null;
    }

    let totalQuery = supabase
      .from("leads")
      .select("timezone", { count: "exact", head: true })
      .eq("workspace_id", campaign.workspace_id);

    let missingQuery = supabase
      .from("leads")
      .select("timezone", { count: "exact", head: true })
      .eq("workspace_id", campaign.workspace_id)
      .is("timezone", null);

    if (rules) {
      totalQuery = applySegmentFilters(totalQuery, rules) as any;
      missingQuery = applySegmentFilters(missingQuery, rules) as any;
    }

    const [{ count: totalLeads }, { count: missingCount }] = await Promise.all([
      totalQuery,
      missingQuery.is("timezone", null),
    ]);

    if (totalLeads && totalLeads > 0 && missingCount !== null) {
      const missingPercent = (missingCount / totalLeads) * 100;
      if (missingPercent > 20) {
        checks.push({
          key: "leads_missing_timezone",
          label: "Leads missing timezone",
          status: "warn",
          details: `${Math.round(missingPercent)}% of leads in this campaign have no timezone. They will use workspace default timezone.`,
          weight: 3,
        });
      } else {
        checks.push({
          key: "leads_missing_timezone",
          label: "Leads missing timezone",
          status: "pass",
          details: `${Math.round(100 - missingPercent)}% of leads have timezone detected`,
        });
      }
    }
  }

  // Check workspace weekend sending setting
  if (campaign.workspace_id) {
    const { data: workspace } = await supabase
      .from("workspaces")
      .select("restrict_to_business_days, respect_lead_timezone")
      .eq("id", campaign.workspace_id)
      .maybeSingle();

    if (workspace?.restrict_to_business_days) {
      checks.push({
        key: "weekend_sending_disabled",
        label: "Weekend sending",
        status: "pass",
        details: "Weekend sending is disabled. Sends will only occur on business days.",
      });
    } else {
      checks.push({
        key: "weekend_sending_enabled",
        label: "Weekend sending",
        status: "warn",
        details: "Weekend sending is enabled. This may reduce reply rates.",
        weight: 2,
      });
    }

    if (workspace?.respect_lead_timezone) {
      checks.push({
        key: "lead_timezone_respected",
        label: "Lead timezone awareness",
        status: "pass",
        details: "Sends respect each lead's local timezone and business hours.",
      });
    }
  }

  // ============================================
  // C. Template Checks
  // ============================================

  if (templates.length === 0) {
    const campaignSubject = campaign.subject || campaign.subject_template || "";
    const campaignBody = campaign.body_template || campaign.body_html || campaign.body || "";

    if (!campaignSubject && !campaignBody) {
      checks.push({
        key: "has_templates",
        label: "Templates defined",
        status: "fail",
        details: "No templates found for this campaign",
        weight: 20,
      });
    } else {
      const allTemplates = [{ subject: campaignSubject, body: campaignBody }];
      for (const tpl of allTemplates) {
        const subject = tpl.subject || "";
        const body = tpl.body || "";

        if (!hasUnsubscribeToken(body)) {
          checks.push({
            key: "has_unsubscribe_token",
            label: "Unsubscribe link",
            status: "fail",
            details: "No unsubscribe link or opt-out text detected in template",
            weight: 20,
          });
        } else {
          checks.push({
            key: "has_unsubscribe_token",
            label: "Unsubscribe link",
            status: "pass",
            details: "Unsubscribe link or opt-out text found",
          });
        }

        // Variable coverage check
        const variables = extractVariables(subject + body);
        if (variables.length > 0 && estimatedRecipients > 0) {
          let leadQuery = supabase
            .from("leads")
            .select("first_name, last_name, company, email")
            .eq("workspace_id", campaign.workspace_id)
            .limit(100) as any;

          if (campaign.segment_id || campaign.smartlist_id) {
            let rules: SegmentRuleNode | null = null;
            if (campaign.smartlist_id) {
              const { data: smartlist } = await supabase
                .from("shared_resources")
                .select("llm_rules")
                .eq("id", campaign.smartlist_id)
                .single();
              rules = (smartlist?.llm_rules as SegmentRuleNode | null) ?? null;
            } else if (segment) {
              rules = (segment.rule ?? segment.conditions ?? null) as SegmentRuleNode | null;
            }
            leadQuery = applySegmentFilters(leadQuery, rules);
          }

          const { data: sampleLeads } = await leadQuery;
          if (sampleLeads && sampleLeads.length > 0) {
            const missingFields: Record<string, number> = {};
            for (const varName of variables) {
              const field = varName.toLowerCase().replace(/[^a-z0-9]/g, "_");
              const missing = sampleLeads.filter((l: any) => !l[field] || l[field] === null || l[field] === "").length;
              const missingPct = (missing / sampleLeads.length) * 100;
              if (missingPct > 20) {
                missingFields[varName] = missingPct;
              }
            }

            if (Object.keys(missingFields).length > 0) {
              const fieldsList = Object.entries(missingFields)
                .map(([field, pct]) => `${field} missing for ${Math.round(pct)}%`)
                .join(", ");
              checks.push({
                key: "variable_coverage",
                label: "Variable coverage",
                status: "warn",
                details: `${fieldsList} of leads in this segment`,
                weight: 5,
              });
            }
          }
        }

        // Spam heuristics
        const spamResult = spamRiskScore(subject, body);
        if (spamResult.score >= 40) {
          checks.push({
            key: "spam_score",
            label: "Spam risk",
            status: spamResult.score >= 60 ? "fail" : "warn",
            details: `Spam risk score: ${spamResult.score}/100. High-risk words detected: ${spamResult.highRiskWords.join(", ")}`,
            weight: spamResult.score >= 60 ? 20 : 10,
          });
        } else if (spamResult.score >= 20) {
          checks.push({
            key: "spam_score",
            label: "Spam risk",
            status: "warn",
            details: `Spam risk score: ${spamResult.score}/100`,
            weight: 5,
          });
        } else {
          checks.push({
            key: "spam_score",
            label: "Spam risk",
            status: "pass",
            details: `Spam risk score: ${spamResult.score}/100`,
          });
        }

        // Length / Structure
        if (subject.length > 90) {
          checks.push({
            key: "subject_length",
            label: "Subject line length",
            status: "warn",
            details: `Subject line is ${subject.length} characters (recommended: < 90)`,
            weight: 3,
          });
        }

        const wordCount = countWords(body);
        if (wordCount < 20) {
          checks.push({
            key: "body_length",
            label: "Email body length",
            status: "warn",
            details: `Email body is very short (${wordCount} words, recommended: 20-500 words)`,
            weight: 3,
          });
        } else if (wordCount > 500) {
          checks.push({
            key: "body_length",
            label: "Email body length",
            status: "warn",
            details: `Email body is very long (${wordCount} words, recommended: 20-500 words)`,
            weight: 3,
          });
        }
      }
    }
  } else {
    for (const tpl of templateList) {
      const subject = tpl.subject || "";
      const body = tpl.body || tpl.body_html || tpl.body_text || "";

      if (!hasUnsubscribeToken(body)) {
        checks.push({
          key: "has_unsubscribe_token",
          label: "Unsubscribe link",
          status: "fail",
          details: `Template "${tpl.name || "Unnamed"}" missing unsubscribe link`,
          weight: 20,
        });
      }

      const spamResult = spamRiskScore(subject, body);
      if (spamResult.score >= 40) {
        checks.push({
          key: "spam_score",
          label: "Spam risk",
          status: spamResult.score >= 60 ? "fail" : "warn",
          details: `Template "${tpl.name || "Unnamed"}" has spam risk score: ${spamResult.score}/100`,
          weight: spamResult.score >= 60 ? 20 : 10,
        });
      }
    }
  }

  // ============================================
  // D. Follow-Up Flow Compatibility
  // ============================================

  const { data: followupFlow } = await supabase
    .from("followup_flows")
    .select("*")
    .eq("campaign_id", campaignId)
    .maybeSingle();

  if (followupFlow) {
    checks.push({
      key: "has_followup_flow",
      label: "Follow-up flow",
      status: "pass",
      details: "Follow-up flow is configured",
    });

    if (!followupFlow.entry_node_id) {
      checks.push({
        key: "flow_entry_node",
        label: "Follow-up flow entry",
        status: "warn",
        details: "Follow-up flow has no entry node defined",
        weight: 5,
      });
    }
  } else {
    checks.push({
      key: "has_followup_flow",
      label: "Follow-up flow",
      status: "pass",
      details: "No follow-up flow configured (optional)",
    });
  }

  // ============================================
  // E. Scheduling & Timezone
  // ============================================

  if (!campaign.send_at && !campaign.start_date && !campaign.send_start) {
    checks.push({
      key: "send_window_defined",
      label: "Send schedule",
      status: "warn",
      details: "No send schedule defined",
      weight: 5,
    });
  } else {
    checks.push({
      key: "send_window_defined",
      label: "Send schedule",
      status: "pass",
      details: "Send schedule is configured",
    });

    const sendAt = campaign.send_at || campaign.start_date;
    if (sendAt) {
      const sendDate = new Date(sendAt);
      const now = new Date();
      if (sendDate < now && campaign.status !== "running") {
        checks.push({
          key: "start_in_past",
          label: "Start time",
          status: "warn",
          details: "Campaign start time is in the past",
          weight: 3,
        });
      }
    }
  }

  if (!campaign.timezone) {
    checks.push({
      key: "timezone_defined",
      label: "Timezone",
      status: "warn",
      details: "No timezone specified",
      weight: 3,
    });
  }

  // ============================================
  // Compute Score and Status
  // ============================================

  const score = computeReviewScore(checks);
  const status = determineStatus(score, checks);

  return {
    status,
    score,
    checks,
    estimatedRecipients,
    mailboxEmail: mailbox?.from_email || mailbox?.email || null,
    mailboxHealth: mailbox?.health_score || null,
  };
}

