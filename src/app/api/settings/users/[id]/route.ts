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

// PATCH /api/settings/users/[id] - Update user role or status
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const orgId = await getCurrentOrgId(supabase, user.id);
    if (!orgId) {
      return NextResponse.json({ error: "No organization found" }, { status: 404 });
    }

    // Check if user is owner/admin/manager
    const { data: membership } = await supabase
      .from("org_memberships")
      .select("role")
      .eq("org_id", orgId)
      .eq("user_id", user.id)
      .eq("status", "active")
      .maybeSingle();

    if (!membership || !["owner", "admin", "manager"].includes(membership.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const { role, status } = body;

    // Find the membership to update
    const { data: targetMembership } = await supabase
      .from("org_memberships")
      .select("*")
      .eq("org_id", orgId)
      .or(`user_id.eq.${id},invited_email.eq.${id}`)
      .maybeSingle();

    if (!targetMembership) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Prevent changing owner role
    if (targetMembership.role === "owner" && role !== "owner") {
      return NextResponse.json({ error: "Cannot change owner role" }, { status: 400 });
    }

    // Prevent removing the last owner
    if (targetMembership.role === "owner" && status === "revoked") {
      const { count } = await supabase
        .from("org_memberships")
        .select("*", { count: "exact", head: true })
        .eq("org_id", orgId)
        .eq("role", "owner")
        .eq("status", "active");

      if ((count || 0) <= 1) {
        return NextResponse.json({ error: "Cannot remove the last owner" }, { status: 400 });
      }
    }

    const updates: any = {};
    if (role && ["owner", "admin", "manager", "agent", "member"].includes(role)) {
      updates.role = role;
    }
    if (status && ["active", "pending", "revoked"].includes(status)) {
      updates.status = status;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "No valid updates provided" }, { status: 400 });
    }

    const { data: updated, error } = await supabase
      .from("org_memberships")
      .update(updates)
      .eq("id", targetMembership.id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, membership: updated });
  } catch (error: any) {
    console.error("Error updating user:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

// DELETE /api/settings/users/[id] - Remove user from org
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = createSupabaseServer();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const orgId = await getCurrentOrgId(supabase, user.id);
    if (!orgId) {
      return NextResponse.json({ error: "No organization found" }, { status: 404 });
    }

    // Check if user is owner/admin/manager
    const { data: membership } = await supabase
      .from("org_memberships")
      .select("role")
      .eq("org_id", orgId)
      .eq("user_id", user.id)
      .eq("status", "active")
      .maybeSingle();

    if (!membership || !["owner", "admin", "manager"].includes(membership.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Find the membership to delete
    const { data: targetMembership } = await supabase
      .from("org_memberships")
      .select("*")
      .eq("org_id", orgId)
      .or(`user_id.eq.${id},invited_email.eq.${id}`)
      .maybeSingle();

    if (!targetMembership) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Prevent removing owner
    if (targetMembership.role === "owner") {
      return NextResponse.json({ error: "Cannot remove owner" }, { status: 400 });
    }

    const { error: deleteError } = await supabase
      .from("org_memberships")
      .delete()
      .eq("id", targetMembership.id);

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error("Error removing user:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}





























































