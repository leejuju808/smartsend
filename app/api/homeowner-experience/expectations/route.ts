import { NextRequest, NextResponse } from "next/server";
import { sendExpectationSetting } from "@/lib/homeowner-experience/block25700-automation";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { workspaceId, jobId, contactId, expectationType, sendTiming, metadata, channel } = body;

    // Validate required fields
    if (!workspaceId || !contactId || !expectationType) {
      return NextResponse.json(
        { error: "Missing required fields: workspaceId, contactId, expectationType" },
        { status: 400 }
      );
    }

    // Validate expectation type
    const validTypes = [
      "noise_levels",
      "debris_expectations",
      "dumpster_placement",
      "vehicle_access",
      "pet_safety",
      "weather_delays",
      "crew_arrival_windows",
      "payment_expectations",
      "lawn_nail_sweep",
      "cleanup_timeline",
    ];

    if (!validTypes.includes(expectationType)) {
      return NextResponse.json(
        { error: "Invalid expectation type" },
        { status: 400 }
      );
    }

    // Send expectation setting
    const result = await sendExpectationSetting({
      workspaceId,
      jobId,
      contactId,
      expectationType,
      sendTiming,
      metadata,
      channel,
    });

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || "Failed to send expectation setting" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      messageId: result.messageId,
    });
  } catch (error: any) {
    console.error("Error sending expectation setting:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}




































