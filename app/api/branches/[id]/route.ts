import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// GET /api/branches/[id] - Get branch details
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

    // Get branch details
    const { data: branch, error: branchError } = await supabase
      .from('branches')
      .select('*')
      .eq('id', id)
      .single();

    if (branchError || !branch) {
      return NextResponse.json({ error: "Branch not found" }, { status: 404 });
    }

    // Get branch users
    const { data: branchUsers, error: usersError } = await supabase
      .from('branch_users')
      .select(`
        id,
        user_id,
        role,
        permissions,
        is_active,
        assigned_at,
        users:user_id (
          id,
          email,
          raw_user_meta_data
        )
      `)
      .eq('branch_id', id)
      .eq('is_active', true);

    // Get branch resources
    const { data: resources, error: resourcesError } = await supabase
      .from('branch_resources')
      .select('*')
      .eq('branch_id', id);

    // Get recent performance
    const { data: performance, error: perfError } = await supabase
      .from('branch_performance')
      .select('*')
      .eq('branch_id', id)
      .order('date', { ascending: false })
      .limit(30);

    return NextResponse.json({
      branch,
      users: branchUsers || [],
      resources: resources || [],
      performance: performance || []
    });
  } catch (error: any) {
    console.error("Error in GET /api/branches/[id]:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

// PATCH /api/branches/[id] - Update branch
export async function PATCH(
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

    // Check if user has permission to update (HQ owner or branch manager)
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
        { error: "Only HQ owners and branch managers can update branches" },
        { status: 403 }
      );
    }

    const body = await req.json();
    const {
      name,
      city,
      state,
      address,
      phone,
      zip_code,
      territory_zip_codes,
      territory_counties,
      service_area_radius_miles,
      is_active,
      settings
    } = body;

    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (city !== undefined) updateData.city = city;
    if (state !== undefined) updateData.state = state;
    if (address !== undefined) updateData.address = address;
    if (phone !== undefined) updateData.phone = phone;
    if (zip_code !== undefined) updateData.zip_code = zip_code;
    if (territory_zip_codes !== undefined) updateData.territory_zip_codes = territory_zip_codes;
    if (territory_counties !== undefined) updateData.territory_counties = territory_counties;
    if (service_area_radius_miles !== undefined) updateData.service_area_radius_miles = service_area_radius_miles;
    if (is_active !== undefined) updateData.is_active = is_active;
    if (settings !== undefined) updateData.settings = settings;

    const { data: branch, error: updateError } = await supabase
      .from('branches')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (updateError) {
      console.error("Error updating branch:", updateError);
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ branch });
  } catch (error: any) {
    console.error("Error in PATCH /api/branches/[id]:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

// DELETE /api/branches/[id] - Delete branch (soft delete)
export async function DELETE(
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

    // Check if user is HQ owner
    const { data: userBranch, error: checkError } = await supabase
      .from('branch_users')
      .select('role')
      .eq('branch_id', id)
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single();

    if (checkError || !userBranch || userBranch.role !== 'hq_owner') {
      return NextResponse.json(
        { error: "Only HQ owners can delete branches" },
        { status: 403 }
      );
    }

    // Soft delete by setting is_active = false
    const { error: deleteError } = await supabase
      .from('branches')
      .update({ is_active: false })
      .eq('id', id);

    if (deleteError) {
      console.error("Error deleting branch:", deleteError);
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error in DELETE /api/branches/[id]:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}





















