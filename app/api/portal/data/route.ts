// Block 200000 — SmartSend Roofing Homeowner Portal Data API
// GET /api/portal/data
// Returns all portal data for authenticated session

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: NextRequest) {
  try {
    // Get session token from cookie or Authorization header
    const cookieStore = await cookies();
    const sessionToken = 
      cookieStore.get("portal_session")?.value ||
      req.headers.get("authorization")?.replace("Bearer ", "");

    if (!sessionToken) {
      return NextResponse.json(
        { error: "No session token provided" },
        { status: 401 }
      );
    }

    // Get portal data via database function
    const { data, error } = await supabase.rpc("get_portal_data", {
      p_session_token: sessionToken,
    });

    if (error) {
      console.error("Portal data fetch error:", error);
      return NextResponse.json(
        { error: error.message || "Failed to fetch portal data" },
        { status: 500 }
      );
    }

    if (data?.error) {
      return NextResponse.json(
        { error: data.error },
        { status: 401 }
      );
    }

    return NextResponse.json(data);
  } catch (error: any) {
    console.error("Portal data fetch error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}


























