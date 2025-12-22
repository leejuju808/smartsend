// Block 140000 — SmartSend Roofing Website Widget
// API: Create or get webchat session
// POST /api/widget/session

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "crypto";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function POST(req: NextRequest) {
  try {
    const { company_id } = await req.json();

    if (!company_id) {
      return NextResponse.json(
        { error: "company_id is required" },
        { status: 400 }
      );
    }

    if (!supabaseServiceKey) {
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
    });

    // Verify company exists and widget is enabled
    const { data: company, error: companyError } = await supabase
      .from("roofing_companies")
      .select("id, workspace_id")
      .eq("id", company_id)
      .single();

    if (companyError || !company) {
      return NextResponse.json(
        { error: "Company not found" },
        { status: 404 }
      );
    }

    // Check widget settings
    const { data: settings } = await supabase
      .from("widget_settings")
      .select("enabled")
      .eq("roofing_company_id", company_id)
      .single();

    // If settings don't exist, create default
    if (!settings) {
      await supabase.from("widget_settings").insert({
        roofing_company_id: company_id,
        enabled: true,
      });
    } else if (!settings.enabled) {
      return NextResponse.json(
        { error: "Widget is disabled for this company" },
        { status: 403 }
      );
    }

    // Generate unique session token
    const sessionToken = randomBytes(32).toString("hex");

    // Create session
    const { data: session, error: sessionError } = await supabase
      .from("webchat_sessions")
      .insert({
        roofing_company_id: company_id,
        session_token: sessionToken,
        step: 1,
        collected_data: {},
      })
      .select()
      .single();

    if (sessionError) {
      console.error("Failed to create session:", sessionError);
      return NextResponse.json(
        { error: "Failed to create session" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      session_token: sessionToken,
      step: session.step,
      messages: [], // No existing messages for new session
    });
  } catch (error: any) {
    console.error("Error in /api/widget/session:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

// GET: Retrieve existing session by token
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const sessionToken = searchParams.get("token");

    if (!sessionToken) {
      return NextResponse.json(
        { error: "token is required" },
        { status: 400 }
      );
    }

    if (!supabaseServiceKey) {
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
    });

    // Get session
    const { data: session, error: sessionError } = await supabase
      .from("webchat_sessions")
      .select("*")
      .eq("session_token", sessionToken)
      .single();

    if (sessionError || !session) {
      return NextResponse.json(
        { error: "Session not found" },
        { status: 404 }
      );
    }

    // Get messages
    const { data: messages, error: messagesError } = await supabase
      .from("webchat_messages")
      .select("*")
      .eq("session_id", session.id)
      .order("created_at", { ascending: true });

    return NextResponse.json({
      session_token: sessionToken,
      step: session.step,
      messages:
        messages?.map((m) => ({
          id: m.id,
          sender: m.sender,
          message: m.message,
          createdAt: m.created_at,
        })) || [],
    });
  } catch (error: any) {
    console.error("Error in GET /api/widget/session:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}


























