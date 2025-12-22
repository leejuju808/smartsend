import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { sequence, goal, tone, campaignId } = body;

    if (!sequence || !Array.isArray(sequence) || sequence.length === 0) {
      return NextResponse.json(
        { error: "sequence is required and must be a non-empty array" },
        { status: 400 }
      );
    }

    // Verify authentication
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // If campaignId is provided, verify ownership
    if (campaignId) {
      const { data: campaign, error: campaignError } = await supabase
        .from("campaigns")
        .select("id, user_id")
        .eq("id", campaignId)
        .single();

      if (campaignError || !campaign) {
        return NextResponse.json(
          { error: "Campaign not found" },
          { status: 404 }
        );
      }

      // Check if user owns the campaign or has access via workspace
      const { data: workspaceMember } = await supabase
        .from("workspace_members")
        .select("workspace_id")
        .eq("user_id", user.id)
        .single();

      if (campaign.user_id !== user.id && !workspaceMember) {
        return NextResponse.json(
          { error: "Access denied" },
          { status: 403 }
        );
      }
    }

    // Call the Supabase Edge Function
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 }
      );
    }

    const resp = await fetch(
      `${supabaseUrl}/functions/v1/ai-sequence-optimizer`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${supabaseServiceKey}`,
        },
        body: JSON.stringify({ sequence, goal, tone }),
      }
    );

    if (!resp.ok) {
      const errorData = await resp.json().catch(() => ({ error: "Unknown error" }));
      return NextResponse.json(
        { error: errorData.error || "Failed to optimize sequence" },
        { status: resp.status }
      );
    }

    const data = await resp.json();
    return NextResponse.json(data);
  } catch (error: any) {
    console.error("Sequence optimize error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}



