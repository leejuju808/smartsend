import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// GET /api/franchise/templates - List franchise templates
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const isPublic = searchParams.get('public') === 'true';

    let query = supabase
      .from('franchise_templates')
      .select('*')
      .eq('is_active', true);

    if (isPublic) {
      query = query.eq('is_public', true);
    } else {
      // Get user's company to filter templates
      const { data: userBranch } = await supabase
        .from('branch_users')
        .select('branches!inner(roofing_company_id, company_id)')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .limit(1)
        .single();

      if (userBranch?.branches) {
        const companyId = userBranch.branches.roofing_company_id || userBranch.branches.company_id;
        query = query.or(`parent_company_id.eq.${companyId},is_public.eq.true`);
      }
    }

    const { data: templates, error: templatesError } = await query.order('created_at', { ascending: false });

    if (templatesError) {
      console.error("Error fetching franchise templates:", templatesError);
      return NextResponse.json({ error: templatesError.message }, { status: 500 });
    }

    return NextResponse.json({ templates: templates || [] });
  } catch (error: any) {
    console.error("Error in GET /api/franchise/templates:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

// POST /api/franchise/templates - Create franchise template
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check if user is HQ owner
    const { data: hqCheck } = await supabase
      .from('branch_users')
      .select('role, branches!inner(roofing_company_id, company_id)')
      .eq('user_id', user.id)
      .eq('role', 'hq_owner')
      .eq('is_active', true)
      .limit(1)
      .single();

    if (!hqCheck) {
      return NextResponse.json(
        { error: "Only HQ owners can create franchise templates" },
        { status: 403 }
      );
    }

    const body = await req.json();
    const {
      name,
      description,
      pricing_rules,
      workflow_templates,
      contract_templates,
      material_lists,
      sales_scripts,
      marketing_automation,
      job_workflows,
      permissions_config,
      is_public
    } = body;

    if (!name) {
      return NextResponse.json({ error: "Template name is required" }, { status: 400 });
    }

    const companyId = hqCheck.branches?.roofing_company_id || hqCheck.branches?.company_id;

    const { data: template, error: createError } = await supabase
      .from('franchise_templates')
      .insert({
        name,
        description,
        parent_company_id: companyId,
        pricing_rules: pricing_rules || {},
        workflow_templates: workflow_templates || [],
        contract_templates: contract_templates || [],
        material_lists: material_lists || [],
        sales_scripts: sales_scripts || [],
        marketing_automation: marketing_automation || [],
        job_workflows: job_workflows || [],
        permissions_config: permissions_config || {},
        is_public: is_public || false,
        is_active: true
      })
      .select()
      .single();

    if (createError) {
      console.error("Error creating franchise template:", createError);
      return NextResponse.json({ error: createError.message }, { status: 500 });
    }

    return NextResponse.json({ template }, { status: 201 });
  } catch (error: any) {
    console.error("Error in POST /api/franchise/templates:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}





















