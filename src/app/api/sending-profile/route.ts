import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function GET(req: NextRequest) {
  const supabase = createRouteHandlerClient({ cookies });
  
  // Get authenticated user
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const accountId = url.searchParams.get("account");
  if (!accountId) {
    return NextResponse.json({ error: "account parameter required" }, { status: 400 });
  }

  try {
    // Verify user owns this account
    const { data: account, error: accErr } = await supabase
      .from("connected_accounts")
      .select("id, user_id")
      .eq("id", accountId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (accErr || !account) {
      return NextResponse.json({ error: "Account not found or access denied" }, { status: 404 });
    }

    // Get profile
    const { data: prof, error: profErr } = await supabase
      .from("account_sending_profiles")
      .select("*")
      .eq("account_id", accountId)
      .maybeSingle();

    if (profErr) {
      return NextResponse.json({ error: profErr.message }, { status: 500 });
    }

    // Get remaining daily sends
    const { data: remain, error: remainErr } = await supabase.rpc("account_daily_remaining", {
      p_account: accountId
    });

    // Get throttle free time
    const { data: frees, error: freesErr } = await supabase.rpc("account_throttle_frees_at", {
      p_account: accountId
    });

    return NextResponse.json({
      profile: prof,
      remaining: remain || 0,
      frees_at: frees || null
    });
  } catch (error: any) {
    console.error("Error fetching sending profile:", error);
    return NextResponse.json({ error: error.message || "Server error" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const supabase = createRouteHandlerClient({ cookies });
  
  // Get authenticated user
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { account_id, ...updates } = body;

    if (!account_id) {
      return NextResponse.json({ error: "account_id required" }, { status: 400 });
    }

    // Verify user owns this account
    const { data: account, error: accErr } = await supabase
      .from("connected_accounts")
      .select("id, user_id")
      .eq("id", account_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (accErr || !account) {
      return NextResponse.json({ error: "Account not found or access denied" }, { status: 404 });
    }

    // Update profile
    const { data: prof, error: profErr } = await supabase
      .from("account_sending_profiles")
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq("account_id", account_id)
      .select()
      .single();

    if (profErr) {
      // If profile doesn't exist, create it
      if (profErr.code === "PGRST116") {
        const { data: newProf, error: createErr } = await supabase
          .from("account_sending_profiles")
          .insert({
            account_id,
            ...updates
          })
          .select()
          .single();

        if (createErr) {
          return NextResponse.json({ error: createErr.message }, { status: 500 });
        }

        return NextResponse.json({ profile: newProf });
      }

      return NextResponse.json({ error: profErr.message }, { status: 500 });
    }

    return NextResponse.json({ profile: prof });
  } catch (error: any) {
    console.error("Error updating sending profile:", error);
    return NextResponse.json({ error: error.message || "Server error" }, { status: 500 });
  }
}

