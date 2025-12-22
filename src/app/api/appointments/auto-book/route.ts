import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";

/**
 * API route to trigger auto-booking when a reply with booking intent is detected
 * This is called from the reply detection flow
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await getServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const {
      message,
      lead_id,
      homeowner_name,
      address,
      homeowner_email,
      homeowner_phone,
    } = await req.json();

    if (!message) {
      return NextResponse.json(
        { error: "message is required" },
        { status: 400 }
      );
    }

    // Get the Supabase function URL
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl) {
      return NextResponse.json(
        { error: "Supabase URL not configured" },
        { status: 500 }
      );
    }

    // Call the auto-booking edge function
    const functionUrl = `${supabaseUrl}/functions/v1/autoBookAppointment`;
    const response = await fetch(functionUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${supabaseAnonKey}`,
        apikey: supabaseAnonKey || "",
      },
      body: JSON.stringify({
        user_id: user.id,
        message,
        lead_id: lead_id || null,
        homeowner_name: homeowner_name || null,
        address: address || null,
        homeowner_email: homeowner_email || null,
        homeowner_phone: homeowner_phone || null,
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      return NextResponse.json(result, { status: response.status });
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("Error in auto-book route:", error);
    return NextResponse.json(
      {
        booked: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}


























