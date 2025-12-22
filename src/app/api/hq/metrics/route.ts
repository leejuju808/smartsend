import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { getActiveOrg } from "@/lib/org";

export async function GET(req: NextRequest) {
  try {
    const supabase = getServerSupabase();

    // Get current user and org
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const org = await getActiveOrg();
    
    // Check if admin view requested
    const { searchParams } = new URL(req.url);
    const view = searchParams.get('view'); // 'org' or 'global'
    
    // Get org memberships to check if admin
    const { data: memberships } = await supabase
      .from("org_members")
      .select("org_id, role")
      .eq("user_id", user.id);
    
    const isAdmin = memberships?.some(m => m.role === 'owner') || false;

    // Get HQ overview metrics
    const { data: overview, error: overviewError } = await supabase
      .from('vw_hq_overview')
      .select('*')
      .single();

    if (overviewError) {
      console.error('Error fetching overview:', overviewError);
      // Return empty data if view doesn't exist yet
      const emptyOverview = {
        total_mrr: 0,
        total_arr: 0,
        active_orgs_30d: 0,
        events_24h: 0,
        events_7d: 0,
        snapshot_at: new Date().toISOString()
      };
      return NextResponse.json({ overview: emptyOverview, trends: [], activity: [] });
    }

    // Get trends (last 30 days activity)
    const { data: trends, error: trendsError } = await supabase
      .from('vw_activity_daily')
      .select('*')
      .order('day', { ascending: true });

    if (trendsError) {
      console.error('Error fetching trends:', trendsError);
    }

    // Get recent activity (last 20 events)
    let activityQuery = supabase
      .from('events_bus')
      .select('*')
      .order('ts', { ascending: false })
      .limit(20);

    // If org view, filter by org_id
    if (view === 'org' && org) {
      activityQuery = activityQuery.eq('org_id', org.id);
    }

    const { data: activity, error: activityError } = await activityQuery;

    if (activityError) {
      console.error('Error fetching activity:', activityError);
    }

    // Get app-specific metrics
    const { data: mrrByApp, error: mrrError } = await supabase
      .from('vw_mrr_app')
      .select('*');

    if (mrrError) {
      console.error('Error fetching MRR by app:', mrrError);
    }

    return NextResponse.json({
      overview: overview || {},
      trends: trends || [],
      activity: activity || [],
      mrrByApp: mrrByApp || [],
      isAdmin,
      currentView: view || 'org'
    });
  } catch (error) {
    console.error("HQ metrics API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch HQ metrics" },
      { status: 500 }
    );
  }
}

