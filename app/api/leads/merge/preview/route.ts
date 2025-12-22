import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireWorkspace } from "@/lib/workspace/withWorkspace";

// GET /api/leads/merge/preview - Preview merge between two leads
export async function GET(req: NextRequest) {
  try {
    const gate = await requireWorkspace(req);
    if ("error" in gate) return gate.error;

    const { workspace_id } = gate;
    const supabase = createClient();
    const url = new URL(req.url);
    const primary_lead_id = url.searchParams.get("primary_lead_id");
    const merged_lead_id = url.searchParams.get("merged_lead_id");

    if (!primary_lead_id || !merged_lead_id) {
      return NextResponse.json(
        { error: "primary_lead_id and merged_lead_id are required" },
        { status: 400 }
      );
    }

    // Verify both leads exist and are in the workspace
    const { data: leads, error: leadsError } = await supabase
      .from("leads")
      .select("id, workspace_id, is_merged")
      .in("id", [primary_lead_id, merged_lead_id]);

    if (leadsError || !leads || leads.length !== 2) {
      return NextResponse.json(
        { error: "One or both leads not found" },
        { status: 404 }
      );
    }

    const primaryLead = leads.find((l) => l.id === primary_lead_id);
    const mergedLead = leads.find((l) => l.id === merged_lead_id);

    if (!primaryLead || !mergedLead) {
      return NextResponse.json(
        { error: "Leads not found" },
        { status: 404 }
      );
    }

    if (primaryLead.workspace_id !== workspace_id || mergedLead.workspace_id !== workspace_id) {
      return NextResponse.json(
        { error: "Leads must be in the same workspace" },
        { status: 400 }
      );
    }

    if (mergedLead.is_merged) {
      return NextResponse.json(
        { error: "Merged lead is already merged" },
        { status: 400 }
      );
    }

    // Get merge preview using function
    const { data: preview, error: previewError } = await supabase.rpc(
      "get_merge_preview",
      {
        p_primary_lead_id: primary_lead_id,
        p_merged_lead_id: merged_lead_id,
      }
    );

    if (previewError) {
      return NextResponse.json(
        { error: previewError.message || "Failed to get merge preview" },
        { status: 500 }
      );
    }

    return NextResponse.json({ preview });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}








