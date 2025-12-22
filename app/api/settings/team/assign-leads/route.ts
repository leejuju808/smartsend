import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { requireAccountRole } from "@/lib/auth/requireAccountRole";

// POST /api/settings/team/assign-leads - Assign leads to a staff member
export async function POST(req: NextRequest) {
  try {
    // Only owners and managers can assign leads
    const gate = await requireAccountRole(["owner", "manager"]);
    if (!gate.allowed) {
      return gate.res;
    }

    const supabase = createRouteHandlerClient({ cookies });
    const body = await req.json();
    const { staffUserId, leadIds } = body;

    if (!staffUserId || !leadIds || !Array.isArray(leadIds)) {
      return NextResponse.json(
        { error: "Staff user ID and lead IDs array are required" },
        { status: 400 }
      );
    }

    const { roleData } = gate;
    const accountId = roleData.account_id;

    // Verify the target user is a staff member in this account
    const { data: staffMember } = await supabase
      .from("users")
      .select("id, role")
      .eq("id", staffUserId)
      .eq("account_id", accountId)
      .eq("role", "staff")
      .single();

    if (!staffMember) {
      return NextResponse.json(
        { error: "Staff member not found or user is not a staff member" },
        { status: 404 }
      );
    }

    // Use the database function to assign leads
    const { error: assignError } = await supabase.rpc("assign_leads_to_staff", {
      p_account_id: accountId,
      p_staff_user_id: staffUserId,
      p_lead_ids: leadIds,
    });

    if (assignError) {
      console.error("Error assigning leads:", assignError);
      return NextResponse.json(
        { error: assignError.message },
        { status: 500 }
      );
    }

    // Get updated staff member with assigned_leads
    const { data: updatedStaff } = await supabase
      .from("users")
      .select("id, email, assigned_leads")
      .eq("id", staffUserId)
      .single();

    return NextResponse.json({
      ok: true,
      staff: updatedStaff,
    });
  } catch (error: any) {
    console.error("Error assigning leads:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

// DELETE /api/settings/team/assign-leads - Unassign leads from a staff member
export async function DELETE(req: NextRequest) {
  try {
    // Only owners and managers can unassign leads
    const gate = await requireAccountRole(["owner", "manager"]);
    if (!gate.allowed) {
      return gate.res;
    }

    const supabase = createRouteHandlerClient({ cookies });
    const body = await req.json();
    const { staffUserId, leadIds } = body;

    if (!staffUserId || !leadIds || !Array.isArray(leadIds)) {
      return NextResponse.json(
        { error: "Staff user ID and lead IDs array are required" },
        { status: 400 }
      );
    }

    const { roleData } = gate;
    const accountId = roleData.account_id;

    // Verify the target user is a staff member in this account
    const { data: staffMember } = await supabase
      .from("users")
      .select("id, role")
      .eq("id", staffUserId)
      .eq("account_id", accountId)
      .eq("role", "staff")
      .single();

    if (!staffMember) {
      return NextResponse.json(
        { error: "Staff member not found or user is not a staff member" },
        { status: 404 }
      );
    }

    // Use the database function to unassign leads
    const { error: unassignError } = await supabase.rpc("unassign_leads_from_staff", {
      p_account_id: accountId,
      p_staff_user_id: staffUserId,
      p_lead_ids: leadIds,
    });

    if (unassignError) {
      console.error("Error unassigning leads:", unassignError);
      return NextResponse.json(
        { error: unassignError.message },
        { status: 500 }
      );
    }

    // Get updated staff member with assigned_leads
    const { data: updatedStaff } = await supabase
      .from("users")
      .select("id, email, assigned_leads")
      .eq("id", staffUserId)
      .single();

    return NextResponse.json({
      ok: true,
      staff: updatedStaff,
    });
  } catch (error: any) {
    console.error("Error unassigning leads:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}





















































