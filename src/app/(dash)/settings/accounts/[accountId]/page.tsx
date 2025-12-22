import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";
import { RoutingRulesCard } from "./RoutingRulesCard";
import { SendRateCard } from "./SendRateCard";

export default async function AccountSettingsPage({ params }: { params: { accountId: string } }) {
  const supabase = createServerComponentClient({ cookies });

  const { data: account, error: accountError } = await supabase
    .from("connected_accounts")
    .select("id, provider, email, workspace_id")
    .eq("id", params.accountId)
    .maybeSingle();

  if (accountError) {
    throw new Error(accountError.message);
  }
  if (!account) {
    notFound();
  }

  const { data: campaigns, error: campaignError } = await supabase
    .from("campaigns")
    .select("id, name")
    .eq("workspace_id", account.workspace_id)
    .order("name");
  if (campaignError) {
    throw new Error(campaignError.message);
  }

  return (
    <div className="space-y-6 p-6">
      <div className="rounded-md border p-4">
        <div className="text-sm text-muted-foreground">Provider</div>
        <div className="text-base font-medium capitalize">{account.provider}</div>
        <div className="mt-3 text-sm text-muted-foreground">Email</div>
        <div className="text-base font-medium">{account.email}</div>
      </div>

      <RoutingRulesCard accountId={account.id} campaigns={campaigns ?? []} />
      
      <SendRateCard accountId={account.id} provider={account.provider} />
    </div>
  );
}


