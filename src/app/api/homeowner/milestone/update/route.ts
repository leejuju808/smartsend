// Block 65000 — SmartSend Roofing Homeowner Experience Portal v2
// API endpoint: Update milestone status
// Triggered as tasks complete or manually updated

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false },
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { job_id, milestone, status, milestone_id } = body;

    if (!job_id) {
      return NextResponse.json(
        { error: "job_id is required" },
        { status: 400 }
      );
    }

    let milestoneRecord;

    if (milestone_id) {
      // Update existing milestone
      const updateData: any = {};
      if (status) updateData.status = status;
      if (status === "completed") {
        updateData.completed_at = new Date().toISOString();
      }

      const { data, error } = await supabase
        .from("homeowner_milestones")
        .update(updateData)
        .eq("id", milestone_id)
        .eq("job_id", job_id)
        .select()
        .single();

      if (error) {
        console.error("Error updating milestone:", error);
        return NextResponse.json(
          { error: "Failed to update milestone" },
          { status: 500 }
        );
      }

      milestoneRecord = data;
    } else if (milestone && status) {
      // Create or update milestone by name
      // First check if milestone exists
      const { data: existing } = await supabase
        .from("homeowner_milestones")
        .select("*")
        .eq("job_id", job_id)
        .eq("milestone", milestone)
        .single();

      if (existing) {
        // Update existing
        const updateData: any = { status };
        if (status === "completed") {
          updateData.completed_at = new Date().toISOString();
        }

        const { data, error } = await supabase
          .from("homeowner_milestones")
          .update(updateData)
          .eq("id", existing.id)
          .select()
          .single();

        if (error) {
          console.error("Error updating milestone:", error);
          return NextResponse.json(
            { error: "Failed to update milestone" },
            { status: 500 }
          );
        }

        milestoneRecord = data;
      } else {
        // Create new milestone
        const insertData: any = {
          job_id,
          milestone,
          status,
        };
        if (status === "completed") {
          insertData.completed_at = new Date().toISOString();
        }

        const { data, error } = await supabase
          .from("homeowner_milestones")
          .insert(insertData)
          .select()
          .single();

        if (error) {
          console.error("Error creating milestone:", error);
          return NextResponse.json(
            { error: "Failed to create milestone" },
            { status: 500 }
          );
        }

        milestoneRecord = data;
      }
    } else {
      return NextResponse.json(
        { error: "milestone and status are required, or milestone_id with status" },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      milestone: milestoneRecord,
    });
  } catch (error: any) {
    console.error("Error in milestone update:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}




























