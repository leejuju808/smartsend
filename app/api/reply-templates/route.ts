// Block 20240 — Reply Templates API
// List + Create/Update Templates

import type { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Helper to get account_id from authenticated user
async function getAccountId(supabase: ReturnType<typeof createClient>): Promise<string | null> {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return null;
  }

  // Get account_id from account_members
  const { data: membership } = await supabase
    .from("account_members")
    .select("account_id")
    .eq("user_id", user.id)
    .or("is_active.is.null,is_active.eq.true")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  return membership?.account_id || null;
}

export async function GET(req: NextRequest) {
  const supabase = createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const account_id = await getAccountId(supabase);

  if (!account_id) {
    // For v1, use mock account as fallback (as per spec)
    // TODO: replace with real auth
    const mockAccountId = "00000000-0000-0000-0000-000000000000";
    
    const { data, error } = await supabase
      .from("reply_templates")
      .select("id, name, category, subject_template, body_template, is_active")
      .eq("account_id", mockAccountId)
      .eq("is_active", true)
      .order("name", { ascending: true });

    if (error) {
      console.error("Reply templates fetch error", error);
      return Response.json({ error: "Failed to load templates" }, { status: 500 });
    }

    return Response.json({ templates: data || [] });
  }

  // Set account context for RLS
  await supabase.rpc("set_account", { p_account_id: account_id });

  const { data, error } = await supabase
    .from("reply_templates")
    .select("id, name, category, subject_template, body_template, is_active")
    .eq("account_id", account_id)
    .eq("is_active", true)
    .order("name", { ascending: true });

  if (error) {
    console.error("Reply templates fetch error", error);
    return Response.json({ error: "Failed to load templates" }, { status: 500 });
  }

  return Response.json({ templates: data || [] });
}

export async function POST(req: NextRequest) {
  const supabase = createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const account_id = await getAccountId(supabase);

  if (!account_id) {
    // For v1, use mock account as fallback (as per spec)
    // TODO: replace with real auth
    const mockAccountId = "00000000-0000-0000-0000-000000000000";
    
    const body = await req.json();
    const { name, category, subject_template, body_template } = body;

    if (!name || !body_template) {
      return Response.json(
        { error: "name and body_template are required" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("reply_templates")
      .insert({
        account_id: mockAccountId,
        name,
        category: category || null,
        subject_template: subject_template || null,
        body_template,
        created_by_user_id: user.id,
      })
      .select()
      .single();

    if (error) {
      console.error("Reply template insert error", error);
      return Response.json({ error: "Failed to create template" }, { status: 500 });
    }

    return Response.json({ template: data });
  }

  // Set account context for RLS
  await supabase.rpc("set_account", { p_account_id: account_id });

  const body = await req.json();
  const { name, category, subject_template, body_template } = body;

  if (!name || !body_template) {
    return Response.json(
      { error: "name and body_template are required" },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("reply_templates")
    .insert({
      account_id,
      name,
      category: category || null,
      subject_template: subject_template || null,
      body_template,
      created_by_user_id: user.id,
    })
    .select()
    .single();

  if (error) {
    console.error("Reply template insert error", error);
    return Response.json({ error: "Failed to create template" }, { status: 500 });
  }

  return Response.json({ template: data });
}

















































