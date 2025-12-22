// Block 200000 — SmartSend Roofing Homeowner Portal Authentication API
// POST /api/portal/authenticate
// Authenticates homeowner portal access using PIN + last name

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const { portalCode, pinCode, lastName } = await req.json();

    if (!portalCode || !pinCode || !lastName) {
      return NextResponse.json(
        { error: "portalCode, pinCode, and lastName are required" },
        { status: 400 }
      );
    }

    // Get client IP and user agent
    const ipAddress = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || null;
    const userAgent = req.headers.get("user-agent") || null;

    // Authenticate via database function
    const { data, error } = await supabase.rpc("authenticate_portal_access", {
      p_portal_code: portalCode,
      p_pin_code: pinCode,
      p_last_name: lastName.trim(),
      p_ip_address: ipAddress,
      p_user_agent: userAgent,
    });

    if (error) {
      console.error("Portal authentication error:", error);
      return NextResponse.json(
        { error: error.message || "Authentication failed" },
        { status: 401 }
      );
    }

    if (!data || !data.success) {
      return NextResponse.json(
        { error: data?.error || "Invalid PIN or last name" },
        { status: 401 }
      );
    }

    // Set session token as HTTP-only cookie
    const response = NextResponse.json({
      success: true,
      sessionToken: data.session_token,
      portalId: data.portal_id,
      jobId: data.job_id,
      expiresAt: data.expires_at,
    });

    // Set cookie (24 hour expiration)
    response.cookies.set("portal_session", data.session_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24, // 24 hours
      path: "/",
    });

    return response;
  } catch (error: any) {
    console.error("Portal authentication error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}


























