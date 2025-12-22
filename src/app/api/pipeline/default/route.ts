import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function GET(_req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });

    // Get the current user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Get the user's profile to find their org
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("org_id")
      .eq("id", user.id)
      .single();

    if (profileError || !profile?.org_id) {
      return NextResponse.json(
        { error: "No organization found" },
        { status: 404 }
      );
    }

    // Get the default pipeline for the org
    const { data: pipeline, error: pipelineError } = await supabase
      .from("pipelines")
      .select("id, name")
      .eq("org_id", profile.org_id)
      .eq("name", "Default Pipeline")
      .single();

    if (pipelineError || !pipeline) {
      return NextResponse.json(
        { error: "Default pipeline not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(pipeline);
  } catch (error) {
    console.error("Unexpected error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
} 