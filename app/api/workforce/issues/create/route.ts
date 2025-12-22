// POST /api/workforce/issues/create
// Create a new crew issue report

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getServiceClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRole) {
    throw new Error("Supabase credentials are not configured");
  }

  return createClient(supabaseUrl, serviceRole, {
    auth: { persistSession: false },
  });
}

export async function POST(req: NextRequest) {
  try {
    const supabase = getServiceClient();
    const body = await req.json();

    const { job_id, employee_id, issue_type, severity, title, description, photo_url, location_lat, location_lng } = body;

    // Validate required fields
    if (!issue_type || !severity || !title) {
      return NextResponse.json(
        { error: "issue_type, severity, and title are required" },
        { status: 400 }
      );
    }

    // Validate issue_type
    if (!['material', 'safety', 'damage', 'customer', 'weather', 'other'].includes(issue_type)) {
      return NextResponse.json(
        { error: "Invalid issue_type" },
        { status: 400 }
      );
    }

    // Validate severity
    if (!['low', 'medium', 'high', 'critical'].includes(severity)) {
      return NextResponse.json(
        { error: "Invalid severity" },
        { status: 400 }
      );
    }

    // Insert issue
    const { data, error } = await supabase
      .from("crew_issues")
      .insert({
        job_id: job_id || null,
        employee_id: employee_id || null,
        issue_type,
        severity,
        title,
        description: description || null,
        photo_url: photo_url || null,
        location_lat: location_lat || null,
        location_lng: location_lng || null,
      })
      .select("*")
      .single();

    if (error) {
      console.error("Error creating issue:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Trigger alert for high/critical severity issues
    if (severity === 'high' || severity === 'critical') {
      try {
        // Call edge function to send alert
        const alertUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/issue-created-alert`;
        await fetch(alertUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
          },
          body: JSON.stringify({
            issue_id: data.id,
            severity,
            issue_type,
            title,
            job_id,
          }),
        }).catch((err) => {
          console.error("Failed to trigger alert:", err);
          // Don't fail the request if alert fails
        });
      } catch (alertError) {
        console.error("Error triggering alert:", alertError);
        // Continue even if alert fails
      }
    }

    return NextResponse.json({ success: true, issue: data }, { status: 201 });
  } catch (error: any) {
    console.error("Error in POST /api/workforce/issues/create:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
























