// Block 50000 — SmartSend Roofing QC Inspection System v1
// API Route: QC Photos
// POST /api/qc/photos

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// POST: Upload QC photo
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const body = await req.json();
    const { qc_inspection_id, job_id, checklist_item, url, photo_type, uploaded_by } = body;

    if (!qc_inspection_id || !job_id || !checklist_item || !url) {
      return NextResponse.json(
        { error: "qc_inspection_id, job_id, checklist_item, and url are required" },
        { status: 400 }
      );
    }

    // Create QC photo record
    const { data: photo, error: photoError } = await supabase
      .from("qc_photos")
      .insert({
        qc_inspection_id,
        job_id,
        checklist_item,
        url,
        photo_type: photo_type || "other",
        uploaded_by: uploaded_by || user.id,
      })
      .select()
      .single();

    if (photoError) {
      console.error("Error creating QC photo:", photoError);
      return NextResponse.json(
        { error: "Failed to create QC photo" },
        { status: 500 }
      );
    }

    // Update photos_uploaded_count on QC inspection
    const { data: inspection } = await supabase
      .from("qc_inspections")
      .select("photos_uploaded_count")
      .eq("id", qc_inspection_id)
      .single();

    if (inspection) {
      await supabase
        .from("qc_inspections")
        .update({
          photos_uploaded_count: (inspection.photos_uploaded_count || 0) + 1,
        })
        .eq("id", qc_inspection_id);
    }

    return NextResponse.json({
      success: true,
      photo,
    });
  } catch (error: any) {
    console.error("Error in upload QC photo API:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
































