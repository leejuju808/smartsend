// GET /api/warranty/list
// List warranties with filters

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getActiveWorkspaceId } from "@/lib/workspace/context";

export async function GET(req: NextRequest) {
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

    const { searchParams } = req.nextUrl;
    const job_id = searchParams.get("job_id");
    const homeowner_id = searchParams.get("homeowner_id");
    const expires_soon = searchParams.get("expires_soon") === "true";
    const is_active = searchParams.get("is_active") !== "false"; // Default to true

    let query = supabase
      .from("warranties")
      .select(`
        *,
        job:roofing_jobs(id, title, address),
        homeowner:homeowners(id, name, email)
      `)
      .eq("workspace_id", workspaceId)
      .order("end_date", { ascending: true });

    if (job_id) {
      query = query.eq("job_id", job_id);
    }

    if (homeowner_id) {
      query = query.eq("homeowner_id", homeowner_id);
    }

    if (expires_soon) {
      query = query.eq("expires_soon", true);
    }

    if (is_active) {
      query = query.eq("is_active", true);
    }

    const { data: warranties, error } = await query;

    if (error) {
      console.error("Error fetching warranties:", error);
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      warranties: warranties || [],
    });
  } catch (error: any) {
    console.error("Error in warranty/list:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

























