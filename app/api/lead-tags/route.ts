// Block 20280 — Lead Tag Library API

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

async function getAccountIdFromUser(supabase: ReturnType<typeof createClient>, userId: string): Promise<string | null> {
  // Try to get account_id from account_members
  const { data: membership } = await supabase
    .from("account_members")
    .select("account_id")
    .eq("user_id", userId)
    .eq("is_active", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (membership?.account_id) {
    return membership.account_id;
  }

  // Try to get account_id from accounts table (owner)
  const { data: account } = await supabase
    .from("accounts")
    .select("id")
    .eq("owner_user_id", userId)
    .maybeSingle();

  if (account?.id) {
    return account.id;
  }

  // Fallback: use user_id as account_id (for single-user accounts)
  return userId;
}

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get account_id for the user
    const account_id = await getAccountIdFromUser(supabase, user.id);

    if (!account_id) {
      return NextResponse.json(
        { error: "Account not found" },
        { status: 404 }
      );
    }

    const { data, error } = await supabase
      .from("lead_tags")
      .select("id, label, color, category, is_active")
      .eq("account_id", account_id)
      .eq("is_active", true)
      .order("label", { ascending: true });

    if (error) {
      console.error("Lead tags fetch error", error);
      return NextResponse.json({ error: "Failed to load tags" }, { status: 500 });
    }

    return NextResponse.json({ tags: data || [] });
  } catch (error: any) {
    console.error("Error in GET /api/lead-tags:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { label, color, category } = body;

    if (!label || !label.trim()) {
      return NextResponse.json(
        { error: "label required" },
        { status: 400 }
      );
    }

    // Get account_id for the user
    const account_id = await getAccountIdFromUser(supabase, user.id);

    if (!account_id) {
      return NextResponse.json(
        { error: "Account not found" },
        { status: 404 }
      );
    }

    const { data, error } = await supabase
      .from("lead_tags")
      .insert({
        account_id,
        created_by_user_id: user.id,
        label: label.trim(),
        color: color || null,
        category: category || null,
      })
      .select()
      .single();

    if (error) {
      console.error("Lead tag insert error", error);
      return NextResponse.json(
        { error: "Failed to create tag" },
        { status: 500 }
      );
    }

    return NextResponse.json({ tag: data });
  } catch (error: any) {
    console.error("Error in POST /api/lead-tags:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}

















































