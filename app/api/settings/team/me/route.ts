import { NextRequest, NextResponse } from "next/server";
import { getAccountRole } from "@/lib/auth/requireAccountRole";

// GET /api/settings/team/me - Get current user's role
export async function GET(req: NextRequest) {
  try {
    const roleData = await getAccountRole();

    if (!roleData) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    return NextResponse.json({
      role: roleData.role,
      account_id: roleData.account_id,
      is_account_owner: roleData.is_account_owner,
    });
  } catch (error: any) {
    console.error("Error fetching user role:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
























































