import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// GET /api/hq/command-center - HQ Command Center Dashboard
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check if user is HQ owner
    const { data: hqCheck, error: hqError } = await supabase
      .from('branch_users')
      .select('role, branches!inner(roofing_company_id, company_id)')
      .eq('user_id', user.id)
      .eq('role', 'hq_owner')
      .eq('is_active', true)
      .limit(1)
      .single();

    if (hqError || !hqCheck) {
      return NextResponse.json(
        { error: "Only HQ owners can access command center" },
        { status: 403 }
      );
    }

    const companyId = hqCheck.branches?.roofing_company_id || hqCheck.branches?.company_id;

    // Get all branches summary
    const { data: allBranchesSummary, error: summaryError } = await supabase
      .from('v_hq_all_branches_summary')
      .select('*')
      .eq('company_id', companyId)
      .single();

    // Get branch performance comparison
    const { data: branchPerformance, error: perfError } = await supabase
      .from('v_hq_branch_performance')
      .select('*')
      .eq('company_id', companyId)
      .order('revenue_today', { ascending: false });

    // Get cross-office calendar
    const { data: calendar, error: calendarError } = await supabase
      .from('v_hq_cross_office_calendar')
      .select('*')
      .gte('schedule_date', new Date().toISOString().split('T')[0])
      .lte('schedule_date', new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0])
      .order('schedule_date', { ascending: true })
      .order('branch_name', { ascending: true });

    // Get available shared resources
    const { data: branches, error: branchesError } = await supabase
      .from('branches')
      .select('id')
      .or(`roofing_company_id.eq.${companyId},company_id.eq.${companyId}`)
      .eq('is_active', true);

    let sharedResources: any[] = [];
    if (branches && branches.length > 0) {
      for (const branch of branches) {
        const { data: resources } = await supabase
          .rpc('get_available_shared_resources', {
            p_branch_id: branch.id,
            p_resource_type: null,
            p_date: new Date()
          });
        
        if (resources) {
          sharedResources = [...sharedResources, ...resources];
        }
      }
    }

    return NextResponse.json({
      summary: allBranchesSummary || {},
      branchPerformance: branchPerformance || [],
      calendar: calendar || [],
      sharedResources: sharedResources || []
    });
  } catch (error: any) {
    console.error("Error in GET /api/hq/command-center:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}





















