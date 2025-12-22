// Block 15300 — Lead Source Breakdown API
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceAndPlan } from "@/lib/getWorkspacePlan";

export async function GET() {
  try {
    const supabase = createClient();
    const { workspaceId } = await getWorkspaceAndPlan();

    // Get lead source counts for contacts created in the last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const { data: contacts, error } = await supabase
      .from("contacts")
      .select("lead_source")
      .eq("workspace_id", workspaceId)
      .gte("created_at", thirtyDaysAgo.toISOString());

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    // Count by lead source
    const counts: Record<string, number> = {};
    (contacts || []).forEach((contact) => {
      const source = contact.lead_source || "unknown";
      counts[source] = (counts[source] || 0) + 1;
    });

    // Format for display
    const breakdown = [
      { source: "storm_outreach", count: counts["storm_outreach"] || 0 },
      { source: "insurance_lead", count: counts["insurance_lead"] || 0 },
      { source: "retail_lead", count: counts["retail_lead"] || 0 },
      { source: "past_customer", count: counts["past_customer"] || 0 },
      { source: "quote_reactivation", count: counts["quote_reactivation"] || 0 },
      { source: "website_inquiry", count: counts["website_inquiry"] || 0 },
      { source: "referral", count: counts["referral"] || 0 },
      { source: "unknown", count: counts["unknown"] || 0 },
    ].filter((item) => item.count > 0);

    return NextResponse.json({ breakdown });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to fetch lead source breakdown" },
      { status: 500 }
    );
  }
}



























































