// Block 28844 — Quote Revival Engine API
// GET /api/quotes/revival/rules - Get price drop rules
// POST /api/quotes/revival/rules - Update price drop rules

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

export async function GET(req: NextRequest) {
  try {
    const cookieStore = await cookies();
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser(
      cookieStore.get("sb-access-token")?.value || ""
    );

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const workspaceId = searchParams.get("workspace_id");

    if (!workspaceId) {
      return NextResponse.json(
        { error: "workspace_id query parameter required" },
        { status: 400 }
      );
    }

    // Verify user has access to workspace
    const { data: membership } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", workspaceId)
      .eq("user_id", user.id)
      .single();

    if (!membership) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    // Get price drop rules for workspace
    const { data: rules, error: rulesError } = await supabase
      .from("price_drop_rules")
      .select("*")
      .eq("workspace_id", workspaceId)
      .maybeSingle();

    if (rulesError) {
      console.error("Error fetching price drop rules:", rulesError);
      return NextResponse.json({ error: rulesError.message }, { status: 500 });
    }

    // Return default if no rules exist
    return NextResponse.json(rules || {
      enable_discounts: false,
      discount_type: null,
      discount_value: 0,
      monthly_limit: 5,
      used_this_month: 0,
    });
  } catch (error: any) {
    console.error("Unexpected error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const cookieStore = await cookies();
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser(
      cookieStore.get("sb-access-token")?.value || ""
    );

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const {
      workspace_id,
      enable_discounts,
      discount_type,
      discount_value,
      monthly_limit,
    } = body;

    if (!workspace_id) {
      return NextResponse.json(
        { error: "workspace_id is required" },
        { status: 400 }
      );
    }

    // Verify user has access to workspace
    const { data: membership } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", workspace_id)
      .eq("user_id", user.id)
      .single();

    if (!membership) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    // Get user's profile ID
    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .eq("id", user.id)
      .single();

    if (!profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    // Upsert price drop rules
    const { data: rules, error: rulesError } = await supabase
      .from("price_drop_rules")
      .upsert({
        contractor_id: user.id,
        workspace_id,
        enable_discounts: enable_discounts ?? false,
        discount_type: discount_type || null,
        discount_value: discount_value || 0,
        monthly_limit: monthly_limit || 5,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: "contractor_id",
      })
      .select()
      .single();

    if (rulesError) {
      console.error("Error updating price drop rules:", rulesError);
      return NextResponse.json({ error: rulesError.message }, { status: 500 });
    }

    return NextResponse.json(rules);
  } catch (error: any) {
    console.error("Unexpected error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}


































