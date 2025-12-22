import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const campaignId = params.id;
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status") || "pending";

    const { data: recommendations, error } = await supabase
      .from("copilot_recommendations")
      .select("*")
      .eq("campaign_id", campaignId)
      .eq("status", status)
      .order("priority", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json(
        { error: "Failed to fetch recommendations" },
        { status: 500 }
      );
    }

    return NextResponse.json({ recommendations: recommendations || [] });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const campaignId = params.id;
    const body = await req.json();
    const { recommendation_id, action } = body; // action: "apply" | "dismiss" | "ignore"

    if (!recommendation_id || !action) {
      return NextResponse.json(
        { error: "Missing recommendation_id or action" },
        { status: 400 }
      );
    }

    const updateData: any = {
      status: action === "apply" ? "applied" : action === "dismiss" ? "dismissed" : "ignored",
    };

    if (action === "apply") {
      updateData.applied_at = new Date().toISOString();
      updateData.applied_by = user.id;
    }

    const { data: updated, error } = await supabase
      .from("copilot_recommendations")
      .update(updateData)
      .eq("id", recommendation_id)
      .eq("campaign_id", campaignId)
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { error: "Failed to update recommendation" },
        { status: 500 }
      );
    }

    return NextResponse.json({ recommendation: updated });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}



