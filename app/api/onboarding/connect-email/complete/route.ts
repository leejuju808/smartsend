import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function POST() {
  const supabase = createClient();

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Get workspace_id from workspace_members
  const { data: membership, error: membershipError } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", user.id)
    .limit(1)
    .single();

  if (membershipError || !membership) {
    return NextResponse.json({ error: "No workspace_id" }, { status: 400 });
  }

  const workspaceId = membership.workspace_id;

  const { data: accounts, error: accountsError } = await supabase
    .from("email_accounts")
    .select("id")
    .eq("workspace_id", workspaceId)
    .limit(1);

  if (accountsError) {
    console.error(accountsError);
    return NextResponse.json({ error: "Failed to load accounts" }, { status: 500 });
  }

  if (!accounts || accounts.length === 0) {
    return NextResponse.json(
      { error: "You must connect at least one email account first" },
      { status: 400 }
    );
  }

  const { error: updateError } = await supabase
    .from("workspaces")
    .update({ onboarding_step: "first_upload" })
    .eq("id", workspaceId);

  if (updateError) {
    console.error(updateError);
    return NextResponse.json({ error: "Failed to update onboarding step" }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    next: "/onboarding/upload",
  });
}










