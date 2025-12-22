import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import SendersClient from "./SendersClient";

export default async function SendersPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: senders } = await supabase
    .from("sender_profiles")
    .select("id,provider,email,display_name,daily_limit,created_at")
    .order("created_at", { ascending: false });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold mb-2">Connected Inboxes</h1>
        <p className="text-gray-600">
          Connect your Gmail or Outlook accounts to send emails directly from your inbox
        </p>
      </div>
      
      <SendersClient initialSenders={senders || []} />
    </div>
  );
}

