// Block 226000 — SmartSend Roofing Safety Compliance System
// POST /api/safety/toolbox/submit
// Submit toolbox talk attendance with signatures

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const {
      talkId,
      crewId,
      workerName,
      signatureUrl,
      signed,
    } = await req.json();

    if (!talkId || !workerName) {
      return NextResponse.json(
        { error: "talkId and workerName are required" },
        { status: 400 }
      );
    }

    // Check if attendance already exists
    const { data: existingAttendance } = await supabase
      .from("toolbox_attendance")
      .select("id")
      .eq("talk_id", talkId)
      .eq("worker_name", workerName)
      .maybeSingle();

    if (existingAttendance) {
      // Update existing attendance
      const { data: attendance, error: updateError } = await supabase
        .from("toolbox_attendance")
        .update({
          signed: signed !== undefined ? signed : true,
          signature_url: signatureUrl || null,
          signed_at: signed !== false ? new Date().toISOString() : null,
        })
        .eq("id", existingAttendance.id)
        .select()
        .single();

      if (updateError) {
        console.error("Error updating toolbox attendance:", updateError);
        return NextResponse.json(
          { error: "Failed to update attendance", details: updateError.message },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        attendance,
        message: "Toolbox talk attendance updated",
      });
    }

    // Create new attendance record
    const { data: attendance, error: attendanceError } = await supabase
      .from("toolbox_attendance")
      .insert({
        talk_id: talkId,
        crew_id: crewId || null,
        worker_name: workerName,
        signed: signed !== undefined ? signed : true,
        signature_url: signatureUrl || null,
        signed_at: signed !== false ? new Date().toISOString() : null,
      })
      .select()
      .single();

    if (attendanceError) {
      console.error("Error creating toolbox attendance:", attendanceError);
      return NextResponse.json(
        { error: "Failed to submit attendance", details: attendanceError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      attendance,
      message: "Toolbox talk attendance submitted successfully",
    });
  } catch (error: any) {
    console.error("Submit toolbox attendance error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

// GET /api/safety/toolbox/submit - Get toolbox talk attendance
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const talkId = searchParams.get("talkId");
    const crewId = searchParams.get("crewId");

    if (!talkId) {
      return NextResponse.json(
        { error: "talkId is required" },
        { status: 400 }
      );
    }

    let query = supabase
      .from("toolbox_attendance")
      .select("*")
      .eq("talk_id", talkId)
      .order("signed_at", { ascending: false });

    if (crewId) {
      query = query.eq("crew_id", crewId);
    }

    const { data: attendance, error } = await query;

    if (error) {
      console.error("Error fetching toolbox attendance:", error);
      return NextResponse.json(
        { error: "Failed to fetch attendance", details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      attendance: attendance || [],
    });
  } catch (error: any) {
    console.error("Get toolbox attendance error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

























