import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// GET /api/branches - List branches for current user's company
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get user's branches
    const { data: userBranches, error: branchesError } = await supabase
      .rpc('get_user_branches', { p_user_id: user.id });

    if (branchesError) {
      console.error("Error fetching branches:", branchesError);
      return NextResponse.json({ error: branchesError.message }, { status: 500 });
    }

    // If user is HQ owner, get all branches for their company
    const { data: hqBranches, error: hqError } = await supabase
      .from('branch_users')
      .select(`
        branch_id,
        role,
        branches (
          id,
          name,
          city,
          state,
          address,
          phone,
          zip_code,
          is_active,
          roofing_company_id,
          company_id
        )
      `)
      .eq('user_id', user.id)
      .eq('role', 'hq_owner')
      .eq('is_active', true);

    if (hqError) {
      console.error("Error fetching HQ branches:", hqError);
    }

    // Get all branches if HQ owner
    let allBranches = [];
    if (hqBranches && hqBranches.length > 0) {
      const companyId = hqBranches[0].branches?.roofing_company_id || hqBranches[0].branches?.company_id;
      
      if (companyId) {
        const { data: companyBranches, error: companyError } = await supabase
          .from('branches')
          .select('*')
          .or(`roofing_company_id.eq.${companyId},company_id.eq.${companyId}`)
          .eq('is_active', true)
          .order('created_at', { ascending: true });

        if (!companyError && companyBranches) {
          allBranches = companyBranches;
        }
      }
    }

    return NextResponse.json({
      branches: allBranches.length > 0 ? allBranches : (userBranches || []),
      is_hq_owner: hqBranches && hqBranches.length > 0
    });
  } catch (error: any) {
    console.error("Error in GET /api/branches:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

// POST /api/branches - Create a new branch (HQ owners only)
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
      roofing_company_id,
      company_id
    } = body;

    if (!name) {
      return NextResponse.json({ error: "Branch name is required" }, { status: 400 });
    }

    if (!roofing_company_id && !company_id) {
      return NextResponse.json(
        { error: "Either roofing_company_id or company_id is required" },
        { status: 400 }
      );
    }

    // Check if user is HQ owner for this company
    const { data: userBranch, error: checkError } = await supabase
      .from('branch_users')
      .select('role, branches!inner(roofing_company_id, company_id)')
      .eq('user_id', user.id)
      .eq('role', 'hq_owner')
      .eq('is_active', true)
      .limit(1)
      .single();

    if (checkError || !userBranch) {
      return NextResponse.json(
        { error: "Only HQ owners can create branches" },
        { status: 403 }
      );
    }

    // Create branch
    const { data: branch, error: createError } = await supabase
      .from('branches')
      .insert({
        name,
        city,
        state,
        address,
        phone,
        zip_code,
        territory_zip_codes: territory_zip_codes || [],
        territory_counties: territory_counties || [],
        service_area_radius_miles,
        roofing_company_id: roofing_company_id || null,
        company_id: company_id || null,
        is_active: true
      })
      .select()
      .single();

    if (createError) {
      console.error("Error creating branch:", createError);
      return NextResponse.json({ error: createError.message }, { status: 500 });
    }

    // Add creator as HQ owner of new branch
    await supabase
      .from('branch_users')
      .insert({
        branch_id: branch.id,
        user_id: user.id,
        role: 'hq_owner',
        is_active: true,
        assigned_by_user_id: user.id
      });

    return NextResponse.json({ branch }, { status: 201 });
  } catch (error: any) {
    console.error("Error in POST /api/branches:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}





















