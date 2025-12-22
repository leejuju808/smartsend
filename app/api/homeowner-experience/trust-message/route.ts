import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { sendTrustMessage } from "@/lib/homeowner-experience/block25700-automation";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { workspaceId, jobId, contactId, trustMessageType, sendTiming, channel } = body;

    // Validate required fields
    if (!workspaceId || !contactId || !trustMessageType) {
      return NextResponse.json(
        { error: "Missing required fields: workspaceId, contactId, trustMessageType" },
        { status: 400 }
      );
    }

    // Validate trust message type
    const validTypes = [
      "tarp_landscaping",
      "magnet_nail_collection",
      "certified_suppliers",
      "warranty_registered",
      "certified_professionals",
      "cleanup_guarantee",
      "insurance_expertise",
      "lifetime_warranty",
    ];

    if (!validTypes.includes(trustMessageType)) {
      return NextResponse.json(
        { error: "Invalid trust message type" },
        { status: 400 }
      );
    }

    // Send trust message
    const result = await sendTrustMessage({
      workspaceId,
      jobId,
      contactId,
      trustMessageType,
      sendTiming,
      channel,
    });

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || "Failed to send trust message" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      messageId: result.messageId,
    });
  } catch (error: any) {
    console.error("Error sending trust message:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}




































