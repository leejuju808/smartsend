import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/inbox/owner/pipeline
 * Fetch job pipeline data for Pipeline tab
 * Returns jobs_conversions with contact info, sorted by various options
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();
    
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const sort = searchParams.get("sort") || "value_desc"; // value_desc, probability_desc, close_date_asc

    // Get user's accessible campaigns
    const { data: membership } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", user.id)
      .single();

    let campaignIds: string[] = [];

    if (membership?.workspace_id) {
      const { data: campaigns } = await supabase
        .from("campaigns")
        .select("id")
        .eq("workspace_id", membership.workspace_id);
      campaignIds = campaigns?.map((c) => c.id) || [];
    } else {
      // Fallback: user-owned campaigns
      const { data: userCampaigns } = await supabase
        .from("campaigns")
        .select("id")
        .eq("user_id", user.id);
      campaignIds = userCampaigns?.map((c) => c.id) || [];
    }

    if (campaignIds.length === 0) {
      return NextResponse.json({ jobs: [] });
    }

    // Fetch jobs_conversions with contact info
    let query = supabase
      .from("jobs_conversions")
      .select(`
        id,
        thread_id,
        contact_id,
        job_type,
        estimated_value,
        probability,
        pipeline_stage,
        expected_close_date,
        updated_at,
        created_at,
        contacts:contact_id (
          first_name,
          last_name,
          email
        )
      `)
      .in("campaign_id", campaignIds)
      .in("pipeline_stage", ["booked", "pending", "won"])
      .order("updated_at", { ascending: false });

    // Apply sorting
    if (sort === "value_desc") {
      query = query.order("estimated_value", { ascending: false, nullsLast: true });
    } else if (sort === "probability_desc") {
      query = query.order("probability", { ascending: false, nullsLast: true });
    } else if (sort === "close_date_asc") {
      query = query.order("expected_close_date", { ascending: true, nullsLast: true });
    }

    const { data: conversions, error: conversionsError } = await query.limit(100);

    if (conversionsError) {
      console.error("Error fetching pipeline:", conversionsError);
      return NextResponse.json(
        { error: "Failed to fetch pipeline" },
        { status: 500 }
      );
    }

    // Format jobs
    const jobs = (conversions || []).map((conv: any) => {
      const contact = conv.contacts;
      const contactName = contact
        ? `${contact.first_name || ""} ${contact.last_name || ""}`.trim() || contact.email
        : "Unknown";

      return {
        id: conv.id,
        thread_id: conv.thread_id,
        contact_name: contactName,
        contact_email: contact?.email || "",
        job_type: conv.job_type,
        estimated_value: conv.estimated_value ? Number(conv.estimated_value) : 0,
        probability: conv.probability || 80,
        pipeline_stage: conv.pipeline_stage || "booked",
        expected_close_date: conv.expected_close_date,
        updated_at: conv.updated_at,
      };
    });

    return NextResponse.json({ jobs });
  } catch (error) {
    console.error("Error in /api/inbox/owner/pipeline:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}



















































