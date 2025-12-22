import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  try {
    const supabase = getServerSupabase();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get all orgs the user is a member of
    const { data: memberships, error: membershipsError } = await supabase
      .from("org_members")
      .select("org_id, role, organizations!inner(id, name, owner_id)")
      .eq("user_id", user.id);

    if (membershipsError) {
      return NextResponse.json({ error: membershipsError.message }, { status: 500 });
    }

    const orgs = (memberships || []).map((m: any) => ({
      id: m.org_id,
      name: m.organizations?.name,
      role: m.role,
      owner_id: m.organizations?.owner_id,
    }));

    // Get current org from cookie/header if available
    const cookieStore = await import("next/headers").then((m) => m.cookies());
    const currentOrgId = cookieStore.get("orgId")?.value || null;
    const current = currentOrgId || orgs[0]?.id || null;

    return NextResponse.json({
      rows: orgs,
      current,
    });
  } catch (error) {
    console.error("Error listing orgs:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

