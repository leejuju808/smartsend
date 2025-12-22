import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function POST(req: Request) {
  try {
    const { step } = await req.json();
    
    if (!step || !['import_leads', 'create_campaign', 'send_first'].includes(step)) {
      return NextResponse.json({ error: "Invalid step" }, { status: 400 });
    }

    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get org_id from profiles
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("org_id")
      .eq("id", user.id)
      .single();

    if (profileError || !profile?.org_id) {
      return NextResponse.json({ error: "Organization not found" }, { status: 400 });
    }

    // Upsert the onboarding progress
    const { error: upsertError } = await supabase
      .from("onboarding_progress")
      .upsert(
        {
          user_id: user.id,
          org_id: profile.org_id,
          step,
          completed: true,
        },
        {
          onConflict: "user_id,step",
        }
      );

    if (upsertError) {
      console.error("Failed to update onboarding progress:", upsertError);
      return NextResponse.json({ error: "Failed to update progress" }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error("Error in onboarding complete:", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}
