import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/reviews/requests
 * Get review requests for a workspace
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { searchParams } = new URL(req.url);
    const workspaceId = searchParams.get("workspaceId");

    if (!workspaceId) {
      return NextResponse.json(
        { error: "workspaceId is required" },
        { status: 400 }
      );
    }

    // Get review requests with related data
    const { data: reviewRequests, error } = await supabase
      .from("review_requests")
      .select(`
        *,
        homeowner_portals!inner(
          id,
          job_id,
          roofing_jobs!inner(
            id,
            workspace_id,
            title,
            leads(
              id,
              first_name,
              last_name,
              email
            )
          )
        )
      `)
      .eq("homeowner_portals.roofing_jobs.workspace_id", workspaceId)
      .order("sent_at", { ascending: false });

    if (error) {
      console.error("Error fetching review requests:", error);
      return NextResponse.json(
        { error: "Failed to fetch review requests" },
        { status: 500 }
      );
    }

    return NextResponse.json({ reviewRequests });
  } catch (error: any) {
    console.error("Error in GET /api/reviews/requests:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/reviews/requests
 * Create a new review request
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const body = await req.json();
    const { portalId, jobId, homeownerEmail, reviewPlatform = "google" } = body;

    if (!portalId || !jobId || !homeownerEmail) {
      return NextResponse.json(
        { error: "portalId, jobId, and homeownerEmail are required" },
        { status: 400 }
      );
    }

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
      return NextResponse.json(
        { error: "Failed to create review request" },
        { status: 500 }
      );
    }

    return NextResponse.json({ reviewRequest });
  } catch (error: any) {
    console.error("Error in POST /api/reviews/requests:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}



























