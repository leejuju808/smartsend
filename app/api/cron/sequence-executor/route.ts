import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// This endpoint runs every minute via cron to execute pending sequence steps
export async function GET(req: NextRequest) {
  // Verify cron secret if needed
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    // Find all pending steps where scheduled_time <= now()
    const now = new Date().toISOString();
    const { data: pendingLogs, error: logsError } = await supabase
      .from("campaign_logs")
      .select(
        `
        *,
        campaign:campaigns!inner(id, workspace_id, status, name),
        step:campaign_steps(id, step_type, config, step_order)
      `
      )
      .eq("status", "pending")
      .lte("scheduled_time", now)
      .limit(100); // Process up to 100 at a time

    if (logsError) {
      console.error("Error fetching pending logs:", logsError);
      return NextResponse.json(
        { error: "Failed to fetch pending logs", details: logsError.message },
        { status: 500 }
      );
    }

    if (!pendingLogs || pendingLogs.length === 0) {
      return NextResponse.json({ processed: 0, message: "No pending steps" });
    }

    let processed = 0;
    let skipped = 0;
    let failed = 0;

    for (const log of pendingLogs) {
      try {
        // Check if campaign is still published
        if (log.campaign.status !== "published") {
          await supabase
            .from("campaign_logs")
            .update({ status: "skipped", metadata: { reason: "campaign_not_published" } })
            .eq("id", log.id);
          skipped++;
          continue;
        }

        // Check if lead has replied (stop sequence)
        const { data: replies } = await supabase
          .from("email_replies")
          .select("id")
          .eq("contact_email", log.contact_email)
          .eq("campaign_id", log.campaign_id)
          .limit(1);

        if (replies && replies.length > 0) {
          await supabase
            .from("campaign_logs")
            .update({ status: "stopped", metadata: { reason: "lead_replied" } })
            .eq("id", log.id);
          skipped++;
          continue;
        }

        // Check if email bounced
        const { data: bounces } = await supabase
          .from("bounces")
          .select("id")
          .eq("email", log.contact_email)
          .limit(1);

        if (bounces && bounces.length > 0) {
          await supabase
            .from("campaign_logs")
            .update({ status: "stopped", metadata: { reason: "email_bounced" } })
            .eq("id", log.id);
          skipped++;
          continue;
        }

        // Execute step based on type
        if (!log.step) {
          await supabase
            .from("campaign_logs")
            .update({ status: "failed", metadata: { error: "Step not found" } })
            .eq("id", log.id);
          failed++;
          continue;
        }

        const stepType = log.step.step_type;
        const config = log.step.config || {};

        if (stepType === "email") {
          // Execute email step
          await executeEmailStep(supabase, log, config);
          processed++;
        } else if (stepType === "delay") {
          // Delay steps are handled by scheduling the next step
          // This should not be executed directly
          await supabase
            .from("campaign_logs")
            .update({ status: "skipped", metadata: { reason: "delay_step" } })
            .eq("id", log.id);
          skipped++;
        } else if (stepType === "condition") {
          // Execute condition step
          await executeConditionStep(supabase, log, config, log.campaign_id);
          processed++;
        } else if (stepType === "tag") {
          // Execute tag step
          await executeTagStep(supabase, log, config);
          processed++;
        }

        // Mark as sent
        await supabase
          .from("campaign_logs")
          .update({
            status: "sent",
            execution_time: new Date().toISOString(),
          })
          .eq("id", log.id);

        // Schedule next step
        await scheduleNextStep(supabase, log.campaign_id, log.contact_email, log.step.step_order);
      } catch (error: any) {
        console.error(`Error processing log ${log.id}:`, error);
        await supabase
          .from("campaign_logs")
          .update({
            status: "failed",
            metadata: { error: error.message },
          })
          .eq("id", log.id);
        failed++;
      }
    }

    return NextResponse.json({
      processed,
      skipped,
      failed,
      total: pendingLogs.length,
    });
  } catch (error: any) {
    console.error("Sequence executor error:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}

async function executeEmailStep(
  supabase: any,
  log: any,
  config: any
) {
  // Get lead/contact info for personalization
  const { data: lead } = await supabase
    .from("leads")
    .select("*")
    .eq("email", log.contact_email)
    .maybeSingle();

  // Personalize email using AI engine
  let subject = config.subject || "";
  let body = config.body || "";

  if (lead) {
    // Replace basic tokens
    subject = subject.replace(/\{\{first_name\}\}/g, lead.first_name || "there");
    subject = subject.replace(/\{\{city\}\}/g, lead.city || "");
    subject = subject.replace(/\{\{address\}\}/g, lead.address || "");

    body = body.replace(/\{\{first_name\}\}/g, lead.first_name || "there");
    body = body.replace(/\{\{city\}\}/g, lead.city || "");
    body = body.replace(/\{\{address\}\}/g, lead.address || "");

    // Use AI personalization if available
    try {
      const personalizeResponse = await fetch(
        `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/ai/personalize`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            template_subject: subject,
            template_body: body,
            contact_id: lead.id,
            campaign_id: log.campaign_id,
          }),
        }
      );

      if (personalizeResponse.ok) {
        const personalized = await personalizeResponse.json();
        subject = personalized.subject || subject;
        body = personalized.body || body;
      }
    } catch (error) {
      console.error("AI personalization failed, using basic replacement:", error);
    }
  }

  // Enqueue email to send queue
  const { data: campaign } = await supabase
    .from("campaigns")
    .select("workspace_id, from_email_account_id")
    .eq("id", log.campaign_id)
    .single();

  await supabase.from("email_jobs").insert({
    workspace_id: campaign.workspace_id,
    campaign_id: log.campaign_id,
    to_email: log.contact_email,
    subject,
    body_html: body,
    status: "queued",
    scheduled_at: new Date().toISOString(),
  });
}

async function executeConditionStep(
  supabase: any,
  log: any,
  config: any,
  campaignId: string
) {
  const condition = config.condition;
  const action = config.action;

  if (condition === "replied") {
    // Check if lead replied
    const { data: replies } = await supabase
      .from("email_replies")
      .select("id")
      .eq("contact_email", log.contact_email)
      .eq("campaign_id", campaignId)
      .limit(1);

    if (replies && replies.length > 0 && action === "stop") {
      // Stop sequence for this lead
      await supabase
        .from("campaign_logs")
        .update({ status: "stopped" })
        .eq("campaign_id", campaignId)
        .eq("contact_email", log.contact_email)
        .eq("status", "pending");
    }
  } else if (condition === "hot_lead_score") {
    // Check hot lead score (would need lead scoring system)
    // For now, just log it
    await supabase
      .from("campaign_logs")
      .update({
        metadata: { condition_checked: "hot_lead_score", action },
      })
      .eq("id", log.id);
  }
}

async function executeTagStep(supabase: any, log: any, config: any) {
  const label = config.label;
  if (!label) return;

  // Apply tag/label to lead
  const { data: lead } = await supabase
    .from("leads")
    .select("id")
    .eq("email", log.contact_email)
    .maybeSingle();

  if (lead) {
    // Update lead with tag (assuming leads table has tags field or use a tags table)
    await supabase
      .from("leads")
      .update({ tags: [label] }) // This is simplified - you might have a tags table
      .eq("id", lead.id);
  }
}

async function scheduleNextStep(
  supabase: any,
  campaignId: string,
  contactEmail: string,
  currentStepOrder: number
) {
  // Get next step
  const { data: nextStep } = await supabase
    .from("campaign_steps")
    .select("*")
    .eq("campaign_id", campaignId)
    .eq("step_order", currentStepOrder + 1)
    .maybeSingle();

  if (!nextStep) {
    // No more steps
    return;
  }

  // Calculate scheduled time based on delay
  let scheduledTime = new Date();
  if (nextStep.step_type === "delay") {
    const config = nextStep.config || {};
    const duration = config.duration || 2;
    const unit = config.unit || "days";

    if (unit === "hours") {
      scheduledTime = new Date(scheduledTime.getTime() + duration * 60 * 60 * 1000);
    } else if (unit === "days") {
      scheduledTime = new Date(scheduledTime.getTime() + duration * 24 * 60 * 60 * 1000);
    } else if (unit === "weeks") {
      scheduledTime = new Date(scheduledTime.getTime() + duration * 7 * 24 * 60 * 60 * 1000);
    }
  } else {
    // For non-delay steps, schedule immediately (or use default delay)
    scheduledTime = new Date(scheduledTime.getTime() + 2 * 60 * 60 * 1000); // 2 hours default
  }

  // Create log entry for next step
  await supabase.from("campaign_logs").insert({
    campaign_id: campaignId,
    step_id: nextStep.id,
    contact_email: contactEmail,
    status: "pending",
    scheduled_time: scheduledTime.toISOString(),
  });
}
















































