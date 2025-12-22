import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function GET(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get user's org memberships
    const { data: memberships, error: membersError } = await supabase
      .from("org_members")
      .select("org_id, role, organizations!inner(id, name, created_at)")
      .eq("user_id", user.id);

    if (membersError) {
      return NextResponse.json(
        { error: membersError.message },
        { status: 500 }
      );
    }

    const orgs = (memberships || []).map((m: any) => ({
      id: m.organizations.id,
      name: m.organizations.name,
      role: m.role,
      created_at: m.organizations.created_at,
    }));

    // Get current org from cookie or user_metadata
    const cookieStore = await cookies();
    const currentOrgId = cookieStore.get("current_org_id")?.value || null;

    // Fallback to user_metadata if no cookie
    let currentOrgIdFromMetadata = null;
    if (!currentOrgId && user.user_metadata?.current_org_id) {
      currentOrgIdFromMetadata = user.user_metadata.current_org_id;
    }

    const activeOrgId = currentOrgId || currentOrgIdFromMetadata || orgs[0]?.id || null;

    return NextResponse.json({
      orgs,
      current_org_id: activeOrgId,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

