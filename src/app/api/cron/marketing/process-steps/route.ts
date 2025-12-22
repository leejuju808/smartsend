// Block 239000 — SmartSend Roofing Marketing Hub v1
// GET /api/cron/marketing/process-steps - Process pending campaign steps
// This should be called periodically (e.g., every 5 minutes) to process campaign steps

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  try {
    // Verify cron secret (if configured)
    const authHeader = req.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;
    
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = createClient();

    // Find all active campaign instances that are ready for next step
    const now = new Date().toISOString();
    
    const { data: readyInstances, error: instancesError } = await supabase
      .from("marketing_campaign_instances")
      .select(`
        *,
        marketing_campaigns!inner(
          *,
          marketing_steps(
            id,
            step_order,
            delay_hours,
            channel,
            subject,
            content,
            personalization_tokens
          )
        )
      `)
      .eq("status", "active")
      .lte("next_step_at", now)
      .limit(50); // Process up to 50 at a time

    if (instancesError) {
      console.error("[Marketing Hub Cron] Error fetching instances:", instancesError);
      return NextResponse.json(
        { error: "Failed to fetch instances" },
        { status: 500 }
      );
    }

    if (!readyInstances || readyInstances.length === 0) {
      return NextResponse.json({
        success: true,
        processed: 0,
        message: "No instances ready for processing",
      });
    }

    let processed = 0;
    let failed = 0;
    const results: any[] = [];

    // Process each instance
    for (const instance of readyInstances) {
      try {
        // Get current step
        const currentStep = instance.marketing_campaigns.marketing_steps?.find(
          (step: any) => step.step_order === instance.current_step
        );

        if (!currentStep) {
          // No more steps, mark as completed
          await supabase
            .from("marketing_campaign_instances")
            .update({
              status: "completed",
              completed_at: now,
            })
            .eq("id", instance.id);
          
          processed++;
          results.push({ instance_id: instance.id, status: "completed", reason: "no_more_steps" });
          continue;
        }

        // Get target information for personalization
        let lead = null;
        let homeowner = null;
        let job = null;

        if (instance.lead_id) {
          const { data: leadData } = await supabase
            .from("leads")
            .select("*")
            .eq("id", instance.lead_id)
            .single();
          lead = leadData;
        }

        if (instance.homeowner_id) {
          const { data: homeownerData } = await supabase
            .from("homeowners")
            .select("*")
            .eq("id", instance.homeowner_id)
            .single();
          homeowner = homeownerData;
        }

        if (instance.job_id) {
          const { data: jobData } = await supabase
            .from("roofing_jobs")
            .select("*")
            .eq("id", instance.job_id)
            .single();
          job = jobData;
        }

        // Personalize content
        let content = currentStep.content;
        let subject = currentStep.subject || "";

        if (lead) {
          content = content.replace(/\{\{FIRST_NAME\}\}/g, lead.first_name || "");
          content = content.replace(/\{\{LAST_NAME\}\}/g, lead.last_name || "");
          content = content.replace(/\{\{EMAIL\}\}/g, lead.email || "");
          if (subject) {
            subject = subject.replace(/\{\{FIRST_NAME\}\}/g, lead.first_name || "");
          }
        }

        if (job) {
          content = content.replace(/\{\{JOB_TYPE\}\}/g, job.job_type || "roofing project");
          content = content.replace(/\{\{JOB_VALUE\}\}/g, job.job_value?.toString() || "");
        }

        // Replace other common tokens
        content = content.replace(/\{\{PHONE_NUMBER\}\}/g, "[PHONE_NUMBER]"); // TODO: Get from workspace/company
        content = content.replace(/\{\{COMPANY_NAME\}\}/g, "[COMPANY_NAME]"); // TODO: Get from workspace/company
        content = content.replace(/\{\{REVIEW_LINK\}\}/g, "[REVIEW_LINK]"); // TODO: Get from workspace settings
        content = content.replace(/\{\{YELP_LINK\}\}/g, "[YELP_LINK]"); // TODO: Get from workspace settings
        content = content.replace(/\{\{REFERRAL_LINK\}\}/g, "[REFERRAL_LINK]"); // TODO: Generate referral link

        // Send message based on channel
        let messageId: string | null = null;
        let sendStatus = "sent";

        if (currentStep.channel === "sms") {
          const phoneNumber = lead?.phone || homeowner?.phone;
          if (phoneNumber) {
            // TODO: Integrate with SMS sending service
            // For now, just log it
            console.log(`[Marketing Hub] Would send SMS to ${phoneNumber}: ${content}`);
            
            // In production, call your SMS sending API here
            // const smsResult = await sendSMS(phoneNumber, content, {...});
            // messageId = smsResult.messageId;
          } else {
            sendStatus = "skipped";
            results.push({
              instance_id: instance.id,
              status: "skipped",
              reason: "no_phone_number",
            });
            continue;
          }
        } else if (currentStep.channel === "email") {
          const emailAddress = lead?.email || homeowner?.email;
          if (emailAddress) {
            // TODO: Integrate with email sending service
            // For now, just log it
            console.log(`[Marketing Hub] Would send email to ${emailAddress}: ${subject} - ${content}`);
            
            // In production, call your email sending API here
            // const emailResult = await sendEmail(emailAddress, subject, content, {...});
            // messageId = emailResult.messageId;
          } else {
            sendStatus = "skipped";
            results.push({
              instance_id: instance.id,
              status: "skipped",
              reason: "no_email_address",
            });
            continue;
          }
        }

        // Log the step
        const { error: logError } = await supabase
          .from("marketing_logs")
          .insert({
            campaign_id: instance.campaign_id,
            lead_id: instance.lead_id,
            homeowner_id: instance.homeowner_id,
            job_id: instance.job_id,
            step_id: currentStep.id,
            step_number: instance.current_step,
            status: sendStatus,
            channel: currentStep.channel,
            message_id: messageId,
            sent_at: sendStatus === "sent" ? now : null,
          });

        if (logError) {
          console.error("[Marketing Hub Cron] Log error:", logError);
        }

        // Get next step
        const nextStep = instance.marketing_campaigns.marketing_steps?.find(
          (step: any) => step.step_order === instance.current_step + 1
        );

        if (nextStep) {
          // Update instance to next step
          const nextStepAt = new Date(Date.now() + nextStep.delay_hours * 60 * 60 * 1000);
          
          await supabase
            .from("marketing_campaign_instances")
            .update({
              current_step: instance.current_step + 1,
              next_step_at: nextStepAt.toISOString(),
              updated_at: now,
            })
            .eq("id", instance.id);
        } else {
          // No more steps, mark as completed
          await supabase
            .from("marketing_campaign_instances")
            .update({
              status: "completed",
              completed_at: now,
              updated_at: now,
            })
            .eq("id", instance.id);
        }

        processed++;
        results.push({
          instance_id: instance.id,
          status: "processed",
          step: instance.current_step,
          channel: currentStep.channel,
        });
      } catch (error: any) {
        failed++;
        console.error(`[Marketing Hub Cron] Error processing instance ${instance.id}:`, error);
        results.push({
          instance_id: instance.id,
          status: "failed",
          error: error.message,
        });
      }
    }

    return NextResponse.json({
      success: true,
      processed,
      failed,
      total: readyInstances.length,
      results,
    });
  } catch (error: any) {
    console.error("[Marketing Hub Cron] Unexpected error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

























