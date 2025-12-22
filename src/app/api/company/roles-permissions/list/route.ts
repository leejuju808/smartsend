// GET /api/company/roles-permissions/list
// List all role permissions

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

    // Get all role permissions (read-only for all authenticated users)
    const { data: permissions, error: permissionsError } = await supabase
      .from("roles_permissions")
      .select("*")
      .order("role", { ascending: true })
      .order("module", { ascending: true });

    if (permissionsError) {
      console.error("Error fetching permissions:", permissionsError);
      return NextResponse.json(
        { error: "Failed to fetch permissions" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      permissions: permissions || [],
    });
  } catch (error: any) {
    console.error("Error listing permissions:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

























