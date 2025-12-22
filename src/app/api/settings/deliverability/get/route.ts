import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/server/supabase";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type");
    const userId = searchParams.get("user_id");

    if (!userId) {
      return NextResponse.json({ error: "User ID required" }, { status: 400 });
    }

    switch (type) {
      case "mailboxes":
        const { data: mailboxes, error: mailboxesError } = await supabaseAdmin
          .from("mailboxes")
          .select("*")
          .eq("user_id", userId)
          .eq("is_active", true)
          .order("created_at", { ascending: true });

        if (mailboxesError) {
          console.error("Error fetching mailboxes:", mailboxesError);
          return NextResponse.json({ error: "Failed to fetch mailboxes" }, { status: 500 });
        }

        return NextResponse.json({ mailboxes: mailboxes || [] });

      case "domain_caps":
        const { data: domainCaps, error: domainCapsError } = await supabaseAdmin
          .from("domain_daily_caps")
          .select("domain, daily_cap")
          .eq("user_id", userId)
          .order("domain", { ascending: true });

        if (domainCapsError) {
          console.error("Error fetching domain caps:", domainCapsError);
          return NextResponse.json({ error: "Failed to fetch domain caps" }, { status: 500 });
        }

        return NextResponse.json({ domain_caps: domainCaps || [] });

      case "settings":
        const { data: settings, error: settingsError } = await supabaseAdmin
          .from("deliverability_settings")
          .select("*")
          .eq("user_id", userId)
          .single();

        if (settingsError && settingsError.code !== "PGRST116") {
          console.error("Error fetching deliverability settings:", settingsError);
          return NextResponse.json({ error: "Failed to fetch settings" }, { status: 500 });
        }

        // Return default settings if none exist
        const defaultSettings = {
          default_domain_cap: 20,
          send_window_start: "09:00:00",
          send_window_end: "17:00:00",
          timezone: "UTC"
        };

        return NextResponse.json({ 
          settings: settings || defaultSettings 
        });

      default:
        return NextResponse.json({ error: "Invalid type parameter" }, { status: 400 });
    }
  } catch (error) {
    console.error("Error in deliverability settings GET:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
} 