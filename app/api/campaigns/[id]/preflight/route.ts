// app/api/campaigns/[id]/preflight/route.ts

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import type { Database } from "@/lib/supabase/types";
import { applySegmentFilters } from "@/lib/segments/query-builder";
import type { SegmentRuleNode } from "@/lib/segments/debug";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createRouteHandlerClient<Database>({ cookies });
  const errors: string[] = [];
  const warnings: string[] = [];

  // 1) Load campaign
  const { data: campaign, error: cErr } = await supabase
    .from("campaigns")
    .select("*")
    .eq("id", params.id)
    .single();

  if (!campaign || cErr) {
    return NextResponse.json(
      { errors: ["Campaign not found"], warnings },
      { status: 404 }
    );
  }

  // Basic checks
  if (!campaign.subject) errors.push("Missing email subject.");
  if (!campaign.from_name) errors.push("Missing from name.");
  if (!campaign.from_email) errors.push("Missing from email.");
  if (!campaign.body_html && !campaign.body_text && !(campaign as any).content_html && !(campaign as any).content_text) {
    errors.push("Missing email content.");
  }
  if (!campaign.send_at) errors.push("Missing scheduled send time.");

  // 2) Load segment (optional)
  let rules: SegmentRuleNode | null = null;
  if (campaign.segment_id) {
    const { data: segment, error: sErr } = await supabase
      .from("segments")
      .select("*")
      .eq("id", campaign.segment_id)
      .eq("account_id", campaign.account_id)
      .single();

    if (sErr) {
      errors.push("Segment could not be loaded.");
    } else {
      // Extract rules from either rule jsonb or conditions array
      rules = (segment.rule ?? segment.conditions ?? null) as SegmentRuleNode | null;
    }
  }

  // 3) Count matched leads
  let matchedCount: number | null = 0;
  if (campaign.segment_id) {
    let leadQuery = supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("account_id", campaign.account_id) as any;

    leadQuery = applySegmentFilters(leadQuery, rules);

    const { count, error: countErr } = await leadQuery;
    if (countErr) {
      errors.push("Failed to count leads in segment.");
    } else {
      matchedCount = count ?? 0;
      if (matchedCount === 0) {
        errors.push("Segment returns 0 leads — nothing to send.");
      }
    }
  } else {
    // If no segment, count all leads for the account
    const { count, error: countErr } = await supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("account_id", campaign.account_id);
    
    if (countErr) {
      warnings.push("Could not count leads.");
    } else {
      matchedCount = count ?? 0;
      if (matchedCount === 0) {
        warnings.push("No leads found in account.");
      }
    }
  }

  // 4) Check for duplicate leads and deduplication strategy
  const dedupeStrategy = (campaign as any).dedupe_strategy || "per_campaign";
  
  // Count duplicate leads within the campaign
  if (campaign.id) {
    const { data: duplicateLeads, error: dupErr } = await supabase
      .from("leads")
      .select("email")
      .eq("campaign_id", campaign.id);
    
    if (!dupErr && duplicateLeads) {
      const emailCounts = new Map<string, number>();
      duplicateLeads.forEach((lead: any) => {
        const emailLower = lead.email?.toLowerCase();
        if (emailLower) {
          emailCounts.set(emailLower, (emailCounts.get(emailLower) || 0) + 1);
        }
      });
      
      // Count emails that appear more than once
      const duplicateEmails = Array.from(emailCounts.entries()).filter(([_, count]) => count > 1);
      if (duplicateEmails.length > 0) {
        const totalDuplicateEntries = duplicateEmails.reduce((sum, [_, count]) => sum + count - 1, 0);
        warnings.push(`You have ${duplicateEmails.length} duplicate email${duplicateEmails.length > 1 ? 's' : ''} (${totalDuplicateEntries} extra entr${totalDuplicateEntries > 1 ? 'ies' : 'y'}) inside this campaign.`);
      }
    }
  }

  // Warn about deduplication strategy
  if (dedupeStrategy === "none") {
    warnings.push("Deduplication is disabled — risk of sending multiple emails to same contact.");
  } else {
    const strategyLabels: Record<string, string> = {
      "per_campaign": "Per-campaign deduplication",
      "global": "Global deduplication (across all campaigns)",
      "domain": "Domain-level deduplication (one per company domain)",
    };
    warnings.push(`Dedupe Strategy: ${strategyLabels[dedupeStrategy] || dedupeStrategy}`);
  }

  // 5) Validate follow-up rules
  // Check both followup_rules and campaign_steps tables
  const { data: followupRules, error: rErr } = await supabase
    .from("followup_rules")
    .select("*")
    .eq("campaign_id", campaign.id);

  const { data: campaignSteps, error: stepsErr } = await supabase
    .from("campaign_steps")
    .select("*")
    .eq("campaign_id", campaign.id)
    .order("step_index", { ascending: true });

  if (rErr && stepsErr) {
    warnings.push("Could not load follow-up rules.");
  } else {
    // Validate followup_rules if they exist
    if (followupRules && followupRules.length > 0) {
      for (const rule of followupRules) {
        const stepNum = (rule as any).step_number ?? (rule as any).step_no;
        const delayDays = (rule as any).delay_days ?? (rule as any).offset_days;
        
        if (delayDays !== undefined && delayDays < 0) {
          errors.push(`Step ${stepNum ?? "unknown"} has invalid negative delay.`);
        }
        
        const contentHtml = (rule as any).content_html ?? (rule as any).body_html;
        const contentText = (rule as any).content_text ?? (rule as any).body_text;
        if (!contentHtml && !contentText) {
          errors.push(`Step ${stepNum ?? "unknown"} is missing content.`);
        }
      }
    }
    
    // Validate campaign_steps if they exist
    if (campaignSteps && campaignSteps.length > 0) {
      for (const step of campaignSteps) {
        const stepIndex = step.step_index ?? (step as any).step_no;
        const delayDays = step.delay_days ?? (step as any).offset_days ?? 0;
        
        if (delayDays < 0) {
          errors.push(`Step ${stepIndex ?? "unknown"} has invalid negative delay.`);
        }
        
        if (!step.body_html && !(step as any).body_text) {
          errors.push(`Step ${stepIndex ?? "unknown"} is missing content.`);
        }
      }
    }
  }

  return NextResponse.json({
    errors,
    warnings,
    ok: errors.length === 0,
    matched: matchedCount ?? 0,
  });
}
