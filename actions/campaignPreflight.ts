"use server";

import { createClient } from "@/lib/supabase/server";
import { findMissingVariables } from "@/lib/smartsend/findMissingVars";

export async function campaignPreflight(campaignId: string) {
  const supabase = createClient();

  // Load campaign
  const { data: campaign, error: cErr } = await supabase
    .from("campaigns")
    .select("*")
    .eq("id", campaignId)
    .single();

  if (cErr || !campaign) return { ok: false, errors: ["Campaign not found."] };

  // Load leads
  const { data: leads } = await supabase
    .from("leads")
    .select("*")
    .eq("campaign_id", campaignId);

  // Get current user for safety settings lookup
  const { data: { user } } = await supabase.auth.getUser();
  
  // Load user safety settings
  let safety = null;
  if (user) {
    const { data: safetyData } = await supabase
      .from("smartsend_safety")
      .select("*")
      .eq("user_id", user.id)
      .single();
    safety = safetyData;
  }

  const errors: string[] = [];
  const warnings: string[] = [];

  // Block 8900: Check sequence steps
  const { data: steps } = await supabase
    .from("smartsend_sequence_steps")
    .select("*")
    .eq("campaign_id", campaignId)
    .order("position", { ascending: true });

  // Block 8900: Validate sequence steps
  if (!steps || steps.length === 0) {
    errors.push("Campaign has no sequence steps.");
  } else {
    // Validate each step
    for (const step of steps) {
      if (!step.subject || step.subject.trim() === "") {
        errors.push(`Step ${step.position} is missing a subject line.`);
      }
      if (!step.body || step.body.trim() === "") {
        errors.push(`Step ${step.position} is missing email body.`);
      }
      if (step.delay_days < 0) {
        errors.push(`Step ${step.position} has invalid delay (must be >= 0).`);
      }
    }
  }

  // Extract subject and body from sequence or direct fields (for backward compatibility)
  let subject = "";
  let body = "";
  
  // Check if campaign has direct subject/body fields
  if (campaign.subject) {
    subject = campaign.subject;
  }
  if (campaign.body || campaign.body_template) {
    body = campaign.body || campaign.body_template || "";
  }
  
  // If no direct fields, check sequence steps (first step)
  if ((!subject || !body) && steps && steps.length > 0) {
    const firstStep = steps[0];
    if (firstStep.subject) subject = firstStep.subject;
    if (firstStep.body) body = firstStep.body;
  }

  // Validation Rules (only if no sequence steps - backward compatibility)
  if (steps && steps.length === 0) {
    if (!subject || subject.trim() === "") {
      errors.push("Missing subject line.");
    }

    if (!body || body.trim() === "") {
      errors.push("Missing email body.");
    }
  }

  if (!campaign.send_interval_seconds) {
    errors.push("Missing send interval.");
  }

  if (!campaign.from_email_account_id) {
    errors.push("No connected Gmail/Outlook account.");
  }

  if (!leads || leads.length === 0) {
    errors.push("You have no leads imported.");
  }

  // Detect missing merge fields
  if (leads && leads.length > 0) {
    const missingVars = findMissingVariables(subject + " " + body, leads);
    if (missingVars.length > 0) {
      errors.push("Missing variables for: " + missingVars.join(", "));
    }
  }

  // Safety Rules
  if (safety) {
    if (campaign.send_interval_seconds < 25) {
      warnings.push(
        `Your sending speed is very high (${campaign.send_interval_seconds}s). Recommended is 30–90 seconds.`
      );
    }

    if (leads && leads.length > safety.max_per_day) {
      warnings.push(
        `You have ${leads.length} leads, but your max-per-day is ${safety.max_per_day}. Sending may take multiple days.`
      );
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
  };
}

