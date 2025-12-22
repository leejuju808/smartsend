// Block 35333 — Dead Lead Detection Cron Job
// Runs periodically to detect and mark leads as dead

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function POST(req: NextRequest) {
  try {
    // Verify cron secret if provided
    const authHeader = req.headers.get("authorization");
    const cronSecret = req.headers.get("x-cron-secret");
    const expectedSecret = process.env.CRON_SECRET;
    
    if (expectedSecret && cronSecret !== expectedSecret && authHeader !== `Bearer ${expectedSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Detect dead leads (no activity for 30+ days)
    const { data: deadLeads, error: detectError } = await supabase.rpc("detect_dead_leads");

    if (detectError) {
      console.error("Error detecting dead leads:", detectError);
      return NextResponse.json(
        { error: "Failed to detect dead leads", details: detectError.message },
        { status: 500 }
      );
    }

    if (!deadLeads || deadLeads.length === 0) {
      return NextResponse.json({
        message: "No dead leads detected",
        processed: 0,
      });
    }

    let processed = 0;
    const errors: any[] = [];

    // Mark each dead lead
    for (const lead of deadLeads) {
      try {
        // Check if already marked as dead
        const { data: existingLead } = await supabase
          .from("leads")
          .select("status")
          .eq("id", lead.lead_id)
          .single();

        if (existingLead?.status === "dead") {
          continue; // Already marked
        }

        // Mark as dead using the function
        const { error: markError } = await supabase.rpc("mark_lead_dead", {
          p_lead_id: lead.lead_id,
          p_reason: "no_activity_30_days",
        });

        if (markError) {
          errors.push({ lead_id: lead.lead_id, error: markError.message });
        } else {
          processed++;
          
          // Calculate revival score
          await supabase.rpc("calculate_revival_score", {
            p_lead_id: lead.lead_id,
          }).then(({ data: score }) => {
            if (score !== null) {
              supabase
                .from("leads")
                .update({ revival_score: score })
                .eq("id", lead.lead_id);
            }
          });
        }
      } catch (err: any) {
        errors.push({ lead_id: lead.lead_id, error: err.message });
      }
    }

    return NextResponse.json({
      message: "Dead leads processed",
      processed,
      total: deadLeads.length,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error: any) {
    console.error("Error in dead lead detection:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}

// Allow GET for manual testing
export async function GET(req: NextRequest) {
  return POST(req);
}
































