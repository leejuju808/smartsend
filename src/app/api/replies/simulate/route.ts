// /app/api/replies/simulate/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

/**
 * POST /api/replies/simulate
 * Dev-only endpoint to simulate an inbound reply and trigger intent detection
 * 
 * Headers:
 *   x-ss-user-id: (optional) override user ID for testing
 * 
 * Body:
 *   {
 *     "sender": "lead@example.com",
 *     "subject": "Yes let us book this week",
 *     "bodyText": "Sounds good—this Thursday afternoon works. Send me a link."
 *   }
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    
    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    // Allow override for testing
    const userIdOverride = req.headers.get("x-ss-user-id");
    const userId = userIdOverride || user?.id;
    
    if (!userId) {
      return NextResponse.json(
        { error: "Unauthorized - no user ID provided" },
        { status: 401 }
      );
    }

    const body = await req.json();
    const { sender, subject, bodyText, threadId, messageId } = body;

    if (!sender || !bodyText) {
      return NextResponse.json(
        { error: "Missing required fields: sender, bodyText" },
        { status: 400 }
      );
    }

    // Get Supabase URL and anon key for the function call
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      return NextResponse.json(
        { error: "Supabase configuration missing" },
        { status: 500 }
      );
    }

    // Call the Supabase Edge Function
    const functionUrl = `${supabaseUrl}/functions/v1/reply-intent-detector`;
    
    const response = await fetch(functionUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${supabaseAnonKey}`,
      },
      body: JSON.stringify({
        messageId: messageId || `sim_${Date.now()}`,
        sender,
        subject: subject || "Test Reply",
        bodyText,
        userId,
        threadId: threadId || `thread_${Date.now()}`,
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      return NextResponse.json(
        { 
          ok: false, 
          error: result.error || "Edge function failed",
          details: result 
        },
        { status: response.status }
      );
    }

    // Return success with nested data
    return NextResponse.json({
      ok: true,
      message: "Reply processed successfully",
      data: {
        status: result.status,
        intent: result.intent,
        calendly_link: result.calendly_link,
        meeting_id: result.meeting_id,
      },
      raw: result,
    });

  } catch (err: any) {
    console.error("Error in simulate endpoint:", err);
    return NextResponse.json(
      { 
        ok: false, 
        error: err.message,
        details: err.toString() 
      },
      { status: 500 }
    );
  }
}
