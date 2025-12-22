// Block 16800 — SmartSend Trials & Onboarding v2
// GET /api/onboarding/v2/checklist - Returns onboarding checklist status

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

  // Get onboarding progress
  const { data: progress, error } = await supabase
    .from("onboarding_progress")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error && error.code !== "PGRST116") {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!progress) {
    return NextResponse.json({
      checklist: {
        percent: 0,
        items: [
          { id: "company_setup", label: "Company setup", completed: false },
          { id: "email_connected", label: "Email connected", completed: false },
          { id: "import_list", label: "Import your list", completed: false },
          { id: "send_campaign", label: "Send your first campaign", completed: false },
          { id: "book_appointment", label: "Book an appointment", completed: false },
          { id: "complete_pipeline", label: "Complete your pipeline", completed: false },
        ],
      },
    });
  }

  const checklist = {
    percent: progress.checklist_percent || 0,
    items: [
      {
        id: "company_setup",
        label: "Company setup",
        completed: progress.step_1_company_setup || false,
      },
      {
        id: "email_connected",
        label: "Email connected",
        completed: progress.step_2_email_connected || false,
      },
      {
        id: "import_list",
        label: "Import your list",
        completed: progress.step_3_list_imported || false,
      },
      {
        id: "send_campaign",
        label: "Send your first campaign",
        completed: progress.step_4_campaign_sent || false,
      },
      {
        id: "book_appointment",
        label: "Book an appointment",
        completed: progress.step_5_inspection_booked || false,
      },
      {
        id: "complete_pipeline",
        label: "Complete your pipeline",
        completed: false, // This would be calculated from pipeline data
      },
    ],
  };

  return NextResponse.json({ checklist });
}





















































