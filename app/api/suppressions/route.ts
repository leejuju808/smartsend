import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function GET(req: NextRequest) {
  const sb = createClient();
  const { data: user } = await sb.auth.getUser();
  if (!user.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  
  const { searchParams } = new URL(req.url);
  const scope = searchParams.get("scope") || "account";
  const accountId = searchParams.get("account_id");
  
  let query = sb
    .from("suppressions")
    .select("id,created_at,updated_at,scope,account_id,email,domain,provider,reason,notes,created_by")
    .order("created_at", { ascending: false })
    .limit(500);
  
  if (scope === "global") {
    query = query.eq("scope", "global");
  } else if (scope === "account") {
    query = query.eq("scope", "account");
    if (accountId) {
      query = query.eq("account_id", accountId);
    } else {
      // Get user's connected accounts
      const { data: accounts } = await sb
        .from("connected_accounts")
        .select("id")
        .eq("user_id", user.user.id);
      if (accounts && accounts.length > 0) {
        query = query.in("account_id", accounts.map(a => a.id));
      } else {
        return NextResponse.json({ data: [] });
      }
    }
  }
  
  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  
  return NextResponse.json({ data: data || [] });
}

export async function POST(req: NextRequest) {
  const sb = createClient();
  const { data: user } = await sb.auth.getUser();
  if (!user.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  
  const body = await req.json();
  const { email, domain, reason = "manual", provider = "gmail", account_id, scope = "account" } = body;
  
  if (!email && !domain) {
    return NextResponse.json({ error: "email or domain required" }, { status: 400 });
  }
  
  // Validate account_id belongs to user if scope is account
  if (scope === "account" && account_id) {
    const { data: account } = await sb
      .from("connected_accounts")
      .select("id")
      .eq("id", account_id)
      .eq("user_id", user.user.id)
      .maybeSingle();
    
    if (!account) {
      return NextResponse.json({ error: "account not found or unauthorized" }, { status: 403 });
    }
  }
  
  try {
    if (email) {
      const { error } = await sb.rpc("suppress_email", {
        p_scope: scope,
        p_account: account_id || null,
        p_email: email,
        p_provider: provider,
        p_reason: reason,
        p_notes: null
      });
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
    } else if (domain) {
      const { error } = await sb.rpc("suppress_domain", {
        p_scope: scope,
        p_account: account_id || null,
        p_domain: domain,
        p_provider: provider,
        p_reason: reason,
        p_notes: null
      });
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
    }
    
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to add suppression" },
      { status: 400 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  const sb = createClient();
  const { data: user } = await sb.auth.getUser();
  if (!user.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }
  
  // Verify user owns the suppression (via account ownership)
  const { data: suppression } = await sb
    .from("suppressions")
    .select("scope,account_id")
    .eq("id", id)
    .maybeSingle();
  
  if (!suppression) {
    return NextResponse.json({ error: "suppression not found" }, { status: 404 });
  }
  
  if (suppression.scope === "account" && suppression.account_id) {
    const { data: account } = await sb
      .from("connected_accounts")
      .select("id")
      .eq("id", suppression.account_id)
      .eq("user_id", user.user.id)
      .maybeSingle();
    
    if (!account) {
      return NextResponse.json({ error: "unauthorized" }, { status: 403 });
    }
  }
  
  const { error } = await sb.from("suppressions").delete().eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  
  return NextResponse.json({ ok: true });
}
