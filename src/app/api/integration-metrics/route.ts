import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  try {
    const supabase = createAdminClient();

    // Get integration metrics from view
    const { data, error } = await supabase
      .from("integration_metrics")
      .select("*")
      .single();

    if (error) {
      console.error("Error fetching integration metrics:", error);
      return NextResponse.json(
        { error: "Failed to fetch metrics" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      hubspot_orgs: data?.hubspot_orgs || 0,
      notion_orgs: data?.notion_orgs || 0,
      zapier_orgs: data?.zapier_orgs || 0,
      total_integration_orgs: data?.total_integration_orgs || 0,
    });
  } catch (error) {
    console.error("Error in integration metrics API:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
