// Block 15600 — Roofer Fast-Start Onboarding v1
// GET /api/onboarding - Returns current workspace onboarding info
// POST /api/onboarding - Mark steps as complete

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

  // Get default workspace (first workspace they belong to)
  const { data: membership, error: memberError } = await supabase
    .from("workspace_members")
    .select("workspace_id, workspaces(onboarding_state, onboarding_completed_at)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .single();

  if (memberError || !membership) {
    return NextResponse.json({ error: "No workspace" }, { status: 404 });
  }

  const workspace = membership.workspaces as any;

  return NextResponse.json({
    onboarding_state:
      workspace?.onboarding_state || {
        profile_done: false,
        contacts_done: false,
        first_campaign_done: false,
      },
    onboarding_completed_at: workspace?.onboarding_completed_at || null,
  });
}

export async function POST(req: Request) {
  const supabase = createClient();
  const body = await req.json();

  const { step, value } = body as {
    step: "profile_done" | "contacts_done" | "first_campaign_done";
    value: boolean;
  };

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Get default workspace
  const { data: membership, error: memberError } = await supabase
    .from("workspace_members")
    .select("workspace_id, workspaces(onboarding_state)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .single();

  if (memberError || !membership) {
    return NextResponse.json({ error: "No workspace" }, { status: 404 });
  }

  const workspaceId = membership.workspace_id;
  const workspace = membership.workspaces as any;
  const currentState =
    workspace?.onboarding_state || {
      profile_done: false,
      contacts_done: false,
      first_campaign_done: false,
    };

  const newState = {
    ...currentState,
    [step]: value,
  };

  const allDone =
    newState.profile_done &&
    newState.contacts_done &&
    newState.first_campaign_done;

  const { error: updateError } = await supabase
    .from("workspaces")
    .update({
      onboarding_state: newState,
      onboarding_completed_at: allDone ? new Date().toISOString() : null,
    })
    .eq("id", workspaceId);

  if (updateError) {
    return NextResponse.json(
      { error: updateError.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ onboarding_state: newState });
}



























































