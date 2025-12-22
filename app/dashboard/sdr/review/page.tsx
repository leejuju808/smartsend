import { createClient } from "@/utils/supabase/server";
import { ReviewQueue } from "./ReviewQueue";

export default async function SdrReviewPage() {
  const supabase = createClient();

  // Later: filter by org_id + user permissions
  const { data: jobs, error } = await supabase
    .from("sdr_autopilot_queue")
    .select(
      "id, lead_id, reply_id, template_key, subject, body, edited_subject, edited_body, scheduled_at, review_status, status, created_at, leads(first_name, last_name, email, company)",
    )
    .eq("review_status", "pending_review")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(100);

  if (error) {
    console.error("review queue error", error);
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div>
        <h1 className="text-lg font-semibold">AI SDR Review Queue</h1>
        <p className="text-xs text-muted-foreground">
          In assist mode, AI prepares drafts here. Approve, edit, or skip each one.
        </p>
      </div>

      <ReviewQueue jobs={jobs ?? []} />
    </div>
  );
}

