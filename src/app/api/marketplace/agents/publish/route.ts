import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * POST /api/marketplace/agents/publish
 * Publish an AI agent/template to the AgentCloud marketplace
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, description, body: templateBody, category, price, org_id, user_id } = body;

    if (!name || !templateBody || !category) {
      return NextResponse.json(
        { error: "Missing required fields: name, body, category" },
        { status: 400 }
      );
    }

    if (!user_id) {
      return NextResponse.json(
        { error: "User authentication required" },
        { status: 401 }
      );
    }

    // Get user's profile to link creator
    const { data: profile, error: profileError } = await sb
      .from("profiles")
      .select("id, org_id")
      .eq("id", user_id)
      .single();

    if (profileError || !profile) {
      return NextResponse.json(
        { error: "User profile not found" },
        { status: 404 }
      );
    }

    // Use provided org_id or fallback to user's org_id
    const final_org_id = org_id || profile.org_id;

    // Insert marketplace agent
    const { data: agent, error: insertError } = await sb
      .from("marketplace_agents")
      .insert({
        creator_id: user_id,
        org_id: final_org_id,
        name,
        description,
        template_body: templateBody,
        category,
        price: price || 0,
        visibility: "public",
      })
      .select()
      .single();

    if (insertError) {
      console.error("Error inserting agent:", insertError);
      return NextResponse.json(
        { error: "Failed to publish agent", details: insertError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ 
      success: true, 
      agent 
    });
  } catch (error: any) {
    console.error("Publish agent error:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}

