// Block 17600 — SmartSend Contact Priority Engine v1
// POST /api/cron/priority/recalculate
// Recalculates priority scores for contacts

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
    let errorCount = 0;

    // Strategy 1: Update contacts with recent activity (replies, appointments, storms, insurance updates)
    // These are most likely to have changed priority
    const { data: recentContacts } = await supabase
      .from("contacts")
      .select("id, workspace_id")
      .or(
        `updated_at.gte.${new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()},` +
        `last_appointment_at.gte.${new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()},` +
        `quote_sent_at.gte.${new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()},` +
        `inspection_completed_at.gte.${new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()}`
      )
      .limit(500);

    for (const contact of recentContacts || []) {
      try {
        await supabase.rpc("calculate_contact_priority", {
          p_contact_id: contact.id,
        });
        updatedCount++;
      } catch (error) {
        console.error(`Failed to calculate priority for contact ${contact.id}:`, error);
        errorCount++;
      }
    }

    // Strategy 2: Update stale priority scores (older than 24 hours)
    const { data: staleScores } = await supabase
      .from("priority_scores")
      .select("contact_id")
      .lt("last_calculated_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .limit(200);

    for (const score of staleScores || []) {
      try {
        await supabase.rpc("calculate_contact_priority", {
          p_contact_id: score.contact_id,
        });
        updatedCount++;
      } catch (error) {
        console.error(`Failed to recalculate priority for contact ${score.contact_id}:`, error);
        errorCount++;
      }
    }

    // Strategy 3: Update high-priority contacts more frequently (every 6 hours)
    const { data: highPriorityContacts } = await supabase
      .from("priority_scores")
      .select("contact_id")
      .in("priority_band", ["priority_1", "priority_2"])
      .lt("last_calculated_at", new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString())
      .limit(100);

    for (const score of highPriorityContacts || []) {
      try {
        await supabase.rpc("calculate_contact_priority", {
          p_contact_id: score.contact_id,
        });
        updatedCount++;
      } catch (error) {
        console.error(`Failed to recalculate high-priority contact ${score.contact_id}:`, error);
        errorCount++;
      }
    }

    // Strategy 4: Update neglected high-priority leads (they need attention)
    const { data: neglectedLeads } = await supabase
      .from("priority_scores")
      .select("contact_id")
      .eq("is_neglected", true)
      .in("priority_band", ["priority_1", "priority_2"])
      .limit(50);

    for (const score of neglectedLeads || []) {
      try {
        await supabase.rpc("calculate_contact_priority", {
          p_contact_id: score.contact_id,
        });
        updatedCount++;
      } catch (error) {
        console.error(`Failed to recalculate neglected lead ${score.contact_id}:`, error);
        errorCount++;
      }
    }

    return NextResponse.json({
      success: true,
      updated: updatedCount,
      errors: errorCount,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("[Priority Recalculate] Error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

// GET endpoint for manual triggering (with auth check)
export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();
    
    // Check for cron secret in query param or header
    const cronSecret = req.headers.get("x-cron-secret") || req.nextUrl.searchParams.get("key");
    if (cronSecret !== process.env.CRON_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Same logic as POST
    return await POST(req);
  } catch (error: any) {
    console.error("[Priority Recalculate] Error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}





















































