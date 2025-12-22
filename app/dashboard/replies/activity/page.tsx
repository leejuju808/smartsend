// app/dashboard/replies/activity/page.tsx

import { Metadata } from "next";
import { createClient } from "@/utils/supabase/server";
import ActivityRow from "../_components/ActivityRow";

export const metadata: Metadata = {
  title: "Reply Intent Activity · SmartSend",
};

type IntentType = "hot" | "warm" | "not_interested";

type ActivityRowType = {
  id: string;
  reply_id: string;
  intent: IntentType | null;
  confidence: number | null;
  model_version: string | null;
  classified_at: string | null;
  intent_source: "ai" | "manual";
  from_email: string | null;
  from_name: string | null;
  subject: string | null;
  preview: string | null;
  received_at: string | null;
};

async function getActivity(): Promise<ActivityRowType[]> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("reply_intent_activity_view")
    .select(
      `
        id,
        reply_id,
        intent,
        confidence,
        model_version,
        classified_at,
        intent_source,
        from_email,
        from_name,
        subject,
        preview,
        received_at
      `
    )
    .order("classified_at", { ascending: false })
    .limit(50);

  if (error || !data) {
    console.error("Error loading reply intent activity:", error);
    return [];
  }

  return data as ActivityRowType[];
}

export default async function ReplyIntentActivityPage() {
  const activity = await getActivity();

  return (
    <div className="flex h-full flex-col gap-6 p-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">
          Reply Intent Activity
        </h1>
        <p className="text-sm text-muted-foreground">
          See the latest AI classifications and manual overrides on your
          replies.
        </p>
      </header>

      <section className="flex-1 overflow-hidden rounded-2xl border bg-card shadow-sm">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h2 className="text-sm font-medium">Last 50 changes</h2>
          <span className="text-xs text-muted-foreground">
            {activity.length} events
          </span>
        </div>

        <div className="h-[calc(100vh-260px)] overflow-y-auto px-2 py-3">
          {activity.length === 0 ? (
            <div className="flex h-full items-center justify-center">
              <p className="text-sm text-muted-foreground">
                No activity yet. Once AI or you start labeling replies, events
                will show up here.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {activity.map((row) => (
                <ActivityRow key={row.id} activity={row} />
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}


























































