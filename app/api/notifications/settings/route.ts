// app/api/notifications/settings/route.ts
// Block 9700 — SMS Notification Settings API

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { normalizePhoneNumber } from "@/lib/providers/sms";

export async function GET(req: NextRequest) {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { error: "Not authenticated" },
      { status: 401 }
    );
  }

  const { data, error } = await supabase
    .from("notification_settings")
    .select("*")
    .eq("account_id", user.id)
    .maybeSingle();

  if (error) {
    console.error("Error fetching notification settings:", error);
    return NextResponse.json(
      { error: "Failed to fetch settings" },
      { status: 500 }
    );
  }

  // Return defaults if no settings exist
  if (!data) {
    return NextResponse.json(
      {
        owner_name: null,
        owner_email: null,
        owner_phone: null,
        sms_enabled: false,
        sms_hot_leads: true,
        sms_warm_leads: false,
        sms_estimate_scheduled: false,
        sms_won_jobs: true,
        quiet_hours_start: null,
        quiet_hours_end: null,
      },
      { status: 200 }
    );
  }

  return NextResponse.json(
    {
      owner_name: data.owner_name,
      owner_email: data.owner_email,
      owner_phone: data.owner_phone,
      sms_enabled: data.sms_enabled,
      sms_hot_leads: data.sms_hot_leads,
      sms_warm_leads: data.sms_warm_leads,
      sms_estimate_scheduled: data.sms_estimate_scheduled,
      sms_won_jobs: data.sms_won_jobs,
      quiet_hours_start: data.quiet_hours_start,
      quiet_hours_end: data.quiet_hours_end,
    },
    { status: 200 }
  );
}

export async function POST(req: NextRequest) {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { error: "Not authenticated" },
      { status: 401 }
    );
  }

  let body: {
    owner_name?: string;
    owner_email?: string;
    owner_phone?: string;
    sms_enabled?: boolean;
    sms_hot_leads?: boolean;
    sms_warm_leads?: boolean;
    sms_estimate_scheduled?: boolean;
    sms_won_jobs?: boolean;
    quiet_hours_start?: string | null;
    quiet_hours_end?: string | null;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON" },
      { status: 400 }
    );
  }

  // Validate phone number format if provided
  let normalizedPhone: string | null = null;
  if (body.owner_phone) {
    normalizedPhone = normalizePhoneNumber(body.owner_phone);
    if (!normalizedPhone) {
      return NextResponse.json(
        { error: "Invalid phone number format. Please use E.164 format (e.g., +15551234567)" },
        { status: 400 }
      );
    }
  }

  // Validate quiet hours format (HH:MM)
  const timeRegex = /^([0-1][0-9]|2[0-3]):[0-5][0-9]$/;
  if (body.quiet_hours_start && !timeRegex.test(body.quiet_hours_start)) {
    return NextResponse.json(
      { error: "Invalid quiet_hours_start format. Use HH:MM (e.g., 21:00)" },
      { status: 400 }
    );
  }
  if (body.quiet_hours_end && !timeRegex.test(body.quiet_hours_end)) {
    return NextResponse.json(
      { error: "Invalid quiet_hours_end format. Use HH:MM (e.g., 07:00)" },
      { status: 400 }
    );
  }

  // Build payload
  const payload: any = {
    account_id: user.id,
    updated_at: new Date().toISOString(),
  };

  if (body.owner_name !== undefined) payload.owner_name = body.owner_name || null;
  if (body.owner_email !== undefined) payload.owner_email = body.owner_email || null;
  if (body.owner_phone !== undefined) payload.owner_phone = normalizedPhone || null;
  if (body.sms_enabled !== undefined) payload.sms_enabled = body.sms_enabled;
  if (body.sms_hot_leads !== undefined) payload.sms_hot_leads = body.sms_hot_leads;
  if (body.sms_warm_leads !== undefined) payload.sms_warm_leads = body.sms_warm_leads;
  if (body.sms_estimate_scheduled !== undefined)
    payload.sms_estimate_scheduled = body.sms_estimate_scheduled;
  if (body.sms_won_jobs !== undefined) payload.sms_won_jobs = body.sms_won_jobs;
  if (body.quiet_hours_start !== undefined)
    payload.quiet_hours_start = body.quiet_hours_start || null;
  if (body.quiet_hours_end !== undefined)
    payload.quiet_hours_end = body.quiet_hours_end || null;

  // Check if settings exist
  const { data: existing } = await supabase
    .from("notification_settings")
    .select("id")
    .eq("account_id", user.id)
    .maybeSingle();

  let result;
  if (existing?.id) {
    result = await supabase
      .from("notification_settings")
      .update(payload)
      .eq("id", existing.id)
      .select()
      .single();
  } else {
    result = await supabase
      .from("notification_settings")
      .insert(payload)
      .select()
      .single();
  }

  if (result.error) {
    console.error("Error saving notification settings:", result.error);
    return NextResponse.json(
      { error: "Failed to save settings" },
      { status: 500 }
    );
  }

  return NextResponse.json(
    {
      owner_name: result.data.owner_name,
      owner_email: result.data.owner_email,
      owner_phone: result.data.owner_phone,
      sms_enabled: result.data.sms_enabled,
      sms_hot_leads: result.data.sms_hot_leads,
      sms_warm_leads: result.data.sms_warm_leads,
      sms_estimate_scheduled: result.data.sms_estimate_scheduled,
      sms_won_jobs: result.data.sms_won_jobs,
      quiet_hours_start: result.data.quiet_hours_start,
      quiet_hours_end: result.data.quiet_hours_end,
    },
    { status: 200 }
  );
}
























































