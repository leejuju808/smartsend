import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function GET() {
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
    return NextResponse.json({ error: "No workspace found" }, { status: 400 });
  }

  const workspaceId = membership.workspace_id;

  const { data, error: accountsError } = await supabase
    .from("email_accounts")
    .select("id, provider, email, account_email, display_name, status, daily_cap_override, last_synced_at")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: true });

  if (accountsError) {
    console.error(accountsError);
    return NextResponse.json({ error: "Failed to load accounts" }, { status: 500 });
  }

  // Normalize email field - use email if available, fallback to account_email
  const normalizedAccounts = (data ?? []).map((account: any) => ({
    ...account,
    email: account.email || account.account_email,
  }));

  return NextResponse.json({ accounts: normalizedAccounts });
}

