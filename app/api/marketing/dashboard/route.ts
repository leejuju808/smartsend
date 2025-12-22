// Block 254900 — SmartSend Marketing Engine v1
// Marketing Dashboard API
// Returns comprehensive marketing metrics and KPIs

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: { persistSession: false },
    });

    const { searchParams } = new URL(req.url);
    const workspaceId = searchParams.get("workspace_id");
    const companyId = searchParams.get("company_id");
    const period = searchParams.get("period") || "month"; // week, month, quarter, year, all

    if (!workspaceId) {
      return NextResponse.json(
        { error: "workspace_id is required" },
        { status: 400 }
      );
    }

    // Calculate date range
    const now = new Date();
    let startDate: Date;
    switch (period) {
      case "week":
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case "month":
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case "quarter":
        startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        break;
      case "year":
        startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(0); // All time
    }

    const startDateISO = startDate.toISOString();

    // Build query filters
    const workspaceFilter = { workspace_id: workspaceId };
    const dateFilter = { created_at: { gte: startDateISO } };
    const companyFilter = companyId ? { roofing_company_id: companyId } : {};

    // 1. REVIEWS METRICS
    const { count: reviewsCount } = await supabase
      .from("reviews")
      .select("*", { count: "exact", head: true })
      .match(workspaceFilter)
      .match(companyFilter)
      .gte("received_at", startDateISO);

    const { data: reviewsData } = await supabase
      .from("reviews")
      .select("rating")
      .match(workspaceFilter)
      .match(companyFilter)
      .gte("received_at", startDateISO);

    const averageRating =
      reviewsData && reviewsData.length > 0
        ? reviewsData.reduce((sum, r) => sum + (r.rating || 0), 0) /
          reviewsData.length
        : 0;

    const fiveStarReviews =
      reviewsData?.filter((r) => r.rating === 5).length || 0;

    // 2. SEO KEYWORDS METRICS
    const { count: totalKeywords } = await supabase
      .from("seo_keywords")
      .select("*", { count: "exact", head: true })
      .match(workspaceFilter)
      .match(companyFilter);

    const { data: keywordsData } = await supabase
      .from("seo_keywords")
      .select("ranking, previous_ranking, ranking_change")
      .match(workspaceFilter)
      .match(companyFilter)
      .not("ranking", "is", null);

    const keywordsMovingUp =
      keywordsData?.filter((k) => k.ranking_change && k.ranking_change > 0)
        .length || 0;
    const keywordsMovingDown =
      keywordsData?.filter((k) => k.ranking_change && k.ranking_change < 0)
        .length || 0;
    const top10Rankings =
      keywordsData?.filter((k) => k.ranking && k.ranking <= 10).length || 0;

    // 3. SOCIAL MEDIA POSTS METRICS
    const { count: postsCount } = await supabase
      .from("marketing_posts")
      .select("*", { count: "exact", head: true })
      .match(workspaceFilter)
      .match(companyFilter)
      .gte("created_at", startDateISO);

    const { count: postedCount } = await supabase
      .from("marketing_posts")
      .select("*", { count: "exact", head: true })
      .match(workspaceFilter)
      .match(companyFilter)
      .eq("posted", true)
      .gte("posted_at", startDateISO);

    // Get posts by platform
    const { data: postsByPlatform } = await supabase
      .from("marketing_posts")
      .select("platform, posted")
      .match(workspaceFilter)
      .match(companyFilter)
      .gte("created_at", startDateISO);

    const platformStats: Record<string, { total: number; posted: number }> =
      {};
    postsByPlatform?.forEach((post) => {
      if (!platformStats[post.platform]) {
        platformStats[post.platform] = { total: 0, posted: 0 };
      }
      platformStats[post.platform].total++;
      if (post.posted) {
        platformStats[post.platform].posted++;
      }
    });

    // 4. BEFORE/AFTER GALLERIES METRICS
    const { count: galleriesCount } = await supabase
      .from("before_after_galleries")
      .select("*", { count: "exact", head: true })
      .match(workspaceFilter)
      .match(companyFilter)
      .gte("created_at", startDateISO);

    const { count: publicGalleriesCount } = await supabase
      .from("before_after_galleries")
      .select("*", { count: "exact", head: true })
      .match(workspaceFilter)
      .match(companyFilter)
      .eq("is_public", true)
      .gte("created_at", startDateISO);

    // 5. CUSTOMER TESTIMONIALS METRICS
    const { count: testimonialsCount } = await supabase
      .from("customer_testimonials")
      .select("*", { count: "exact", head: true })
      .match(workspaceFilter)
      .match(companyFilter)
      .gte("created_at", startDateISO);

    const { count: approvedTestimonialsCount } = await supabase
      .from("customer_testimonials")
      .select("*", { count: "exact", head: true })
      .match(workspaceFilter)
      .match(companyFilter)
      .eq("is_approved", true)
      .gte("created_at", startDateISO);

    // 6. REVIEW REQUEST AUTOMATION METRICS
    const { data: reviewRequests } = await supabase
      .from("review_request_automation")
      .select("status, review_received")
      .match(workspaceFilter)
      .match(companyFilter)
      .gte("created_at", startDateISO);

    const reviewRequestsSent = reviewRequests?.length || 0;
    const reviewsReceivedFromRequests =
      reviewRequests?.filter((r) => r.review_received === true).length || 0;
    const reviewResponseRate =
      reviewRequestsSent > 0
        ? (reviewsReceivedFromRequests / reviewRequestsSent) * 100
        : 0;

    // 7. LEAD GENERATION FROM MARKETING (estimate based on job source tracking)
    // This would require linking jobs to marketing sources
    // For now, we'll estimate based on completed jobs with SEO keywords
    const { data: jobsWithSEO } = await supabase
      .from("seo_keywords")
      .select("associated_job_id")
      .match(workspaceFilter)
      .match(companyFilter)
      .not("associated_job_id", "is", null);

    const leadsFromSEO = jobsWithSEO?.length || 0;

    // 8. GOOGLE BUSINESS PROFILE SYNC STATUS
    const { data: gbpSync } = await supabase
      .from("google_business_profile_sync")
      .select("is_connected, last_sync_at, status")
      .match(workspaceFilter)
      .match(companyFilter)
      .maybeSingle();

    // Build response
    const dashboard = {
      period,
      date_range: {
        start: startDateISO,
        end: now.toISOString(),
      },
      metrics: {
        reviews: {
          total: reviewsCount || 0,
          average_rating: Math.round(averageRating * 10) / 10,
          five_star_count: fiveStarReviews,
          response_rate: reviewResponseRate,
        },
        seo: {
          total_keywords: totalKeywords || 0,
          keywords_moving_up: keywordsMovingUp,
          keywords_moving_down: keywordsMovingDown,
          top_10_rankings: top10Rankings,
        },
        social_media: {
          total_posts: postsCount || 0,
          posted: postedCount || 0,
          draft: (postsCount || 0) - (postedCount || 0),
          by_platform: platformStats,
        },
        before_after: {
          total_galleries: galleriesCount || 0,
          public_galleries: publicGalleriesCount || 0,
        },
        testimonials: {
          total: testimonialsCount || 0,
          approved: approvedTestimonialsCount || 0,
          pending: (testimonialsCount || 0) - (approvedTestimonialsCount || 0),
        },
        automation: {
          review_requests_sent: reviewRequestsSent,
          reviews_received: reviewsReceivedFromRequests,
          response_rate: Math.round(reviewResponseRate * 10) / 10,
        },
        lead_generation: {
          estimated_from_seo: leadsFromSEO,
          estimated_from_reviews: Math.floor((reviewsCount || 0) * 0.3), // Estimate 30% of reviews generate leads
        },
        google_business_profile: {
          is_connected: gbpSync?.is_connected || false,
          last_sync_at: gbpSync?.last_sync_at || null,
          sync_status: gbpSync?.status || "not_connected",
        },
      },
      summary: {
        reviews_this_period: reviewsCount || 0,
        average_rating: Math.round(averageRating * 10) / 10,
        seo_keywords_moving_up: keywordsMovingUp,
        social_posts_this_week: postsByPlatform?.length || 0,
        before_after_galleries: galleriesCount || 0,
        customer_testimonials: testimonialsCount || 0,
        leads_from_seo: leadsFromSEO,
        leads_from_reviews: Math.floor((reviewsCount || 0) * 0.3),
      },
    };

    return NextResponse.json(dashboard, { status: 200 });
  } catch (error: any) {
    console.error("Error fetching marketing dashboard:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}






















