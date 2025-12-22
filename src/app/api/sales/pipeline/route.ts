// Block 254300 — SmartSend Sales Acceleration Engine v1
// Sales Pipeline Dashboard API
// GET /api/sales/pipeline?org_id=xxx

import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  try {
    const supabase = await getServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const searchParams = req.nextUrl.searchParams;
    const org_id = searchParams.get("org_id");

    if (!org_id) {
      return NextResponse.json({ error: "org_id required" }, { status: 400 });
    }

    // Get pipeline summary from view
    const { data: summary, error: summaryError } = await supabase
      .from("v_sales_pipeline_summary")
      .select("*")
      .eq("org_id", org_id)
      .single();

    if (summaryError && summaryError.code !== "PGRST116") {
      console.error("Error fetching pipeline summary:", summaryError);
    }

    // Get leads by stage
    const { data: leadsByStage, error: leadsError } = await supabase
      .from("leads")
      .select(
        `
        id,
        customer_name,
        email,
        phone,
        address,
        sales_status,
        lead_score,
        lead_source,
        assigned_to,
        created_at,
        sales_reps:assigned_to(name)
      `
      )
      .eq("org_id", org_id)
      .not("sales_status", "is", null)
      .order("created_at", { ascending: false });

    if (leadsError) {
      console.error("Error fetching leads:", leadsError);
    }

    // Group leads by stage
    const stages = {
      new: leadsByStage?.filter((l) => l.sales_status === "new") || [],
      contacted: leadsByStage?.filter((l) => l.sales_status === "contacted") || [],
      estimating: leadsByStage?.filter((l) => l.sales_status === "estimating") || [],
      quoted: leadsByStage?.filter((l) => l.sales_status === "quoted") || [],
      follow_up_needed: leadsByStage?.filter((l) => l.sales_status === "follow_up_needed") || [],
      won: leadsByStage?.filter((l) => l.sales_status === "won") || [],
      lost: leadsByStage?.filter((l) => l.sales_status === "lost") || [],
    };

    // Get recent estimates
    const { data: recentEstimates } = await supabase
      .from("estimates")
      .select(
        `
        id,
        lead_id,
        job_type,
        squares,
        price,
        created_at,
        leads:lead_id(customer_name, email)
      `
      )
      .eq("org_id", org_id)
      .order("created_at", { ascending: false })
      .limit(10);

    // Get recent proposals
    const { data: recentProposals } = await supabase
      .from("proposals")
      .select(
        `
        id,
        lead_id,
        estimate_id,
        sent,
        sent_at,
        leads:lead_id(customer_name, email)
      `
      )
      .eq("org_id", org_id)
      .order("created_at", { ascending: false })
      .limit(10);

    return NextResponse.json({
      success: true,
      pipeline: {
        summary: summary || {
          new_leads: stages.new.length,
          contacted_leads: stages.contacted.length,
          estimating_leads: stages.estimating.length,
          quoted_leads: stages.quoted.length,
          follow_up_needed: stages.follow_up_needed.length,
          won_leads: stages.won.length,
          lost_leads: stages.lost.length,
          total_leads: leadsByStage?.length || 0,
          in_pipeline: stages.quoted.length + stages.follow_up_needed.length + stages.won.length,
          proposals_sent: recentProposals?.filter((p) => p.sent).length || 0,
          projected_revenue: 0,
          close_rate_percent: 0,
        },
        stages,
        recent_estimates: recentEstimates || [],
        recent_proposals: recentProposals || [],
      },
    });
  } catch (error: any) {
    console.error("Error in pipeline API:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}






















