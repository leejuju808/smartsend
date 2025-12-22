import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { getCurrentWorkspaceId } from "@/lib/workspace";

export async function GET(req: NextRequest) {
  const supabase = createRouteHandlerClient({ cookies });
  const workspaceId = await getCurrentWorkspaceId();

  if (!workspaceId) {
    return NextResponse.json({ error: "no workspace" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const industry = searchParams.get("industry");
  const size = searchParams.get("size");
  const health = searchParams.get("health"); // 'hot', 'warm', 'cold'
  const showMerged = searchParams.get("show_merged") === "true";
  const showDuplicatesOnly = searchParams.get("show_duplicates_only") === "true";

  // Build query
  let query = supabase
    .from("companies")
    .select("*")
    .eq("workspace_id", workspaceId);

  if (industry) {
    query = query.eq("industry", industry);
  }
  if (size) {
    query = query.eq("size", size);
  }

  if (!showMerged) {
    query = query.or("is_merged.is.null,is_merged.eq.false");
  }

  const { data: companies, error } = await query
    .order("created_at", { ascending: false });

  // Filter for duplicates if requested
  let filteredCompanies = companies || [];
  if (showDuplicatesOnly && companies) {
    const { data: duplicates } = await supabase
      .from("company_duplicates")
      .select("company_id, duplicate_company_id")
      .eq("workspace_id", workspaceId)
      .is("reviewed_at", null);

    if (duplicates) {
      const duplicateCompanyIds = new Set<string>();
      duplicates.forEach((dup) => {
        duplicateCompanyIds.add(dup.company_id);
        duplicateCompanyIds.add(dup.duplicate_company_id);
      });
      filteredCompanies = companies.filter((c: any) => duplicateCompanyIds.has(c.id));
    }
  }

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }

  // Get stats for each company
  const companiesWithStats = await Promise.all(
    (filteredCompanies || []).map(async (c: any) => {
      // Get lead IDs for this company
      const { data: leads } = await supabase
        .from("leads")
        .select("id, status, owner_id")
        .eq("company_id", c.id)
        .eq("workspace_id", workspaceId);

      const leadIds = (leads || []).map((l: any) => l.id);
      const leadsCount = leadIds.length;

      // Get open deals
      const { data: deals } = await supabase
        .from("deals")
        .select("id, stage, value")
        .eq("workspace_id", workspaceId)
        .in("lead_id", leadIds.length > 0 ? leadIds : [null])
        .not("stage", "eq", "closed_lost")
        .not("stage", "eq", "closed_won");

      const openDealsCount = (deals || []).length;
      const openDealsValue = (deals || []).reduce((sum: number, d: any) => sum + (d.value || 0), 0);

      // Get recent activity (last 14 days)
      const fourteenDaysAgo = new Date();
      fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

      const { data: recentActivity } = await supabase
        .from("lead_activity")
        .select("type, occurred_at")
        .in("lead_id", leadIds.length > 0 ? leadIds : [null])
        .gte("occurred_at", fourteenDaysAgo.toISOString())
        .eq("type", "reply")
        .limit(1);

      const hasRecentReply = (recentActivity || []).length > 0;

      // Get high-intent leads (replied or has meeting intent)
      const { data: highIntentLeads } = await supabase
        .from("leads")
        .select("id")
        .eq("company_id", c.id)
        .eq("workspace_id", workspaceId)
        .or("status.eq.replied,status.eq.high_intent");

      const highIntentCount = (highIntentLeads || []).length;

      // Calculate account health score
      let healthScore = 0;
      if (openDealsCount > 0) healthScore += 40;
      if (hasRecentReply) healthScore += 30;
      if (highIntentCount > 0) healthScore += 20;
      
      // Get open rate (simplified - check if any leads have opens)
      const { data: opens } = await supabase
        .from("lead_activity")
        .select("id")
        .in("lead_id", leadIds.length > 0 ? leadIds : [null])
        .eq("type", "email_open")
        .limit(1);

      if (opens && opens.length > 0) healthScore += 10;

      // Determine health category
      let healthCategory: "hot" | "warm" | "cold" = "cold";
      if (healthScore >= 80) healthCategory = "hot";
      else if (healthScore >= 50) healthCategory = "warm";

      // Filter by health if requested
      if (health && health !== healthCategory) {
        return null;
      }

      // Get last activity date
      const { data: lastActivity } = await supabase
        .from("lead_activity")
        .select("occurred_at")
        .in("lead_id", leadIds.length > 0 ? leadIds : [null])
        .order("occurred_at", { ascending: false })
        .limit(1)
        .single();

      return {
        ...c,
        leads_count: leadsCount,
        open_deals_count: openDealsCount,
        open_deals_value: openDealsValue,
        health_score: healthScore,
        health_category: healthCategory,
        last_activity_date: lastActivity?.occurred_at || null,
      };
    })
  );

  // Filter out nulls (from health filter)
  const filtered = companiesWithStats.filter((c: any) => c !== null);

  return NextResponse.json({ companies: filtered });
}

