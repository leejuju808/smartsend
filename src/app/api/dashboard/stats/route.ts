import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { requireWorkspace } from "@/lib/workspace/withWorkspace";

export async function GET(req: NextRequest) {
  const gate = await requireWorkspace(req);
  if ("error" in gate) return gate.error;
  const supabase = getServerSupabase();

  try {
    // Get total leads
    const { data: leadsData, error: leadsError } = await supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", gate.workspace_id);
    
    const totalLeads = leadsData?.length || 0;

    // Get pending sends
    const { data: queueData, error: queueError } = await supabase
      .from("send_queue")
      .select("id, status", { count: "exact", head: false })
      .eq("workspace_id", gate.workspace_id);
    
    const pendingSends = queueData?.filter(q => q.status === 'pending').length || 0;
    
    // Calculate success rate
    const sentCount = queueData?.filter(q => q.status === 'sent').length || 0;
    const failedCount = queueData?.filter(q => q.status === 'failed' || q.status === 'bounced').length || 0;
    const totalAttempted = sentCount + failedCount;
    const successRate = totalAttempted > 0 ? Math.round((sentCount / totalAttempted) * 100) : 0;

    return NextResponse.json({
      totalLeads,
      pendingSends,
      successRate,
    });
  } catch (error) {
    console.error("Dashboard stats error:", error);
    return NextResponse.json(
      { error: "Failed to fetch dashboard stats" },
      { status: 500 }
    );
  }
}
