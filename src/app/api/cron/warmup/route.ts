// Block 76000 — Warm-Up Cron Job
// Runs daily to send warm-up emails and update reputation

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Generate a realistic warm-up email
function generateWarmupEmail(domain: string, day: number): { subject: string; body: string } {
  const subjects = [
    "Quick question about your business",
    "Following up on our conversation",
    "Checking in",
    "Hope you're doing well",
    "Quick update",
  ];
  
  const bodies = [
    `Hi there,\n\nI wanted to reach out and see how things are going. Let me know if you need anything!\n\nBest regards`,
    `Hello,\n\nJust checking in to see if you have any questions. Feel free to reach out anytime.\n\nThanks!`,
    `Hi,\n\nHope you're having a great week. Let me know if there's anything I can help with.\n\nBest`,
  ];

  const subject = subjects[day % subjects.length];
  const body = bodies[day % bodies.length];
  
  return { subject, body };
}

// Send warm-up email (placeholder - integrate with your email provider)
async function sendWarmupEmail(
  domain: string,
  to: string,
  subject: string,
  body: string
): Promise<{ delivered: boolean; opened?: boolean; replied?: boolean; bounced?: boolean }> {
  // TODO: Integrate with actual email sending service
  // For now, simulate sending with realistic success rates
  const delivered = Math.random() > 0.05; // 95% deliverability
  const opened = delivered && Math.random() > 0.3; // 70% open rate if delivered
  const replied = opened && Math.random() > 0.8; // 20% reply rate if opened
  const bounced = !delivered && Math.random() > 0.9; // 10% bounce rate if not delivered
  
  return { delivered, opened, replied, bounced };
}

export async function POST(req: NextRequest) {
  try {
    // Verify cron secret
    const authHeader = req.headers.get("authorization");
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    console.log("🔥 Starting warm-up cron job...");

    // Get all domains that are warming up
    const { data: warmingDomains, error: domainsError } = await supabaseAdmin
      .from("sending_domains")
      .select("*")
      .eq("warmup_status", "warming");

    if (domainsError) throw domainsError;

    if (!warmingDomains || warmingDomains.length === 0) {
      return NextResponse.json({ message: "No domains warming up", processed: 0 });
    }

    let totalProcessed = 0;
    let totalSent = 0;
    let totalDelivered = 0;
    let totalOpened = 0;
    let totalReplied = 0;
    let totalBounced = 0;

    for (const domain of warmingDomains) {
      try {
        // Calculate which day of warm-up we're on
        const warmupStartDate = domain.warmup_started_at 
          ? new Date(domain.warmup_started_at)
          : new Date();
        const daysSinceStart = Math.floor(
          (Date.now() - warmupStartDate.getTime()) / (1000 * 60 * 60 * 24)
        ) + 1;

        if (daysSinceStart > 30) {
          // Warm-up complete
          await supabaseAdmin
            .from("sending_domains")
            .update({
              warmup_status: "ready",
              warmup_completed_at: new Date().toISOString(),
            })
            .eq("id", domain.id);
          continue;
        }

        // Get today's schedule
        const { data: schedule, error: scheduleError } = await supabaseAdmin
          .from("warmup_schedule")
          .select("*")
          .eq("domain_id", domain.id)
          .eq("day", daysSinceStart)
          .eq("status", "pending")
          .single();

        if (scheduleError || !schedule) {
          console.log(`No schedule for domain ${domain.domain} day ${daysSinceStart}`);
          continue;
        }

        // Send warm-up emails
        const emailsToSend = schedule.emails_to_send;
        let sent = 0;
        let delivered = 0;
        let opened = 0;
        let replied = 0;
        let bounced = 0;

        // TODO: Get warm-up recipient list (internal network, seed list, etc.)
        // For now, use placeholder recipients
        const warmupRecipients = Array(emailsToSend).fill(null).map((_, i) => 
          `warmup-${i}@smartsend-warmup.net`
        );

        for (const recipient of warmupRecipients) {
          const email = generateWarmupEmail(domain.domain, daysSinceStart);
          const result = await sendWarmupEmail(
            domain.domain,
            recipient,
            email.subject,
            email.body
          );

          sent++;
          if (result.delivered) delivered++;
          if (result.opened) opened++;
          if (result.replied) replied++;
          if (result.bounced) bounced++;

          // Small delay between sends
          await new Promise(resolve => setTimeout(resolve, 1000));
        }

        // Update schedule
        await supabaseAdmin
          .from("warmup_schedule")
          .update({
            status: "sent",
            sent_at: new Date().toISOString(),
          })
          .eq("id", schedule.id);

        // Create or update warm-up log
        const logDate = new Date().toISOString().split("T")[0];
        const { data: existingLog } = await supabaseAdmin
          .from("warmup_logs")
          .select("id")
          .eq("domain_id", domain.id)
          .eq("log_date", logDate)
          .single();

        if (existingLog) {
          await supabaseAdmin
            .from("warmup_logs")
            .update({
              sent: sent,
              delivered: delivered,
              opened: opened,
              replied: replied,
              bounced: bounced,
              deliverability_rate: sent > 0 ? (delivered / sent) * 100 : 0,
              open_rate: delivered > 0 ? (opened / delivered) * 100 : 0,
              reply_rate: delivered > 0 ? (replied / delivered) * 100 : 0,
              bounce_rate: sent > 0 ? (bounced / sent) * 100 : 0,
            })
            .eq("id", existingLog.id);
        } else {
          await supabaseAdmin
            .from("warmup_logs")
            .insert({
              domain_id: domain.id,
              schedule_id: schedule.id,
              sent: sent,
              delivered: delivered,
              opened: opened,
              replied: replied,
              bounced: bounced,
              deliverability_rate: sent > 0 ? (delivered / sent) * 100 : 0,
              open_rate: delivered > 0 ? (opened / delivered) * 100 : 0,
              reply_rate: delivered > 0 ? (replied / delivered) * 100 : 0,
              bounce_rate: sent > 0 ? (bounced / sent) * 100 : 0,
              log_date: logDate,
            });
        }

        // Update domain reputation
        await supabaseAdmin.rpc("update_domain_reputation", {
          p_domain_id: domain.id,
        });

        // Check if domain should be throttled
        const bounceRate = sent > 0 ? (bounced / sent) * 100 : 0;
        if (bounceRate > 10) {
          await supabaseAdmin
            .from("sending_domains")
            .update({
              is_throttled: true,
              throttle_reason: "High bounce rate detected",
              throttle_until: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
            })
            .eq("id", domain.id);
        }

        totalProcessed++;
        totalSent += sent;
        totalDelivered += delivered;
        totalOpened += opened;
        totalReplied += replied;
        totalBounced += bounced;

        console.log(`✅ Processed ${domain.domain}: ${sent} sent, ${delivered} delivered`);
      } catch (error: any) {
        console.error(`Error processing domain ${domain.domain}:`, error);
        continue;
      }
    }

    return NextResponse.json({
      success: true,
      processed: totalProcessed,
      stats: {
        sent: totalSent,
        delivered: totalDelivered,
        opened: totalOpened,
        replied: totalReplied,
        bounced: totalBounced,
      },
    });
  } catch (error: any) {
    console.error("Warm-up cron error:", error);
    return NextResponse.json(
      { error: error.message || "Warm-up cron failed" },
      { status: 500 }
    );
  }
}



























