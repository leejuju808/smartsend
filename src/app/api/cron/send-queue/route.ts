// Block 76000 — Send Queue Processor
// Processes queued emails with reputation checks and domain rotation

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Get best available domain for sending
async function getBestDomain(orgId: string): Promise<string | null> {
  const { data: domains } = await supabaseAdmin
    .from("sending_domains")
    .select("*")
    .eq("org_id", orgId)
    .eq("warmup_status", "ready")
    .eq("is_throttled", false)
    .in("sending_reputation", ["good", "excellent"])
    .order("reputation_score", { ascending: false })
    .limit(1)
    .single();

  return domains?.id || null;
}

// Check if domain can send (reputation check)
async function canDomainSend(domainId: string): Promise<boolean> {
  const { data: domain } = await supabaseAdmin
    .from("sending_domains")
    .select("*")
    .eq("id", domainId)
    .single();

  if (!domain) return false;

  // Check warm-up status
  if (domain.warmup_status !== "ready") return false;

  // Check if throttled
  if (domain.is_throttled) {
    if (domain.throttle_until && new Date(domain.throttle_until) > new Date()) {
      return false;
    }
    // Throttle expired, clear it
    await supabaseAdmin
      .from("sending_domains")
      .update({ is_throttled: false, throttle_reason: null, throttle_until: null })
      .eq("id", domainId);
  }

  // Check reputation
  if (domain.sending_reputation === "poor" || domain.reputation_score < 40) {
    return false;
  }

  // Check bounce/complaint rates
  if (domain.bounce_rate > 10 || domain.complaint_rate > 0.5) {
    return false;
  }

  return true;
}

// Send email (placeholder - integrate with your email provider)
async function sendEmail(
  domainId: string,
  recipient: string,
  subject: string,
  body: string
): Promise<{ success: boolean; error?: string }> {
  // TODO: Integrate with actual email sending service
  // Use domain's sending configuration
  
  // Simulate sending
  const success = Math.random() > 0.05; // 95% success rate
  
  return {
    success,
    error: success ? undefined : "Simulated send failure",
  };
}

export async function POST(req: NextRequest) {
  try {
    // Verify cron secret
    const authHeader = req.headers.get("authorization");
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    console.log("📧 Processing send queue...");

    // Get pending emails (limit to prevent overload)
    const { data: queuedEmails, error: queueError } = await supabaseAdmin
      .from("send_queue")
      .select("*")
      .in("status", ["pending", "queued"])
      .lte("scheduled_at", new Date().toISOString())
      .order("created_at", { ascending: true })
      .limit(100);

    if (queueError) throw queueError;

    if (!queuedEmails || queuedEmails.length === 0) {
      return NextResponse.json({ message: "No emails in queue", processed: 0 });
    }

    let processed = 0;
    let sent = 0;
    let failed = 0;
    let throttled = 0;

    for (const email of queuedEmails) {
      try {
        // Update status to sending
        await supabaseAdmin
          .from("send_queue")
          .update({ status: "sending" })
          .eq("id", email.id);

        // Get or assign domain
        let domainId = email.domain_id;
        if (!domainId && email.org_id) {
          domainId = await getBestDomain(email.org_id);
        }

        if (!domainId) {
          await supabaseAdmin
            .from("send_queue")
            .update({
              status: "failed",
              error: "No available sending domain",
            })
            .eq("id", email.id);
          failed++;
          continue;
        }

        // Check if domain can send
        const canSend = await canDomainSend(domainId);
        if (!canSend) {
          await supabaseAdmin
            .from("send_queue")
            .update({
              status: "throttled",
              error: "Domain reputation too low or throttled",
            })
            .eq("id", email.id);
          throttled++;
          continue;
        }

        // Send email
        const result = await sendEmail(
          domainId,
          email.recipient,
          email.subject,
          email.body || email.body_html || ""
        );

        if (result.success) {
          await supabaseAdmin
            .from("send_queue")
            .update({
              status: "sent",
              sent_at: new Date().toISOString(),
              domain_id: domainId,
            })
            .eq("id", email.id);
          sent++;
        } else {
          // Retry logic
          const retries = (email.retries || 0) + 1;
          if (retries < (email.max_retries || 3)) {
            await supabaseAdmin
              .from("send_queue")
              .update({
                status: "queued",
                retries: retries,
                error: result.error,
                scheduled_at: new Date(Date.now() + retries * 5 * 60 * 1000).toISOString(), // Exponential backoff
              })
              .eq("id", email.id);
          } else {
            await supabaseAdmin
              .from("send_queue")
              .update({
                status: "failed",
                retries: retries,
                error: result.error || "Max retries exceeded",
              })
              .eq("id", email.id);
          }
          failed++;
        }

        processed++;

        // Small delay between sends
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (error: any) {
        console.error(`Error processing email ${email.id}:`, error);
        await supabaseAdmin
          .from("send_queue")
          .update({
            status: "failed",
            error: error.message || "Processing error",
          })
          .eq("id", email.id);
        failed++;
      }
    }

    return NextResponse.json({
      success: true,
      processed,
      sent,
      failed,
      throttled,
    });
  } catch (error: any) {
    console.error("Send queue processor error:", error);
    return NextResponse.json(
      { error: error.message || "Send queue processing failed" },
      { status: 500 }
    );
  }
}



























