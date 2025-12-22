// Block 14800 — Hot Lead Alerts v1
// GET /api/notifications/preferences - Get user's notification preferences
// POST /api/notifications/preferences - Update user's notification preferences

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Get user's default workspace
  const { data: membership, error: memberError } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", user.id)
    .eq("is_default", true)
    .maybeSingle();

  // Fallback: get first workspace if no default
  if (memberError || !membership) {
    const { data: firstMembership } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle();
    
    if (!firstMembership) {
      return NextResponse.json({ error: "No workspace" }, { status: 404 });
    }
    
    const { data: prefs } = await supabase
      .from("notification_preferences")
      .select("*")
      .eq("user_id", user.id)
      .eq("workspace_id", firstMembership.workspace_id)
      .maybeSingle();

    // Return default prefs if none exist
    return NextResponse.json(
      prefs ?? {
        notify_hot_lead_email: true,
        notify_warm_lead_email: true,
        notify_task_assigned_email: false,
      }
    );
  }

  const { data: prefs } = await supabase
    .from("notification_preferences")
    .select("*")
    .eq("user_id", user.id)
    .eq("workspace_id", membership.workspace_id)
    .maybeSingle();

  // Return default prefs if none exist
  return NextResponse.json(
    prefs ?? {
      notify_hot_lead_email: true,
      notify_warm_lead_email: true,
      notify_task_assigned_email: false,
    }
  );
}

export async function POST(req: Request) {
  const supabase = createClient();
  const body = await req.json();

  const {
    notify_hot_lead_email,
    notify_warm_lead_email,
    notify_task_assigned_email,
  } = body;

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Get user's default workspace
  const { data: membership, error: memberError } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", user.id)
    .eq("is_default", true)
    .maybeSingle();

  // Fallback: get first workspace if no default
  let workspaceId: string;
  if (memberError || !membership) {
    const { data: firstMembership } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle();
    
    if (!firstMembership) {
      return NextResponse.json({ error: "No workspace" }, { status: 404 });
    }
    workspaceId = firstMembership.workspace_id;
  } else {
    workspaceId = membership.workspace_id;
  }

  const { data: existing } = await supabase
    .from("notification_preferences")
    .select("id")
    .eq("user_id", user.id)
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  const payload = {
    user_id: user.id,
    workspace_id: workspaceId,
    notify_hot_lead_email,
    notify_warm_lead_email,
    notify_task_assigned_email,
    updated_at: new Date().toISOString(),
  };

  let result;
  if (existing) {
    result = await supabase
      .from("notification_preferences")
      .update(payload)
      .eq("id", existing.id)
      .select("*")
      .single();
  } else {
    result = await supabase
      .from("notification_preferences")
      .insert(payload)
      .select("*")
      .single();
  }

  if (result.error) {
    return NextResponse.json({ error: result.error.message }, { status: 400 });
  }

  return NextResponse.json(result.data);
}



























































