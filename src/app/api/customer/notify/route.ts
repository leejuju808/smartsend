// Block 243000 — SmartSend Roofing CX Hub
// POST /api/customer/notify
// Push customer notification (for office/automation use)

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { homeowner_id, job_id, title, message, event_type, metadata } = body;

    if (!homeowner_id || !job_id || !title) {
      return NextResponse.json(
        { error: "homeowner_id, job_id, and title are required" },
        { status: 400 }
      );
    }

    // Validate event_type if provided
    const validEventTypes = [
      "estimate_sent",
      "contract_signed",
      "deposit_paid",
      "progress_payment_paid",
      "materials_delivered",
      "crew_scheduled",
      "crew_started",
      "crew_finished",
      "photos_uploaded",
      "job_completed",
      "warranty_issued",
    ];

    const finalEventType = event_type && validEventTypes.includes(event_type)
      ? event_type
      : "photos_uploaded"; // Default

    // Create notification
    const { data: notification, error: insertError } = await supabase
      .from("customer_notifications")
      .insert({
        homeowner_id,
        job_id,
        event_type: finalEventType,
        title,
        body: message || null,
        metadata: metadata || {},
        read: false,
      })
      .select()
      .single();

    if (insertError) {
      console.error("Error creating notification:", insertError);
      return NextResponse.json(
        { error: "Failed to create notification" },
        { status: 500 }
      );
    }

    // In production, this would also:
    // 1. Send SMS notification (if homeowner has phone)
    // 2. Send email notification
    // 3. Send push notification (if mobile app)

    return NextResponse.json({
      ok: true,
      notification,
    });
  } catch (error: any) {
    console.error("Error in notify API:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

























