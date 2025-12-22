import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { scheduleReviewFollowUps } from "@/lib/reviews-referrals/automation";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false },
});

/**
 * POST /api/cron/review-followups
 * Cron job to send review follow-up emails (Day 1, Day 3, Day 7)
 * Should be called daily
 */
export async function POST(req: NextRequest) {
  try {
    // Verify cron secret if needed
    const authHeader = req.headers.get("authorization");
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const now = new Date();
    const day1 = new Date(now);
    day1.setDate(day1.getDate() - 1);
    const day3 = new Date(now);
    day3.setDate(day3.getDate() - 3);
    const day7 = new Date(now);
    day7.setDate(day7.getDate() - 7);

    // Get review requests that need follow-ups
    // Day 1 follow-up: sent 1 day ago, status is 'sent', no follow-up sent yet
    const { data: day1Requests } = await supabase
      .from("review_requests")
      .select("*")
      .eq("status", "sent")
      .gte("sent_at", day1.toISOString())
      .lt("sent_at", new Date(day1.getTime() + 24 * 60 * 60 * 1000).toISOString());

    // Day 3 follow-up: sent 3 days ago, status is 'sent' or 'clicked'
    const { data: day3Requests } = await supabase
      .from("review_requests")
      .select("*")
      .in("status", ["sent", "clicked"])
      .gte("sent_at", day3.toISOString())
      .lt("sent_at", new Date(day3.getTime() + 24 * 60 * 60 * 1000).toISOString());

    // Day 7 follow-up: sent 7 days ago, status is 'sent' or 'clicked'
    const { data: day7Requests } = await supabase
      .from("review_requests")
      .select("*")
      .in("status", ["sent", "clicked"])
      .gte("sent_at", day7.toISOString())
      .lt("sent_at", new Date(day7.getTime() + 24 * 60 * 60 * 1000).toISOString());

    const allRequests = [
      ...(day1Requests || []),
      ...(day3Requests || []),
      ...(day7Requests || []),
    ];

    let sentCount = 0;
    let errorCount = 0;

    for (const request of allRequests) {
      try {
        // Determine which follow-up message to send
        const sentAt = new Date(request.sent_at);
        const daysSinceSent = Math.floor(
          (now.getTime() - sentAt.getTime()) / (1000 * 60 * 60 * 24)
        );

        let message = "";
        if (daysSinceSent === 1) {
          message = "Hope the roof looks great — 30 seconds to leave a review?";
        } else if (daysSinceSent === 3) {
          message = "Hope the roof looks great — 30 seconds to leave a review?";
        } else if (daysSinceSent === 7) {
          message = "Final request — helps a ton.";
        }

        if (message) {
          // TODO: Send email via email service
          // For now, we'll just log it
          console.log(`Sending follow-up to ${request.homeowner_email}: ${message}`);

          // Update status to 'clicked' if it was just 'sent' (to track engagement)
          if (request.status === "sent") {
            await supabase
              .from("review_requests")
              .update({ status: "clicked" })
              .eq("id", request.id);
          }

          sentCount++;
        }
      } catch (error) {
        console.error(`Error sending follow-up for request ${request.id}:`, error);
        errorCount++;
      }
    }

    return NextResponse.json({
      success: true,
      sent: sentCount,
      errors: errorCount,
      total: allRequests.length,
    });
  } catch (error: any) {
    console.error("Error in review follow-ups cron:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}



























