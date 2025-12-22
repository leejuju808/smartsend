// POST /api/company/users/update-role
// Update a user's role in a company

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = await req.json();
    const { user_id, role, roofing_company_id } = body;

    if (!user_id || !role || !roofing_company_id) {
      return NextResponse.json(
        { error: "user_id, role, and roofing_company_id are required" },
        { status: 400 }
      );
    }

    // Validate role
    const validRoles = ['admin', 'manager', 'sales', 'production', 'crew', 'accounting', 'viewer'];
    if (!validRoles.includes(role)) {
      return NextResponse.json(
        { error: "Invalid role. Must be one of: " + validRoles.join(", ") },
        { status: 400 }
      );
    }

    // Check if current user can manage team
    const { data: currentMember, error: memberError } = await supabase
      .from("roofing_company_members")
      .select("role")
      .eq("roofing_company_id", roofing_company_id)
      .eq("user_id", user.id)
      .eq("is_active", true)
      .single();

    if (memberError || !currentMember) {
      return NextResponse.json(
        { error: "You are not a member of this company" },
        { status: 403 }
      );
    }

    // Only owner and admin can change roles
    if (!['owner', 'admin'].includes(currentMember.role)) {
      return NextResponse.json(
        { error: "Only owners and admins can change user roles" },
        { status: 403 }
      );
    }

    // Prevent changing owner role
    const { data: targetMember } = await supabase
      .from("roofing_company_members")
      .select("role")
      .eq("roofing_company_id", roofing_company_id)
      .eq("user_id", user_id)
      .single();

    if (targetMember?.role === 'owner' && role !== 'owner') {
      return NextResponse.json(
        { error: "Cannot change owner role" },
        { status: 400 }
      );
    }

    // Update the role
    const { data: updatedMember, error: updateError } = await supabase
      .from("roofing_company_members")
      .update({
        role,
        updated_at: new Date().toISOString(),
      })
      .eq("roofing_company_id", roofing_company_id)
      .eq("user_id", user_id)
      .select()
      .single();

    if (updateError) {
      console.error("Error updating role:", updateError);
      return NextResponse.json(
        { error: "Failed to update role" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      member: updatedMember,
    });
  } catch (error: any) {
    console.error("Error updating role:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

























