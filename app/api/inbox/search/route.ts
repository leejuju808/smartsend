// Block 20090 — Inbox Search & Filter API
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getActiveWorkspaceId } from "@/lib/workspace/context";

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();
    const searchParams = req.nextUrl.searchParams;

    const q = searchParams.get("q");
    const lead_stage = searchParams.get("lead_stage") || "all";
    const engagement_level = searchParams.get("engagement_level") || "all";
    const assigned_to = searchParams.get("assigned_to");
    const claims_only = searchParams.get("claims_only") === "true";
    const limit = parseInt(searchParams.get("limit") || "50", 10);

    // Get workspace ID from active workspace
    const workspaceId = await getActiveWorkspaceId();

    if (!workspaceId) {
      return NextResponse.json(
        { error: "Workspace ID required" },
        { status: 400 }
      );
    }

    // First, get campaign IDs for this workspace
    const { data: campaigns, error: campaignsError } = await supabase
      .from("campaigns")
      .select("id")
      .eq("workspace_id", workspaceId);

    if (campaignsError) {
      console.error("Error fetching campaigns:", campaignsError);
      return NextResponse.json(
        { error: "Failed to load campaigns" },
        { status: 500 }
      );
    }

    const campaignIds = campaigns?.map((c) => c.id) || [];

    if (campaignIds.length === 0) {
      return NextResponse.json({ conversations: [] }, { status: 200 });
    }

    // Build base query
    let query = supabase
      .from("inbox_threads")
      .select(`
        id,
        contact_id,
        campaign_id,
        homeowner_name,
        homeowner_email,
        property_address,
        last_message_preview,
        engagement_level,
        engagement_score,
        lead_stage,
        assigned_to_user_id,
        has_insurance_claim,
        status,
        updated_at,
        last_message_at,
        created_at,
        contacts:contact_id (
          id,
          email,
          first_name,
          last_name
        )
      `)
      .eq("status", "open")
      .in("campaign_id", campaignIds)
      .order("updated_at", { ascending: false })
      .limit(limit);

    // Filter by lead_stage
    if (lead_stage !== "all") {
      query = query.eq("lead_stage", lead_stage);
    }

    // Filter by engagement_level
    if (engagement_level !== "all") {
      query = query.eq("engagement_level", engagement_level);
    }

    // Filter by assigned_to
    if (assigned_to && assigned_to !== "all") {
      query = query.eq("assigned_to_user_id", assigned_to);
    }

    // Filter by insurance claims only
    if (claims_only) {
      query = query.eq("has_insurance_claim", true);
    }

    // Text search across multiple fields
    if (q && typeof q === "string" && q.trim().length > 0) {
      const searchTerm = `%${q.trim()}%`;
      
      // Build OR conditions for text search
      // Supabase .or() expects format: "column.ilike.value,column2.ilike.value2"
      query = query.or(
        `homeowner_name.ilike.${searchTerm},homeowner_email.ilike.${searchTerm},property_address.ilike.${searchTerm},last_message_preview.ilike.${searchTerm}`
      );
    }

    const { data, error } = await query;

    if (error) {
      console.error("Inbox search error", error);
      return NextResponse.json(
        { error: "Failed to search inbox" },
        { status: 500 }
      );
    }

    // Transform data to match expected format
    const conversations = (data || []).map((thread: any) => ({
      id: thread.id,
      homeowner_name:
        thread.homeowner_name ||
        (thread.contacts
          ? `${thread.contacts.first_name || ""} ${thread.contacts.last_name || ""}`.trim()
          : null) ||
        thread.homeowner_email?.split("@")[0] ||
        thread.contacts?.email?.split("@")[0] ||
        "Unknown",
      homeowner_email: thread.homeowner_email || thread.contacts?.email || "",
      property_address: thread.property_address || "",
      last_message_preview: thread.last_message_preview || "",
      engagement_level: thread.engagement_level || null,
      engagement_score: thread.engagement_score || 0,
      lead_stage: thread.lead_stage || "new",
      assigned_to_user_id: thread.assigned_to_user_id || null,
      is_insurance_claim: thread.has_insurance_claim || false,
      status: thread.status,
      updated_at: thread.updated_at,
      last_message_at: thread.last_message_at,
      created_at: thread.created_at,
      contact_id: thread.contact_id,
      campaign_id: thread.campaign_id,
    }));

    return NextResponse.json({ conversations }, { status: 200 });
  } catch (error: any) {
    console.error("Error in inbox search API:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

