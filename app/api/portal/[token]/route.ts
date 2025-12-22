// Block 83000 — SmartSend Roofing Homeowner Portal v1
// API Route: Public Portal Data (Token-Based)
// GET /api/portal/[token]

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const supabase = createClient();
    const { token } = await params;

    // Get portal by token
    const { data: portal, error: portalError } = await supabase
      .from("homeowner_portals")
      .select("*")
      .eq("portal_token", token)
      .eq("is_active", true)
      .single();

    if (portalError || !portal) {
      return NextResponse.json(
        { error: "Portal not found or inactive" },
        { status: 404 }
      );
    }

    // Get job details
    const { data: job, error: jobError } = await supabase
      .from("roofing_jobs")
      .select("id, title, status, scheduled_start_date, scheduled_end_date, address, homeowner_name, homeowner_email")
      .eq("id", portal.job_id)
      .single();

    if (jobError || !job) {
      return NextResponse.json(
        { error: "Job not found" },
        { status: 404 }
      );
    }

    // Get events
    const { data: events, error: eventsError } = await supabase
      .from("homeowner_portal_events")
      .select("*")
      .eq("portal_id", portal.id)
      .order("created_at", { ascending: false });

    // Get files
    const { data: files, error: filesError } = await supabase
      .from("homeowner_portal_files")
      .select("*")
      .eq("portal_id", portal.id)
      .order("uploaded_at", { ascending: false });

    // Get photos from site_photos (if table exists)
    let photos: any[] = [];
    try {
      const { data: sitePhotos } = await supabase
        .from("site_photos")
        .select("id, photo_url, category, caption, created_at")
        .eq("job_id", portal.job_id)
        .order("created_at", { ascending: false });
      
      if (sitePhotos) {
        photos = sitePhotos;
      }
    } catch (e) {
      // Try alternative table name
      try {
        const { data: jobPhotos } = await supabase
          .from("job_field_photos")
          .select("id, storage_path, tag, caption, created_at")
          .eq("job_id", portal.job_id)
          .order("created_at", { ascending: false });
        
        if (jobPhotos) {
          // Map to expected format
          photos = jobPhotos.map((p: any) => ({
            id: p.id,
            photo_url: p.storage_path, // May need to construct full URL
            category: p.tag,
            caption: p.caption,
            created_at: p.created_at,
          }));
        }
      } catch (e2) {
        // Photos table doesn't exist or different structure
        console.log("Could not fetch photos:", e2);
      }
    }

    // Get crew assignment info (if available)
    let crewInfo = null;
    try {
      const { data: crewAssignment } = await supabase
        .from("job_crew_assignments")
        .select("*, crews(name)")
        .eq("job_id", portal.job_id)
        .is("unassigned_at", null)
        .single();
      
      if (crewAssignment) {
        crewInfo = crewAssignment;
      }
    } catch (e) {
      // Crew assignment table may not exist or different structure
    }

    return NextResponse.json({
      portal,
      job,
      events: events || [],
      files: files || [],
      photos: photos || [],
      crew: crewInfo,
    });
  } catch (error: any) {
    console.error("Error fetching portal data:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}



























