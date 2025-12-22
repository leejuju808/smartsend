// Block 65000 — SmartSend Roofing Homeowner Experience Portal v2
// API endpoint: Add photo to homeowner feed
// Triggered by crew photo upload → adds to feed automatically

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
    const { job_id, photo_url, caption, photo_type, uploaded_by_crew } = body;

    if (!job_id || !photo_url) {
      return NextResponse.json(
        { error: "job_id and photo_url are required" },
        { status: 400 }
      );
    }

    // Insert photo into homeowner feed
    const { data: photo, error: photoError } = await supabase
      .from("homeowner_photo_feed")
      .insert({
        job_id,
        photo_url,
        caption: caption || null,
        photo_type: photo_type || "during",
        uploaded_by_crew: uploaded_by_crew || false,
      })
      .select()
      .single();

    if (photoError) {
      console.error("Error adding photo to feed:", photoError);
      return NextResponse.json(
        { error: "Failed to add photo to feed" },
        { status: 500 }
      );
    }

    // Get homeowner info to send notification
    const { data: homeowners } = await supabase
      .from("homeowners")
      .select("id, email, name")
      .eq("job_id", job_id)
      .limit(1);

    // Create notification for homeowner
    if (homeowners && homeowners.length > 0) {
      const homeowner = homeowners[0];
      await supabase.from("homeowner_notifications").insert({
        job_id,
        homeowner_id: homeowner.id,
        type: "photo_uploaded",
        message: "New photo has been added to your job!",
      });
    }

    return NextResponse.json({
      success: true,
      photo,
    });
  } catch (error: any) {
    console.error("Error in add-photo:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}




























