import { createClient } from "@/lib/supabase/server";
import { SendingAccountsClient } from "./SendingAccountsClient";

export default async function SendingAccountsPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return <div className="p-6 text-sm">You must be logged in.</div>;
  }

  const { data: accounts } = await supabase
    .from("smartsend_sending_accounts")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });

  return (
    <div className="p-6">
      <h1 className="text-lg font-semibold mb-1">Sending Accounts</h1>
      <p className="text-xs text-muted-foreground mb-4">
        Connect Gmail or Outlook mailboxes to send SmartSend campaigns from real inboxes.
      </p>
      <SendingAccountsClient initialAccounts={accounts ?? []} />
    </div>
  );
}


































































