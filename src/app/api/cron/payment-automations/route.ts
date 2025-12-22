import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { sendMail } from "@/lib/mailer";

/**
 * POST /api/cron/payment-automations
 * Cron job endpoint to process payment automation triggers
 * Should be called every hour or as needed
 */
export async function POST(req: NextRequest) {
  try {
    // Verify cron secret if needed
    const authHeader = req.headers.get("authorization");
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = supabaseAdmin();

    // Run database functions to check for follow-ups
    await supabase.rpc("check_deposit_followups");
    await supabase.rpc("check_overdue_payments");

    // Process pending automation triggers
    const { data: automations, error: fetchError } = await supabase
      .from("invoice_automation_log")
      .select(`
        *,
        payment_milestones (
          *,
          payment_schedules (
            *,
            contract_documents (
              *,
              leads (
                first_name,
                last_name,
                email,
                phone
              )
            ),
            roofing_jobs (
              title,
              address
            )
          )
        )
      `)
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(50); // Process 50 at a time

    if (fetchError) {
      console.error("Error fetching automations:", fetchError);
      return NextResponse.json(
        { error: "Failed to fetch automations", details: fetchError.message },
        { status: 500 }
      );
    }

    let processed = 0;
    let failed = 0;

    for (const automation of automations || []) {
      try {
        const milestone = automation.payment_milestones;
        const schedule = milestone?.payment_schedules;
        const contract = schedule?.contract_documents;
        const lead = contract?.leads;
        const job = schedule?.roofing_jobs;

        if (!lead?.email) {
          // Mark as skipped if no email
          await supabase
            .from("invoice_automation_log")
            .update({ status: "skipped", processed_at: new Date().toISOString() })
            .eq("id", automation.id);
          continue;
        }

        // Generate email based on automation type
        let subject = "";
        let html = "";

        switch (automation.automation_type) {
          case "deposit_followup_24h":
            subject = `Reminder: Deposit Payment Due - ${job?.title || "Your Roofing Job"}`;
            html = generateDepositFollowupEmail({
              lead,
              milestone,
              job,
              amount: milestone.amount,
            });
            break;

          case "overdue_reminder":
            const daysOverdue = automation.metadata?.days_overdue || 0;
            subject = `Urgent: Payment Overdue - ${job?.title || "Your Roofing Job"}`;
            html = generateOverdueReminderEmail({
              lead,
              milestone,
              job,
              amount: milestone.amount,
              daysOverdue,
            });
            break;

          default:
            continue; // Skip unknown types
        }

        // Send email
        try {
          await sendMail({
            to: lead.email,
            subject,
            html,
            from: process.env.FROM_EMAIL || "noreply@smartsendhq.com",
          });

          await supabase
            .from("invoice_automation_log")
            .update({ status: "sent", processed_at: new Date().toISOString() })
            .eq("id", automation.id);
          processed++;
        } catch (emailError: any) {
          console.error(`Failed to send email for automation ${automation.id}:`, emailError);
          await supabase
            .from("invoice_automation_log")
            .update({ status: "failed", processed_at: new Date().toISOString() })
            .eq("id", automation.id);
          failed++;
        }
      } catch (error: any) {
        console.error(`Error processing automation ${automation.id}:`, error);
        await supabase
          .from("invoice_automation_log")
          .update({ status: "failed", processed_at: new Date().toISOString() })
          .eq("id", automation.id);
        failed++;
      }
    }

    return NextResponse.json({
      success: true,
      processed,
      failed,
      total: automations?.length || 0,
    });
  } catch (error: any) {
    console.error("Error in payment automations cron:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}

function generateDepositFollowupEmail({ lead, milestone, job, amount }: any): string {
  const homeownerName = lead
    ? `${lead.first_name || ""} ${lead.last_name || ""}`.trim()
    : "Homeowner";
  const paymentLink = `${process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"}/pay/invoice/${milestone.invoice_id || ""}`;

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #2563eb; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
    .content { background: #f9fafb; padding: 30px; border: 1px solid #e5e7eb; }
    .button { display: inline-block; background: #2563eb; color: white; padding: 15px 30px; text-decoration: none; border-radius: 6px; font-weight: bold; margin: 20px 0; }
  </style>
</head>
<body>
  <div class="header">
    <h1>Deposit Payment Reminder</h1>
  </div>
  
  <div class="content">
    <p>Hi ${homeownerName},</p>
    
    <p>Just a friendly reminder that your <strong>${milestone.label}</strong> is due.</p>
    
    <p><strong>Amount:</strong> $${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
    
    <div style="text-align: center;">
      <a href="${paymentLink}" class="button">Pay Deposit Now</a>
    </div>
    
    <p>Thank you for your business!</p>
  </div>
</body>
</html>
  `.trim();
}

function generateOverdueReminderEmail({ lead, milestone, job, amount, daysOverdue }: any): string {
  const homeownerName = lead
    ? `${lead.first_name || ""} ${lead.last_name || ""}`.trim()
    : "Homeowner";
  const paymentLink = `${process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"}/pay/invoice/${milestone.invoice_id || ""}`;

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #dc2626; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
    .content { background: #f9fafb; padding: 30px; border: 1px solid #e5e7eb; }
    .button { display: inline-block; background: #dc2626; color: white; padding: 15px 30px; text-decoration: none; border-radius: 6px; font-weight: bold; margin: 20px 0; }
    .urgent { background: #fef2f2; border-left: 4px solid #dc2626; padding: 15px; margin: 20px 0; }
  </style>
</head>
<body>
  <div class="header">
    <h1>⚠️ Payment Overdue</h1>
  </div>
  
  <div class="content">
    <p>Hi ${homeownerName},</p>
    
    <div class="urgent">
      <p><strong>Your payment is ${daysOverdue} day${daysOverdue > 1 ? 's' : ''} overdue.</strong></p>
      <p><strong>Amount Due:</strong> $${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
      <p><strong>Milestone:</strong> ${milestone.label}</p>
    </div>
    
    <p>Please pay this invoice as soon as possible to avoid any delays in your project.</p>
    
    <div style="text-align: center;">
      <a href="${paymentLink}" class="button">Pay Now</a>
    </div>
    
    <p>If you have any questions, please contact us immediately.</p>
  </div>
</body>
</html>
  `.trim();
}

























