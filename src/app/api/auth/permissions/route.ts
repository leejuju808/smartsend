// GET /api/auth/permissions
// Get current user's permissions for a company

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const searchParams = req.nextUrl.searchParams;
    const roofing_company_id = searchParams.get("roofing_company_id");

    if (!roofing_company_id) {
      return NextResponse.json(
        { error: "roofing_company_id is required" },
        { status: 400 }
      );
    }

    // Get user's role in company
    const { data: member, error: memberError } = await supabase
      .from("roofing_company_members")
      .select("role")
      .eq("roofing_company_id", roofing_company_id)
      .eq("user_id", user.id)
      .eq("is_active", true)
      .single();

    if (memberError || !member) {
      return NextResponse.json(
        { error: "You are not a member of this company" },
        { status: 403 }
      );
    }

    // Get permissions for this role
    const { data: permissions, error: permissionsError } = await supabase
      .from("roles_permissions")
      .select("*")
      .eq("role", member.role);

    if (permissionsError) {
      console.error("Error fetching permissions:", permissionsError);
      return NextResponse.json(
        { error: "Failed to fetch permissions" },
        { status: 500 }
      );
    }

    // Format permissions as a map for easy lookup
    const permissionsMap: Record<string, any> = {};
    (permissions || []).forEach((perm: any) => {
      permissionsMap[perm.module] = {
        can_view: perm.can_view,
        can_create: perm.can_create,
        can_edit: perm.can_edit,
        can_delete: perm.can_delete,
      };
    });

    return NextResponse.json({
      success: true,
      role: member.role,
      permissions: permissionsMap,
    });
  } catch (error: any) {
    console.error("Error fetching permissions:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

























