/**
 * GET /api/geo/clusters
 * Block 18000 — Get geographic lead clusters
 * Returns clusters of leads (storm clusters, insurance clusters, high-value clusters, etc.)
 */

import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { getActiveWorkspaceId } from "@/lib/workspaces/server";

export async function GET(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const workspaceId = await getActiveWorkspaceId();
    if (!workspaceId) {
      return NextResponse.json(
        { error: "Workspace not found" },
        { status: 404 }
      );
    }

    const { searchParams } = new URL(req.url);
    const clusterType = searchParams.get("clusterType"); // storm, insurance, active_leads, high_value, recent_replies, old_roofs
    const limit = parseInt(searchParams.get("limit") || "50");
    const minPriority = parseInt(searchParams.get("minPriority") || "0");

    // Build query
    let query = supabase
      .from("geo_clusters")
      .select("*")
      .eq("workspace_id", workspaceId)
      .gte("cluster_priority", minPriority);

    // Filter by cluster type if provided
    if (clusterType) {
      query = query.eq("cluster_type", clusterType);
    }

    // Sort by priority and score
    query = query
      .order("cluster_priority", { ascending: false })
      .order("cluster_score", { ascending: false })
      .limit(limit);

    const { data: clusters, error } = await query;

    if (error) {
      console.error("Error fetching clusters:", error);
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      clusters: clusters || [],
      count: clusters?.length || 0,
    });
  } catch (error: any) {
    console.error("Error in GET /api/geo/clusters:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/geo/clusters
 * Generate clusters for a workspace
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const workspaceId = await getActiveWorkspaceId();
    if (!workspaceId) {
      return NextResponse.json(
        { error: "Workspace not found" },
        { status: 404 }
      );
    }

    const body = await req.json();
    const { clusterType } = body; // Optional: specific cluster type to generate

    // Call the database function to generate clusters
    const { data, error } = await supabase.rpc("generate_geo_clusters", {
      p_workspace_id: workspaceId,
      p_cluster_type: clusterType || null,
    });

    if (error) {
      console.error("Error generating clusters:", error);
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Clusters generated successfully",
    });
  } catch (error: any) {
    console.error("Error in POST /api/geo/clusters:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}





















































