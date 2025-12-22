// Block 26940 — SmartSend Roofing Field Photo & Document Intelligence v1
// API Route: Get Photos for Job
// GET /api/job/[job_id]/photos

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/server";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ job_id: string }> }
) {
  try {
    const { job_id } = await params;
    const supabase = createClient();
    const serviceSupabase = createServiceClient();

    // Ensure user is authenticated
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

    // Get photos
    const { data: photos, error: photosError } = await serviceSupabase
      .from("roofing_field_photos")
      .select("*")
      .eq("job_id", job_id)
      .order("created_at", { ascending: false });

    if (photosError) {
      return NextResponse.json(
        { error: "Failed to fetch photos" },
        { status: 500 }
      );
    }

    // Get public URLs for photos
    const photosWithUrls = (photos || []).map((photo) => {
      const { data: urlData } = serviceSupabase.storage
        .from("job-photos")
        .getPublicUrl(photo.storage_path);

      return {
        ...photo,
        url: urlData.publicUrl,
      };
    });

    return NextResponse.json({
      photos: photosWithUrls,
    });
  } catch (error: any) {
    console.error("Error fetching photos:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}



































