import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { requireAccountRole, getAccountRole } from "@/lib/auth/requireAccountRole";

// GET /api/settings/permissions - Get account permissions
export async function GET(req: NextRequest) {
  try {
    const roleData = await getAccountRole();
    if (!roleData) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = createRouteHandlerClient({ cookies });
    const accountId = roleData.account_id;

    const { data: account } = await supabase
      .from("billing_accounts")
      .select("meta")
      .eq("id", accountId)
      .single();

    const permissions = account?.meta?.permissions || {
      manager_can_send: true,
      staff_can_update_pipeline: true,
    };

    return NextResponse.json({ permissions });
  } catch (error: any) {
    console.error("Error fetching permissions:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

// PATCH /api/settings/permissions - Update account permissions
export async function PATCH(req: NextRequest) {
  try {
    // Only account owners can update permissions
    const gate = await requireAccountRole(["owner"]);
    if (!gate.allowed || !gate.roleData.is_account_owner) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const supabase = createRouteHandlerClient({ cookies });
    const body = await req.json();
    const { permissions } = body;

    if (!permissions || typeof permissions !== "object") {
      return NextResponse.json(
        { error: "Permissions object is required" },
        { status: 400 }
      );
    }

    const accountId = gate.roleData.account_id;

    // Get current meta
    const { data: account } = await supabase
      .from("billing_accounts")
      .select("meta")
      .eq("id", accountId)
      .single();

    const currentMeta = account?.meta || {};
    const currentPermissions = currentMeta.permissions || {};

    // Merge permissions
    const updatedPermissions = {
      ...currentPermissions,
      ...permissions,
    };

    // Update account meta
    const { error: updateError } = await supabase
      .from("billing_accounts")
      .update({
        meta: {
          ...currentMeta,
          permissions: updatedPermissions,
        },
      })
      .eq("id", accountId);

    if (updateError) {
      console.error("Error updating permissions:", updateError);
      return NextResponse.json(
        { error: updateError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, permissions: updatedPermissions });
  } catch (error: any) {
    console.error("Error updating permissions:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

