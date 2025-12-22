// Block 16300 — SmartSend Pipeline v2 Heat Score Update Worker
// POST /api/cron/pipeline/update-heat
// Recalculates lead heat scores for contacts

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    
    // Check for cron secret
    const cronSecret = req.headers.get("x-cron-secret");
    if (cronSecret !== process.env.CRON_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let updatedCount = 0;

    // Get contacts that need heat score updates
    // Priority: contacts with recent activity (replies, appointments, storms)
    const { data: contacts } = await supabase
      .from("contacts")
      .select("id, workspace_id")
      .or(
        `updated_at.gte.${new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()},` +
        `last_appointment_at.gte.${new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()},` +
        `quote_sent_at.gte.${new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()}`
      )
      .limit(500);

    for (const contact of contacts || []) {
      try {
        await supabase.rpc("calculate_lead_heat_score", {
          p_contact_id: contact.id,
        });
        updatedCount++;
      } catch (error) {
        console.error(`Failed to calculate heat score for contact ${contact.id}:`, error);
      }
    }

    // Also update contacts with heat scores older than 24 hours
    const { data: staleHeatScores } = await supabase
      .from("lead_heat_scores")
      .select("contact_id")
      .lt("last_calculated_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .limit(200);

    for (const heatScore of staleHeatScores || []) {
      try {
        await supabase.rpc("calculate_lead_heat_score", {
          p_contact_id: heatScore.contact_id,
        });
        updatedCount++;
      } catch (error) {
        console.error(`Failed to recalculate heat score for contact ${heatScore.contact_id}:`, error);
      }
    }

    return NextResponse.json({
      success: true,
      updated: updatedCount,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("[Pipeline Update Heat] Error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}





















































