// Block 16800 — SmartSend Trials & Onboarding v2
// GET /api/onboarding/v2/progress - Returns current onboarding progress
// POST /api/onboarding/v2/progress - Update onboarding progress

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Get or create onboarding progress
  let { data: progress, error } = await supabase
    .from("onboarding_progress")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error && error.code !== "PGRST116") {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // If no progress exists, create it
  if (!progress) {
    // Try to get account_id from billing_accounts or workspace
    let accountId: string | null = null;
    
    const { data: billingAccount } = await supabase
      .from("billing_accounts")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();
    
    if (billingAccount) {
      accountId = billingAccount.id;
    } else {
      // Try workspace
      const { data: membership } = await supabase
        .from("workspace_members")
        .select("workspace_id")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      
      if (membership) {
        accountId = membership.workspace_id;
      }
    }

    const { data: newProgress, error: createError } = await supabase
      .from("onboarding_progress")
      .insert({
        user_id: user.id,
        account_id: accountId,
        current_step: 1,
      })
      .select()
      .single();

    if (createError) {
      return NextResponse.json({ error: createError.message }, { status: 500 });
    }

    progress = newProgress;
  }

  return NextResponse.json({ progress });
}

export async function POST(req: Request) {
  const supabase = createClient();
  const body = await req.json();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const {
    step,
    stepData,
    win,
  } = body as {
    step?: number;
    stepData?: {
      step_1_company_setup?: boolean;
      step_2_email_connected?: boolean;
      step_3_list_imported?: boolean;
      step_4_campaign_sent?: boolean;
      step_5_inspection_booked?: boolean;
      company_name?: string;
      company_city?: string;
      service_areas?: string[];
      logo_url?: string;
      owner_name?: string;
    };
    win?: "win_1_email_connected" | "win_2_list_imported" | "win_3_campaign_sent" | "win_4_email_opened" | "win_5_first_reply" | "win_6_first_booking";
  };

  // Get existing progress
  const { data: existingProgress } = await supabase
    .from("onboarding_progress")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  const updateData: any = {};

  if (step !== undefined) {
    updateData.current_step = step;
  }

  if (stepData) {
    Object.assign(updateData, stepData);
  }

  if (win) {
    updateData[win] = true;
    
    // Also record milestone
    await supabase.from("milestones").upsert({
      user_id: user.id,
      account_id: existingProgress?.account_id,
      milestone_type: win,
      achieved_at: new Date().toISOString(),
    }, {
      onConflict: "user_id,milestone_type",
    });

    // Record trial event
    const eventTypeMap: Record<string, string> = {
      win_1_email_connected: "email_connected",
      win_2_list_imported: "list_imported",
      win_3_campaign_sent: "campaign_sent",
      win_4_email_opened: "email_opened",
      win_5_first_reply: "email_replied",
      win_6_first_booking: "inspection_booked",
    };

    await supabase.from("trial_events").insert({
      user_id: user.id,
      account_id: existingProgress?.account_id,
      event_type: eventTypeMap[win] || "first_48h_win",
      event_data: { milestone: win },
    });
  }

  // Upsert progress
  const { data: progress, error } = await supabase
    .from("onboarding_progress")
    .upsert({
      user_id: user.id,
      account_id: existingProgress?.account_id,
      ...updateData,
    }, {
      onConflict: "user_id",
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ progress });
}





















































