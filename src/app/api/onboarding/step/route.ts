import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function GET() {
  const supabase = createRouteHandlerClient({ cookies });
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("onboarding_state")
    .select("*")
    .eq("user_id", user.id)
    .single();

  if (error && error.code !== "PGRST116") {
    // PGRST116 is "not found" - that's ok, user hasn't started onboarding
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    step: data?.step || "start",
    completed: data?.completed || false,
    meta: data?.meta || {},
  });
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { step, meta } = await req.json();

    if (!step) {
      return NextResponse.json({ error: "step is required" }, { status: 400 });
    }

    const validSteps = [
      "start",
      "workspace",
      "email_connect",
      "import_leads",
      "create_segment",
      "create_smartlist",
      "create_campaign",
      "review",
      "complete",
    ];

    if (!validSteps.includes(step)) {
      return NextResponse.json({ error: "Invalid step" }, { status: 400 });
    }

    const completed = step === "complete";

    const { error: upsertError } = await supabase
      .from("onboarding_state")
      .upsert(
        {
          account_id: user.id, // Using user.id as account_id for now
          user_id: user.id,
          step,
          meta: meta || {},
          completed,
        },
        {
          onConflict: "user_id",
        }
      );

    if (upsertError) {
      console.error("Error updating onboarding step:", upsertError);
      return NextResponse.json(
        { error: upsertError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, step, completed });
  } catch (error: any) {
    console.error("Error in onboarding step update:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}












