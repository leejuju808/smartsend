import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type RoofingLeadStatus = 
  | "NEW" 
  | "HOT" 
  | "WARM" 
  | "FOLLOW_UP" 
  | "NOT_INTERESTED" 
  | "OUT_OF_SCOPE";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { id } = await params;
  const leadId = id;

  // Get authenticated user
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { status } = body;

  // Validate status
  const validStatuses: RoofingLeadStatus[] = [
    "NEW",
    "HOT",
    "WARM",
    "FOLLOW_UP",
    "NOT_INTERESTED",
    "OUT_OF_SCOPE",
  ];

  if (!status || !validStatuses.includes(status)) {
    return NextResponse.json(
      { error: `Invalid status. Must be one of: ${validStatuses.join(", ")}` },
      { status: 400 }
    );
  }

  // Verify lead exists and user has access
  const { data: lead, error: leadErr } = await supabase
    .from("leads")
    .select("id, workspace_id")
    .eq("id", leadId)
    .single();

  if (leadErr || !lead) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }

  // Verify workspace access
  const { data: membership } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", user.id)
    .eq("workspace_id", lead.workspace_id)
    .single();

  if (!membership) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  // Upsert lead status using the database function
  const { data, error } = await supabase.rpc("upsert_lead_status", {
    p_lead_id: leadId,
    p_status: status,
    p_updated_by: user.id,
    p_updated_by_system: false,
  });

  if (error) {
    console.error("Failed to update lead status:", error);
    return NextResponse.json(
      { error: "Failed to update lead status", details: error.message },
      { status: 500 }
    );
  }

  // Fetch the updated status
  const { data: updatedStatus } = await supabase
    .from("lead_status")
    .select("*")
    .eq("lead_id", leadId)
    .single();

  return NextResponse.json({ 
    success: true, 
    status: updatedStatus?.status,
    updated_at: updatedStatus?.updated_at,
  });
}

// GET endpoint to fetch current status
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { id } = await params;
  const leadId = id;

  // Get authenticated user
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Verify lead exists and user has access
  const { data: lead, error: leadErr } = await supabase
    .from("leads")
    .select("id, workspace_id")
    .eq("id", leadId)
    .single();

  if (leadErr || !lead) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }

  // Verify workspace access
  const { data: membership } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", user.id)
    .eq("workspace_id", lead.workspace_id)
    .single();

  if (!membership) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  // Fetch current status
  const { data: statusData, error: statusError } = await supabase
    .from("lead_status")
    .select("*")
    .eq("lead_id", leadId)
    .single();

  if (statusError && statusError.code !== "PGRST116") {
    // PGRST116 is "no rows returned", which is fine (defaults to NEW)
    console.error("Failed to fetch lead status:", statusError);
    return NextResponse.json(
      { error: "Failed to fetch lead status" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    status: statusData?.status || "NEW",
    updated_at: statusData?.updated_at,
    updated_by: statusData?.updated_by,
  });
}























































