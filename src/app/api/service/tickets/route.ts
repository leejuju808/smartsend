// GET /api/service/tickets
// List service tickets with filters

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
    const status = searchParams.get("status");
    const priority = searchParams.get("priority");
    const warranty_only = searchParams.get("warranty_only") === "true";
    const out_of_warranty = searchParams.get("out_of_warranty") === "true";
    const limit = parseInt(searchParams.get("limit") || "50", 10);
    const offset = parseInt(searchParams.get("offset") || "0", 10);

    let query = supabase
      .from("service_tickets")
      .select(`
        *,
        homeowner:homeowners(*),
        job:roofing_jobs(id, title, address),
        warranty:warranties(id, warranty_type, end_date),
        assignments:service_assignments(
          *,
          crew:crews(id, name, lead_name)
        ),
        attachments:service_attachments(*),
        logs:service_logs(*)
      `)
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) {
      query = query.eq("status", status);
    }

    if (priority) {
      query = query.eq("priority", priority);
    }

    if (warranty_only) {
      query = query.eq("is_warranty_covered", true);
    }

    if (out_of_warranty) {
      query = query.eq("is_warranty_covered", false);
    }

    const { data: tickets, error } = await query;

    if (error) {
      console.error("Error fetching service tickets:", error);
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      tickets: tickets || [],
      pagination: {
        limit,
        offset,
        count: tickets?.length || 0,
      },
    });
  } catch (error: any) {
    console.error("Error in service/tickets:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

























