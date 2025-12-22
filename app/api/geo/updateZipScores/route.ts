/**
 * POST /api/geo/updateZipScores
 * Block 18000 — Update ZIP scores and rankings
 * Worker function to recalculate ZIP rank scores and update rankings
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get workspace_id from request body or query params
    const body = await req.json().catch(() => ({}));
    const workspaceId = body.workspace_id || req.nextUrl.searchParams.get("workspace_id");

    if (!workspaceId) {
      // Update all workspaces
      const { data: workspaces } = await supabase
        .from("workspaces")
        .select("id");

      if (!workspaces || workspaces.length === 0) {
        return NextResponse.json({
          success: true,
          message: "No workspaces found",
          updated: 0,
        });
      }

      let totalUpdated = 0;
      for (const workspace of workspaces) {
        const { error } = await supabase.rpc("update_zip_rankings", {
          p_workspace_id: workspace.id,
        });

        if (!error) {
          totalUpdated++;
        } else {
          console.error(`Error updating ZIP rankings for workspace ${workspace.id}:`, error);
        }
      }

      return NextResponse.json({
        success: true,
        message: "ZIP rankings updated for all workspaces",
        updated: totalUpdated,
        total: workspaces.length,
      });
    } else {
      // Update specific workspace
      const { error } = await supabase.rpc("update_zip_rankings", {
        p_workspace_id: workspaceId,
      });

      if (error) {
        console.error("Error updating ZIP rankings:", error);
        return NextResponse.json(
          { error: error.message },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        message: "ZIP rankings updated successfully",
        workspace_id: workspaceId,
      });
    }
  } catch (error: any) {
    console.error("Error in POST /api/geo/updateZipScores:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}





















































