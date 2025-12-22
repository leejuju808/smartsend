import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";
import { cookies } from "next/headers";

async function getCurrentOrgId(supabase: any, userId: string): Promise<string | null> {
  const cookieStore = await cookies();
  const orgId = cookieStore.get("current_org_id")?.value || cookieStore.get("org_id")?.value;
  
  if (orgId) return orgId;

  const { data: membership } = await supabase
    .from("org_memberships")
    .select("org_id")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  return membership?.org_id || null;
}

// GET /api/settings/users/list - List all org members
export async function GET(req: NextRequest) {
  try {
    const supabase = createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const orgId = await getCurrentOrgId(supabase, user.id);
    if (!orgId) {
      return NextResponse.json({ error: "No organization found" }, { status: 404 });
    }

    // Get all memberships
    const { data: memberships, error } = await supabase
      .from("org_memberships")
      .select("*")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Enrich with user data for active members
    const enrichedMembers = await Promise.all(
      (memberships || []).map(async (membership) => {
        if (membership.user_id) {
          const { data: profile } = await supabase
            .from("profiles")
            .select("email, full_name")
            .eq("id", membership.user_id)
            .maybeSingle();

          return {
            id: membership.id,
            user_id: membership.user_id,
            email: profile?.email || membership.invited_email,
            name: profile?.full_name || null,
            role: membership.role,
            status: membership.status,
            invited_email: membership.invited_email,
            invited_at: membership.invited_at,
            accepted_at: membership.accepted_at,
            created_at: membership.created_at,
          };
        } else {
          return {
            id: membership.id,
            user_id: null,
            email: membership.invited_email,
            name: null,
            role: membership.role,
            status: membership.status,
            invited_email: membership.invited_email,
            invited_at: membership.invited_at,
            accepted_at: membership.accepted_at,
            created_at: membership.created_at,
          };
        }
      })
    );

    return NextResponse.json({ members: enrichedMembers });
  } catch (error: any) {
    console.error("Error listing users:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}





























































