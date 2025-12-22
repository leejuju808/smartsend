export async function getDefaultAccountId(supabase: any, workspaceId: string) {
  const { data: acct } = await supabase
    .from("email_accounts")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("is_default", true)
    .limit(1)
    .single();
  return acct?.id || null;
}


