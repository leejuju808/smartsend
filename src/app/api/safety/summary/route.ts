import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { getActiveWorkspaceId } from "@/lib/workspace/context";

// GET /api/safety/summary - Get safety overview summary
export async function GET(req: NextRequest) {
  try {
    const supabase = await getServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const workspaceId = await getActiveWorkspaceId();
    if (!workspaceId) {
      return NextResponse.json({ error: "No workspace selected" }, { status: 400 });
    }

    const today = new Date().toISOString().split("T")[0];

    // Get today's toolbox talk
    const { data: todayTalk } = await supabase
      .from("toolbox_talks")
      .select("id, topic, date")
      .eq("workspace_id", workspaceId)
      .eq("date", today)
      .maybeSingle();

    // Get today's PPE checks
    const { data: todayPPE } = await supabase
      .from("ppe_checks")
      .select("id, date, hard_hat, harness, boots, vest, goggles, gloves")
      .eq("workspace_id", workspaceId)
      .eq("date", today);

    // Calculate PPE compliance
    const ppeCompliance = todayPPE?.length
      ? todayPPE.map((check) => {
          const allItems = [
            check.hard_hat,
            check.harness,
            check.boots,
            check.vest,
            check.goggles,
            check.gloves,
          ];
          const passed = allItems.filter(Boolean).length;
          return { id: check.id, passed, total: 6 };
        })
      : [];

    // Get open incidents (High/Critical severity or follow_up_required)
    const { data: openIncidents } = await supabase
      .from("incident_reports")
      .select("id, type, severity, date, follow_up_required")
      .eq("workspace_id", workspaceId)
      .or("severity.in.(High,Critical),follow_up_required.eq.true")
      .order("date", { ascending: false });

    // Get expiring certifications (within 30 days)
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 30);
    const { data: expiringCerts } = await supabase
      .from("certifications")
      .select("id, user_id, type, expiration_date")
      .eq("workspace_id", workspaceId)
      .gte("expiration_date", today)
      .lte("expiration_date", futureDate.toISOString().split("T")[0])
      .order("expiration_date", { ascending: true });

    return NextResponse.json({
      ok: true,
      data: {
        today_toolbox_talk: todayTalk
          ? { done: true, topic: todayTalk.topic, id: todayTalk.id }
          : { done: false },
        ppe_compliance: {
          total_checks: ppeCompliance.length,
          passed: ppeCompliance.filter((c) => c.passed === 6).length,
          failed: ppeCompliance.filter((c) => c.passed < 6).length,
        },
        open_incidents: openIncidents?.length || 0,
        expiring_certifications: expiringCerts?.length || 0,
        incidents: openIncidents || [],
        certifications: expiringCerts || [],
      },
    });
  } catch (error: any) {
    console.error("Error in GET /api/safety/summary:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
