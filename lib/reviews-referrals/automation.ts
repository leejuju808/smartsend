import { createClient } from "@/lib/supabase/server";

/**
 * Send review request email to homeowner
 */
export async function sendReviewRequest(options: {
  portalId: string;
  jobId: string;
  homeownerEmail: string;
  reviewPlatform?: "google" | "facebook" | "yelp";
}) {
  const supabase = await createClient();
  const { portalId, jobId, homeownerEmail, reviewPlatform = "google" } = options;

  // Get job and workspace info
  const { data: job } = await supabase
    .from("roofing_jobs")
    .select("workspace_id, title, leads(first_name, last_name)")
    .eq("id", jobId)
    .single();

  if (!job) {
    throw new Error("Job not found");
  }

  // Get workspace info for review links
  const { data: workspace } = await supabase
    .from("workspaces")
    .select("id, name")
    .eq("id", job.workspace_id)
    .single();

  // Get review links for workspace
  const { data: reviewLinks } = await supabase
    .from("review_links")
    .select("link_type, review_url")
    .eq("workspace_id", job.workspace_id)
    .eq("is_active", true)
    .eq("is_primary", true);

  const googleReviewLink = reviewLinks?.find((l) => l.link_type === "google")?.review_url;
  const facebookReviewLink = reviewLinks?.find((l) => l.link_type === "facebook")?.review_url;
  const yelpReviewLink = reviewLinks?.find((l) => l.link_type === "bbb")?.review_url;

  // Create review request record
  const { data: reviewRequest, error } = await supabase
    .from("review_requests")
    .insert({
      portal_id: portalId,
      job_id: jobId,
      homeowner_email: homeownerEmail,
      status: "sent",
      review_platform: reviewPlatform,
    })
    .select()
    .single();

  if (error) {
    console.error("Error creating review request:", error);
    throw error;
  }

  // TODO: Send email using email service
  // For now, we'll just log it
  console.log("Review request created:", reviewRequest.id);

  return reviewRequest;
}

/**
 * Schedule review follow-up emails (Day 1, Day 3, Day 7)
 */
export async function scheduleReviewFollowUps(reviewRequestId: string) {
  const supabase = await createClient();

  // Get review request
  const { data: reviewRequest } = await supabase
    .from("review_requests")
    .select("*")
    .eq("id", reviewRequestId)
    .single();

  if (!reviewRequest || reviewRequest.status === "completed") {
    return; // Don't send follow-ups if already completed
  }

  const sentAt = new Date(reviewRequest.sent_at);
  const day1 = new Date(sentAt);
  day1.setDate(day1.getDate() + 1);
  const day3 = new Date(sentAt);
  day3.setDate(day3.getDate() + 3);
  const day7 = new Date(sentAt);
  day7.setDate(day7.getDate() + 7);

  // Schedule follow-ups (store in a follow-ups table or use existing email scheduling)
  // For now, we'll create entries that can be processed by a cron job
  const followUps = [
    {
      review_request_id: reviewRequestId,
      scheduled_for: day1.toISOString(),
      message: "Hope the roof looks great — 30 seconds to leave a review?",
    },
    {
      review_request_id: reviewRequestId,
      scheduled_for: day3.toISOString(),
      message: "Hope the roof looks great — 30 seconds to leave a review?",
    },
    {
      review_request_id: reviewRequestId,
      scheduled_for: day7.toISOString(),
      message: "Final request — helps a ton.",
    },
  ];

  // TODO: Store in follow-ups table or schedule via email service
  console.log("Scheduled follow-ups:", followUps);

  return followUps;
}

/**
 * Check if review was left and update status
 */
export async function checkReviewStatus(reviewRequestId: string) {
  const supabase = await createClient();

  // Check if review was completed (this would integrate with review platform APIs)
  // For now, we'll just check if status is already completed
  const { data: reviewRequest } = await supabase
    .from("review_requests")
    .select("status")
    .eq("id", reviewRequestId)
    .single();

  return reviewRequest?.status === "completed";
}

/**
 * Get referral link for homeowner portal
 */
export async function getReferralLink(portalId: string) {
  const supabase = await createClient();

  const { data: referralLink } = await supabase
    .from("referral_links")
    .select("*")
    .eq("portal_id", portalId)
    .single();

  return referralLink;
}

/**
 * Track referral link click
 */
export async function trackReferralClick(refCode: string) {
  const supabase = await createClient();

  // Get current clicks and increment
  const { data: link } = await supabase
    .from("referral_links")
    .select("clicks")
    .eq("ref_code", refCode.toUpperCase())
    .single();

  if (link) {
    const { error } = await supabase
      .from("referral_links")
      .update({
        clicks: (link.clicks || 0) + 1,
      })
      .eq("ref_code", refCode.toUpperCase());

    if (error) {
      console.error("Error tracking referral click:", error);
    }
  }
}



























