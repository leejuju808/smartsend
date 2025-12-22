import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@/lib/supabase";
import { cookies } from "next/headers";

// GET /api/suppression - List suppressions for workspace
export async function GET(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get workspace_id from query params or cookie
    const searchParams = req.nextUrl.searchParams;
    const workspaceId = searchParams.get("workspace_id") || 
      req.cookies.get("ws")?.value;

    if (!workspaceId) {
      return NextResponse.json({ error: "workspace_id required" }, { status: 400 });
    }

    // Verify user has access to workspace
    const { data: member } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", workspaceId)
      .eq("user_id", user.id)
      .single();

    if (!member) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    // Get filter params
    const reason = searchParams.get("reason");
    const search = searchParams.get("search");
    const limit = parseInt(searchParams.get("limit") || "100");
    const offset = parseInt(searchParams.get("offset") || "0");

    // Build query
    let query = supabase
      .from("suppression_list")
      .select("*", { count: "exact" })
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (reason) {
      query = query.eq("reason", reason);
    }

    if (search) {
      query = query.ilike("email", `%${search}%`);
    }

    const { data, error, count } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      data: data || [],
      count: count || 0,
      limit,
      offset,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

// POST /api/suppression - Add suppression
export async function POST(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { workspace_id, email, reason = "manual", notes } = body;

    if (!workspace_id || !email) {
      return NextResponse.json(
        { error: "workspace_id and email required" },
        { status: 400 }
      );
    }

    // Verify user has access to workspace
    const { data: member } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", workspace_id)
      .eq("user_id", user.id)
      .single();

    if (!member) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    // Validate reason
    const validReasons = ["manual", "unsubscribed", "bounce", "complaint", "out_of_scope"];
    if (!validReasons.includes(reason)) {
      return NextResponse.json(
        { error: `Invalid reason. Must be one of: ${validReasons.join(", ")}` },
        { status: 400 }
      );
    }

    // Use helper function to suppress
    const { data: suppressionId, error: suppressError } = await supabase.rpc(
      "suppress_contact",
      {
        p_workspace_id: workspace_id,
        p_email: email,
        p_reason: reason,
        p_created_by: "user",
        p_created_by_user_id: user.id,
        p_notes: notes || null,
      }
    );

    if (suppressError) {
      return NextResponse.json(
        { error: suppressError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      id: suppressionId,
      message: "Contact suppressed successfully",
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

// DELETE /api/suppression - Remove suppression (manual only)
export async function DELETE(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const searchParams = req.nextUrl.searchParams;
    const id = searchParams.get("id");
    const workspace_id = searchParams.get("workspace_id") || 
      req.cookies.get("ws")?.value;

    if (!id || !workspace_id) {
      return NextResponse.json(
        { error: "id and workspace_id required" },
        { status: 400 }
      );
    }

    // Verify user has access to workspace
    const { data: member } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", workspace_id)
      .eq("user_id", user.id)
      .single();

    if (!member) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    // Check if suppression exists and is manual
    const { data: suppression } = await supabase
      .from("suppression_list")
      .select("reason")
      .eq("id", id)
      .eq("workspace_id", workspace_id)
      .single();

    if (!suppression) {
      return NextResponse.json(
        { error: "Suppression not found" },
        { status: 404 }
      );
    }

    if (suppression.reason !== "manual") {
      return NextResponse.json(
        { error: "Only manual suppressions can be removed" },
        { status: 400 }
      );
    }

    // Delete suppression
    const { error: deleteError } = await supabase
      .from("suppression_list")
      .delete()
      .eq("id", id)
      .eq("workspace_id", workspace_id);

    if (deleteError) {
      return NextResponse.json(
        { error: deleteError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Suppression removed successfully",
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
