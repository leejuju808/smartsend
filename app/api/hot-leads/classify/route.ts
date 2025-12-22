// app/api/hot-leads/classify/route.ts
// Block 97000 — Classify Lead Reply API
// Triggers the classifyLeadReply edge function
// Block 120000 — Sends push notifications for hot leads

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendHotLeadNotification } from "@/lib/mobile/pushNotifications";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const FUNCTIONS_BASE_URL = process.env.NEXT_PUBLIC_SUPABASE_FUNCTIONS_URL 
  ?? `${SUPABASE_URL}/functions/v1`;

export async function POST(req: NextRequest) {
  const supabase = createClient();
  
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

  try {
    const { message_id, message, lead_id, workspace_id } = await req.json();

    if (!message_id || !message) {
      return NextResponse.json(
        { error: "Missing required fields: message_id, message" },
        { status: 400 }
      );
    }

    // Call the edge function
    const response = await fetch(`${FUNCTIONS_BASE_URL}/classifyLeadReply`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({
        user_id: user.id,
        message_id,
        message,
        lead_id: lead_id || null,
        workspace_id: workspace_id || null,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Edge function error:", errorText);
      return NextResponse.json(
        { error: "Classification failed", details: errorText },
        { status: response.status }
      );
    }

    const result = await response.json();

    // Block 120000 — Send push notification if lead is HOT
    if (result.intent === 'hot' && lead_id) {
      // Send push notification asynchronously (don't wait for it)
      sendHotLeadNotification(user.id, lead_id, message).catch((error) => {
        console.error('Failed to send hot lead push notification:', error);
        // Don't fail the request if notification fails
      });
    }

    return NextResponse.json(result);
  } catch (error: any) {
    console.error("Classify error:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}
