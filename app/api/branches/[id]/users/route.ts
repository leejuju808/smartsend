import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// GET /api/branches/[id]/users - List users for a branch
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check branch access
    const { data: hasAccess } = await supabase
      .rpc('has_branch_access_v2', { check_branch_id: id });

    if (!hasAccess) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { data: branchUsers, error: usersError } = await supabase
      .from('branch_users')
      .select(`
        id,
        user_id,
        role,
        permissions,
        is_active,
        assigned_at,
        assigned_by_user_id,
        users:user_id (
          id,
          email,
          raw_user_meta_data
        )
      `)
      .eq('branch_id', id)
      .eq('is_active', true)
      .order('assigned_at', { ascending: false });

    if (usersError) {
      console.error("Error fetching branch users:", usersError);
      return NextResponse.json({ error: usersError.message }, { status: 500 });
    }

    return NextResponse.json({ users: branchUsers || [] });
  } catch (error: any) {
    console.error("Error in GET /api/branches/[id]/users:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

// POST /api/branches/[id]/users - Add user to branch
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check if user has permission (HQ owner or branch manager)
    const { data: userBranch, error: checkError } = await supabase
      .from('branch_users')
      .select('role')
      .eq('branch_id', id)
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single();

    if (checkError || !userBranch) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (!['hq_owner', 'branch_manager'].includes(userBranch.role)) {
      return NextResponse.json(
        { error: "Only HQ owners and branch managers can add users" },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { user_id, role, permissions } = body;

    if (!user_id || !role) {
      return NextResponse.json(
        { error: "user_id and role are required" },
        { status: 400 }
      );
    }

    // Check if user already exists in branch
    const { data: existing } = await supabase
      .from('branch_users')
      .select('id')
      .eq('branch_id', id)
      .eq('user_id', user_id)
      .single();

    if (existing) {
      // Update existing
      const { data: updated, error: updateError } = await supabase
        .from('branch_users')
        .update({
          role,
          permissions: permissions || {},
          is_active: true,
          assigned_by_user_id: user.id
        })
        .eq('id', existing.id)
        .select()
        .single();

      if (updateError) {
        console.error("Error updating branch user:", updateError);
        return NextResponse.json({ error: updateError.message }, { status: 500 });
      }

      return NextResponse.json({ user: updated });
    }

    // Create new
    const { data: branchUser, error: createError } = await supabase
      .from('branch_users')
      .insert({
        branch_id: id,
        user_id,
        role,
        permissions: permissions || {},
        is_active: true,
        assigned_by_user_id: user.id
      })
      .select()
      .single();

    if (createError) {
      console.error("Error creating branch user:", createError);
      return NextResponse.json({ error: createError.message }, { status: 500 });
    }

    return NextResponse.json({ user: branchUser }, { status: 201 });
  } catch (error: any) {
    console.error("Error in POST /api/branches/[id]/users:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}





















