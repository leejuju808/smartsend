// app/(dashboard)/settings/email-sending/page.tsx
// Block 8160 — Settings → Email Sending screen

import { createClient } from "@/lib/supabase/server";
import { EmailSenderForm } from "@/components/settings/EmailSenderForm";
import { OutboundAccountsList } from "@/components/settings/OutboundAccountsList";

export default async function EmailSendingSettingsPage() {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    // You can redirect to login or show a message
    // redirect("/login");
    return (
      <div className="p-4 text-sm text-muted-foreground">
        You must be signed in to manage email settings.
      </div>
    );
  }

  const { data: accounts } = await supabase
    .from("outbound_email_accounts")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">
          Email Sending
        </h1>
        <p className="text-xs text-muted-foreground">
          Connect the inboxes SmartSend will use to send your campaigns.
        </p>
      </div>

      <EmailSenderForm />
      <OutboundAccountsList initialAccounts={(accounts ?? []) as any} />
    </div>
  );
}

