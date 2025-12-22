// Block 140000 — SmartSend Roofing Website Widget
// API: Get widget settings for a company
// GET /api/widget/widget-settings?company_id=...

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const companyId = searchParams.get("company_id");

    if (!companyId) {
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

    // Get widget settings
    const { data: settings, error: settingsError } = await supabase
      .from("widget_settings")
      .select("*")
      .eq("roofing_company_id", companyId)
      .single();

    // If no settings exist, return defaults
    if (settingsError || !settings) {
      return NextResponse.json({
        primary_color: "#F97316",
        welcome_message: "Hey! Need help with your roof?",
        prompt_title: "Tell us what's going on with your roof:",
        enabled: true,
      });
    }

    return NextResponse.json({
      primary_color: settings.primary_color || "#F97316",
      welcome_message: settings.welcome_message || "Hey! Need help with your roof?",
      prompt_title: settings.prompt_title || "Tell us what's going on with your roof:",
      enabled: settings.enabled !== false,
    });
  } catch (error: any) {
    console.error("Error in /api/widget/widget-settings:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}


























