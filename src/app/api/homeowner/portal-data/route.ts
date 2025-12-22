// Block 65000 — SmartSend Roofing Homeowner Experience Portal v2
// API endpoint: Get all homeowner portal data
// Returns: photos, milestones, crew status, notifications, job timeline

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false },
});

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const token = searchParams.get("token");
    const job_id = searchParams.get("job_id");

    if (!token && !job_id) {
      return NextResponse.json(
        { error: "token or job_id is required" },
        { status: 400 }
      );
    }

    let final_job_id: string | null = job_id || null;
    let homeowner_id: string | null = null;

    // Validate token if provided
    if (token) {
      const { data: session, error: sessionError } = await supabase
        .from("homeowner_sessions")
        .select("*, homeowners(id, job_id)")
        .eq("token", token)
        .single();

      if (sessionError || !session) {
        return NextResponse.json(
          { error: "Invalid or expired token" },
          { status: 401 }
        );
      }

      if (new Date(session.expires_at) < new Date()) {
        return NextResponse.json(
          { error: "Token has expired" },
          { status: 401 }
        );
      }

      const homeowner = (session as any).homeowners;
      homeowner_id = homeowner?.id || null;
      final_job_id = homeowner?.job_id || final_job_id;
    }

    if (!final_job_id) {
      return NextResponse.json(
        { error: "Could not determine job_id" },
        { status: 400 }
      );
    }

    // Update last viewed timestamp
    if (homeowner_id) {
      await supabase
        .from("homeowner_job_views")
        .upsert(
          {
            job_id: final_job_id,
            homeowner_id,
            last_viewed_at: new Date().toISOString(),
          },
          {
            onConflict: "job_id,homeowner_id",
          }
        );
    }

    // Get all portal data using the helper function
    const { data: portalData, error: dataError } = await supabase.rpc(
      "get_homeowner_portal_data",
      {
        p_job_id: final_job_id,
        p_homeowner_id: homeowner_id,
      }
    );

    if (dataError) {
      console.error("Error fetching portal data:", dataError);
      // Fallback: manually fetch data
      return await fetchPortalDataManually(final_job_id, homeowner_id);
    }

    // Get job info
    let jobInfo = null;
    
    // Try roofing_jobs first
    const { data: roofingJob } = await supabase
      .from("roofing_jobs")
      .select("*")
      .eq("id", final_job_id)
      .single();

    if (roofingJob) {
      jobInfo = roofingJob;
    } else {
      // Try jobs table
      const { data: job } = await supabase
        .from("jobs")
        .select("*")
        .eq("id", final_job_id)
        .single();

      if (job) {
        jobInfo = job;
      }
    }

    // Get recent messages
    const { data: messages } = await supabase
      .from("homeowner_messages")
      .select("*")
      .eq("job_id", final_job_id)
      .order("created_at", { ascending: false })
      .limit(50);

    return NextResponse.json({
      success: true,
      job: jobInfo,
      portal: portalData,
      messages: messages || [],
    });
  } catch (error: any) {
    console.error("Error in portal-data:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

async function fetchPortalDataManually(
  job_id: string,
  homeowner_id: string | null
) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false },
  });

  // Fetch photos
  const { data: photos } = await supabase
    .from("homeowner_photo_feed")
    .select("*")
    .eq("job_id", job_id)
    .order("uploaded_at", { ascending: false });

  // Fetch milestones
  const { data: milestones } = await supabase
    .from("homeowner_milestones")
    .select("*")
    .eq("job_id", job_id)
    .order("created_at", { ascending: true });

  // Get crew status
  const { data: crewStatus } = await supabase
    .from("crew_location_tracking")
    .select("*")
    .eq("job_id", job_id)
    .order("timestamp", { ascending: false })
    .limit(1);

  // Fetch notifications
  const notificationQuery = supabase
    .from("homeowner_notifications")
    .select("*")
    .eq("job_id", job_id)
    .order("sent_at", { ascending: false })
    .limit(10);

  if (homeowner_id) {
    notificationQuery.eq("homeowner_id", homeowner_id);
  }

  const { data: notifications } = await notificationQuery;

  return NextResponse.json({
    success: true,
    portal: {
      photos: photos || [],
      milestones: milestones || [],
      crew_status: crewStatus && crewStatus.length > 0
        ? {
            status: crewStatus[0].location_type,
            location_type: crewStatus[0].location_type,
            latitude: crewStatus[0].latitude,
            longitude: crewStatus[0].longitude,
            address: crewStatus[0].address,
            timestamp: crewStatus[0].timestamp,
          }
        : { status: "not_arrived", location_type: null, timestamp: null },
      recent_notifications: notifications || [],
    },
  });
}




























