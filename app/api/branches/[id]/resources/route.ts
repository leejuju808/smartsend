import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// GET /api/branches/[id]/resources - List resources for a branch
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

    const { searchParams } = new URL(req.url);
    const resourceType = searchParams.get('type');

    let query = supabase
      .from('branch_resources')
      .select('*')
      .eq('branch_id', id);

    if (resourceType) {
      query = query.eq('resource_type', resourceType);
    }

    const { data: resources, error: resourcesError } = await query.order('created_at', { ascending: false });

    if (resourcesError) {
      console.error("Error fetching branch resources:", resourcesError);
      return NextResponse.json({ error: resourcesError.message }, { status: 500 });
    }

    return NextResponse.json({ resources: resources || [] });
  } catch (error: any) {
    console.error("Error in GET /api/branches/[id]/resources:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

// POST /api/branches/[id]/resources - Add resource to branch
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
        { error: "Only HQ owners and branch managers can add resources" },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { resource_type, resource_id, shareable, shared_with_branches, metadata } = body;

    if (!resource_type || !resource_id) {
      return NextResponse.json(
        { error: "resource_type and resource_id are required" },
        { status: 400 }
      );
    }

    // Check if resource already exists
    const { data: existing } = await supabase
      .from('branch_resources')
      .select('id')
      .eq('branch_id', id)
      .eq('resource_type', resource_type)
      .eq('resource_id', resource_id)
      .single();

    if (existing) {
      // Update existing
      const { data: updated, error: updateError } = await supabase
        .from('branch_resources')
        .update({
          shareable: shareable || false,
          shared_with_branches: shared_with_branches || [],
          metadata: metadata || {}
        })
        .eq('id', existing.id)
        .select()
        .single();

      if (updateError) {
        console.error("Error updating branch resource:", updateError);
        return NextResponse.json({ error: updateError.message }, { status: 500 });
      }

      return NextResponse.json({ resource: updated });
    }

    // Create new
    const { data: resource, error: createError } = await supabase
      .from('branch_resources')
      .insert({
        branch_id: id,
        resource_type,
        resource_id,
        shareable: shareable || false,
        shared_with_branches: shared_with_branches || [],
        metadata: metadata || {}
      })
      .select()
      .single();

    if (createError) {
      console.error("Error creating branch resource:", createError);
      return NextResponse.json({ error: createError.message }, { status: 500 });
    }

    return NextResponse.json({ resource }, { status: 201 });
  } catch (error: any) {
    console.error("Error in POST /api/branches/[id]/resources:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}





















