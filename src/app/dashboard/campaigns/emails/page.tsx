import { createClient } from "@/lib/supabase/server";
import EmailTable from "../components/EmailTable";

export default async function CampaignsPage() {
  const supabase = createClient();
  
  // Get current user
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return <div className="p-6">Please log in to view email logs.</div>;
  }

  // Fetch email logs for the current user
  const { data: emails } = await supabase
    .from("email_logs")
    .select("id, to_email, subject, status, opened, clicked, sent_at, created_at, campaign_id, user_id, workspace_id, attempts, open_count, click_count, first_opened_at, last_opened_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(100); // Limit to recent emails for performance

  return (
    <div className="p-6">
      <h1 className="text-xl font-bold mb-4">📡 Campaign Email Status (Live)</h1>
      <p className="text-gray-600 mb-6">
        Real-time updates of your email campaign status. Updates automatically when emails are sent, opened, or replied to.
      </p>
      <EmailTable initial={(emails ?? []) as any} />
    </div>
  );
}