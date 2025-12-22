// POST /api/warranty/create
// Create a warranty (automatically on contract sign or manually)

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
    const {
      job_id,
      homeowner_id,
      warranty_type,
      start_date,
      end_date,
      document_url,
      coverage_description,
    } = body;

    // Validate required fields
    if (!warranty_type || !start_date || !end_date) {
      return NextResponse.json(
        { error: "warranty_type, start_date, and end_date are required" },
        { status: 400 }
      );
    }

    // Create warranty
    const { data: warranty, error } = await supabase
      .from("warranties")
      .insert({
        workspace_id: workspaceId,
        job_id: job_id || null,
        homeowner_id: homeowner_id || null,
        warranty_type,
        start_date,
        end_date,
        document_url: document_url || null,
        coverage_description: coverage_description || null,
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
    console.error("Error in warranty/create:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

























