// Block 20160 — Inbox Settings API (Account-Level)

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireUserAndAccount } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  try {
    const supabase = createClient();
    const { account } = await requireUserAndAccount(supabase);

    const { data, error } = await supabase
      .from("inbox_settings")
      .select("*")
      .eq("account_id", account.id)
      .maybeSingle();

    if (error) {
      console.error("Inbox settings fetch error", error);
      return NextResponse.json({ error: "Failed to load settings" }, { status: 500 });
    }

    // Fallback defaults if not created yet
    if (!data) {
      return NextResponse.json({
        settings: {
          account_id: account.id,
          business_timezone: "America/Los_Angeles",
          business_hours_start: "08:00:00",
          business_hours_end: "17:00:00",
          hot_sla_hours: 4,
          warm_sla_hours: 24,
          default_follow_up_days_small: 1,
          default_follow_up_days_medium: 3,
          default_follow_up_days_long: 7,
          email_signature: "",
        },
      });
    }

    return NextResponse.json({ settings: data });
  } catch (error: any) {
    console.error("Error in inbox settings API:", error);
    if (error.status) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient();
    const { account } = await requireUserAndAccount(supabase);

    const body = await request.json();
    const patch: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };

    // Only include fields that are provided
    if (body.business_timezone !== undefined) patch.business_timezone = body.business_timezone;
    if (body.business_hours_start !== undefined) patch.business_hours_start = body.business_hours_start;
    if (body.business_hours_end !== undefined) patch.business_hours_end = body.business_hours_end;
    if (body.hot_sla_hours !== undefined) patch.hot_sla_hours = body.hot_sla_hours;
    if (body.warm_sla_hours !== undefined) patch.warm_sla_hours = body.warm_sla_hours;
    if (body.default_follow_up_days_small !== undefined) patch.default_follow_up_days_small = body.default_follow_up_days_small;
    if (body.default_follow_up_days_medium !== undefined) patch.default_follow_up_days_medium = body.default_follow_up_days_medium;
    if (body.default_follow_up_days_long !== undefined) patch.default_follow_up_days_long = body.default_follow_up_days_long;
    if (body.email_signature !== undefined) patch.email_signature = body.email_signature;

    const { data, error } = await supabase
      .from("inbox_settings")
      .upsert(
        {
          account_id: account.id,
          ...patch,
        },
        { onConflict: "account_id" }
      )
      .select()
      .single();

    if (error) {
      console.error("Inbox settings upsert error", error);
      return NextResponse.json({ error: "Failed to save settings" }, { status: 500 });
    }

    return NextResponse.json({ settings: data });
  } catch (error: any) {
    console.error("Error in inbox settings update API:", error);
    if (error.status) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}

















































