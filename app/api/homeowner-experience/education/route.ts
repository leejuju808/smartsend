import { NextRequest, NextResponse } from "next/server";
import { sendEducationContent } from "@/lib/homeowner-experience/block25700-automation";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { workspaceId, jobId, contactId, educationTopic, sendTiming, channel } = body;

    // Validate required fields
    if (!workspaceId || !contactId || !educationTopic) {
      return NextResponse.json(
        { error: "Missing required fields: workspaceId, contactId, educationTopic" },
        { status: 400 }
      );
    }

    // Validate education topic
    const validTopics = [
      "roofing_process_overview",
      "tear_off_explained",
      "underlayment_explained",
      "ridge_vents_explained",
      "insurance_claims_explained",
      "ventilation_importance",
      "post_install_checklist",
      "warranty_coverage",
      "material_types",
      "timeline_expectations",
    ];

    if (!validTopics.includes(educationTopic)) {
      return NextResponse.json(
        { error: "Invalid education topic" },
        { status: 400 }
      );
    }

    // Send education content
    const result = await sendEducationContent({
      workspaceId,
      jobId,
      contactId,
      educationTopic,
      sendTiming,
      channel,
    });

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || "Failed to send education content" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      messageId: result.messageId,
    });
  } catch (error: any) {
    console.error("Error sending education content:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}




































