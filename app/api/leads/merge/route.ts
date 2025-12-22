import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireWorkspace } from "@/lib/workspace/withWorkspace";

// POST /api/leads/merge - Merge two leads
export async function POST(req: NextRequest) {
  try {
    const gate = await requireWorkspace(req);
    if ("error" in gate) return gate.error;

    const { workspace_id, user } = gate;
    const supabase = createClient();
    const body = await req.json();
    const { primary_lead_id, merged_lead_id, field_selections } = body;

    if (!primary_lead_id || !merged_lead_id) {
      return NextResponse.json(
        { error: "primary_lead_id and merged_lead_id are required" },
        { status: 400 }
      );
    }

    if (primary_lead_id === merged_lead_id) {
      return NextResponse.json(
        { error: "Cannot merge a lead with itself" },
        { status: 400 }
      );
    }

    // Verify user has admin/owner role
    const { data: membership } = await supabase
      .from("workspace_members")
      .select("role")
      .eq("workspace_id", workspace_id)
      .eq("user_id", user.id)
      .single();

    if (!membership || !["owner", "admin"].includes(membership.role)) {
      return NextResponse.json(
        { error: "Only owners and admins can merge leads" },
        { status: 403 }
      );
    }

    // Verify both leads exist and are in the workspace
    const { data: leads, error: leadsError } = await supabase
      .from("leads")
      .select("id, workspace_id")
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

    // Call merge function
    const { data: mergeEventId, error: mergeError } = await supabase.rpc(
      "merge_leads",
      {
        p_workspace_id: workspace_id,
        p_primary_lead_id: primary_lead_id,
        p_merged_lead_id: merged_lead_id,
        p_merged_by: user.id,
        p_field_selections: field_selections || {},
      }
    );

    if (mergeError) {
      return NextResponse.json(
        { error: mergeError.message || "Failed to merge leads" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      merge_event_id: mergeEventId,
      message: "Leads merged successfully",
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
