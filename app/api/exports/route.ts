import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { getCurrentWorkspaceId } from "@/lib/workspace";

/**
 * POST /api/exports
 * Initiate a lead export request
 * 
 * Body: {
 *   scope: "all" | "hot" | "warm" | "custom",
 *   status?: string, // for custom scope
 *   dateFrom?: string, // ISO date
 *   dateTo?: string // ISO date
 * }
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const workspaceId = await getCurrentWorkspaceId();
    if (!workspaceId) {
      return NextResponse.json({ error: "No workspace found" }, { status: 400 });
    }

    // Check permissions: Only Owner or Manager can export
    const { data: membership } = await supabase
      .from("workspace_members")
      .select("role")
      .eq("workspace_id", workspaceId)
      .eq("user_id", user.id)
      .single();

    if (!membership || !["owner", "manager"].includes(membership.role)) {
      return NextResponse.json(
        { error: "Only Owners and Managers can export leads" },
        { status: 403 }
      );
    }

    // Check rate limit
    const { data: canExport } = await supabase.rpc("can_export_leads", {
      p_user_id: user.id,
      p_workspace_id: workspaceId,
    });

    if (!canExport) {
      return NextResponse.json(
        { error: "Rate limit exceeded. Maximum 1 export per 10 minutes, 10 exports per day." },
        { status: 429 }
      );
    }

    const body = await req.json();
    const { scope = "all", status, dateFrom, dateTo } = body;

    // Validate scope
    if (!["all", "hot", "warm", "custom"].includes(scope)) {
      return NextResponse.json({ error: "Invalid scope" }, { status: 400 });
    }

    // Record export request for rate limiting
    await supabase.rpc("record_export_request", {
      p_user_id: user.id,
      p_workspace_id: workspaceId,
    });

    // Create export record
    const filters = {
      scope,
      ...(status && { status }),
      ...(dateFrom && { dateFrom }),
      ...(dateTo && { dateTo }),
    };

    const { data: exportRecord, error: createError } = await supabase
      .from("exports")
      .insert({
        workspace_id: workspaceId,
        user_id: user.id,
        status: "pending",
        filters,
      })
      .select()
      .single();

    if (createError) {
      console.error("Error creating export:", createError);
      return NextResponse.json(
        { error: "Failed to create export request" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      export: {
        id: exportRecord.id,
        status: exportRecord.status,
        requested_at: exportRecord.requested_at,
      },
    });
  } catch (error: any) {
    console.error("Export API error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/exports
 * List user's exports
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const workspaceId = await getCurrentWorkspaceId();
    if (!workspaceId) {
      return NextResponse.json({ error: "No workspace found" }, { status: 400 });
    }

    const { data: exports, error } = await supabase
      .from("exports")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("user_id", user.id)
      .order("requested_at", { ascending: false })
      .limit(20);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, exports: exports || [] });
  } catch (error: any) {
    console.error("Get exports error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}





















































