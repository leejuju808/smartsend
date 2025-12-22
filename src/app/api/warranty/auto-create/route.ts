// POST /api/warranty/auto-create
// Automatically create warranty when contract is signed

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getActiveWorkspaceId } from "@/lib/workspace/context";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const workspaceId = await getActiveWorkspaceId();
    if (!workspaceId) {
      return NextResponse.json(
        { error: "Workspace not found" },
        { status: 400 }
      );
    }

    const body = await req.json();
    const { job_id, homeowner_id, contract_signed_date } = body;

    if (!job_id) {
      return NextResponse.json(
        { error: "job_id is required" },
        { status: 400 }
      );
    }

    // Default warranty: 1 year workmanship warranty
    const startDate = contract_signed_date 
      ? new Date(contract_signed_date)
      : new Date();
    
    const endDate = new Date(startDate);
    endDate.setFullYear(endDate.getFullYear() + 1); // 1 year warranty

    // Create warranty
    const { data: warranty, error } = await supabase
      .from("warranties")
      .insert({
        workspace_id: workspaceId,
        job_id,
        homeowner_id: homeowner_id || null,
        warranty_type: "workmanship",
        start_date: startDate.toISOString().split("T")[0],
        end_date: endDate.toISOString().split("T")[0],
        coverage_description: "Standard workmanship warranty covering installation and materials",
        is_active: true,
      })
      .select()
      .single();

    if (error) {
      console.error("Error creating warranty:", error);
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { warranty },
      { status: 201 }
    );
  } catch (error: any) {
    console.error("Error in warranty/auto-create:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

























