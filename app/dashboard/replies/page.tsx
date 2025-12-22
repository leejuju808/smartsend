// app/dashboard/replies/page.tsx

import { Metadata } from "next";
import { createClient } from "@/utils/supabase/server";
import IntentPill from "./_components/IntentPill";
import ReplyCard from "./_components/ReplyCard";

export const metadata: Metadata = {
  title: "Replies · SmartSend",
};

type IntentType = "hot" | "warm" | "not_interested" | "unclassified";

const INTENT_LABELS: Record<IntentType, string> = {
  hot: "Hot",
  warm: "Warm",
  not_interested: "Not Interested",
  unclassified: "Unclassified",
};

type IntentCounts = {
  hot: number;
  warm: number;
  not_interested: number;
  unclassified: number;
};

type ReplyRow = {
  id: string;
  thread_id: string | null;
  from_email: string | null;
  from_name: string | null;
  subject: string | null;
  preview: string | null;
  received_at: string | null;
  intent: IntentType | null;
  confidence: number | null;
  model_version: string | null;
  classified_at: string | null;
  intent_source: "ai" | "manual" | null;
};

async function getIntentCounts(): Promise<IntentCounts> {
  const supabase = createClient();

  // You can back this with a materialized view or raw table counts later.
  const { data, error } = await supabase
    .from("reply_intents_summary")
    .select("intent, count")
    .returns<{ intent: IntentType; count: number }[]>();

  if (error || !data) {
    console.error("Error loading intent counts:", error);
    return {
      hot: 0,
      warm: 0,
      not_interested: 0,
      unclassified: 0,
    };
  }

  const base: IntentCounts = {
    hot: 0,
    warm: 0,
    not_interested: 0,
    unclassified: 0,
  };

  for (const row of data) {
    if (row.intent in base) {
      base[row.intent] = row.count;
    }
  }

  return base;
}

async function getRepliesByIntent(intent: IntentType): Promise<ReplyRow[]> {
  const supabase = createClient();

  let query = supabase
    .from("reply_intents_view")
    .select(
      `
        id,
        thread_id,
        from_email,
        from_name,
        subject,
        preview,
        received_at,
        intent,
        confidence,
        model_version,
        classified_at,
        intent_source
      `
    )
    .order("received_at", { ascending: false })
    .limit(50);

  // "unclassified" = null intent rows
  if (intent === "unclassified") {
    query = query.is("intent", null);
  } else {
    query = query.eq("intent", intent);
  }

  const { data, error } = await query;

  if (error || !data) {
    console.error("Error loading replies by intent:", error);
    return [];
  }

  return data as ReplyRow[];
}

interface RepliesPageProps {
  searchParams: {
    intent?: IntentType;
  };
}

export default async function RepliesPage({ searchParams }: RepliesPageProps) {
  const activeIntent: IntentType = searchParams.intent ?? "hot";

  const [counts, replies] = await Promise.all([
    getIntentCounts(),
    getRepliesByIntent(activeIntent),
  ]);

  return (
    <div className="flex h-full flex-col gap-6 p-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">
          Reply Classification
        </h1>
        <p className="text-sm text-muted-foreground">
          See how SmartSend is labeling your replies into hot, warm, and not
          interested leads.
        </p>
      </header>

      <section className="flex flex-col gap-4 rounded-2xl border bg-card p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          {(Object.keys(INTENT_LABELS) as IntentType[]).map((intentKey) => (
            <IntentPill
              key={intentKey}
              intent={intentKey}
              label={INTENT_LABELS[intentKey]}
              count={counts[intentKey]}
              isActive={activeIntent === intentKey}
            />
          ))}
        </div>
      </section>

      <section className="flex-1 overflow-hidden rounded-2xl border bg-card shadow-sm">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h2 className="text-sm font-medium">
            {INTENT_LABELS[activeIntent]} Leads
          </h2>
          <span className="text-xs text-muted-foreground">
            Showing {replies.length} replies
          </span>
        </div>

        <div className="h-[calc(100vh-260px)] overflow-y-auto px-2 py-3">
          {replies.length === 0 ? (
            <div className="flex h-full items-center justify-center">
              <p className="text-sm text-muted-foreground">
                No replies in this bucket yet.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {replies.map((reply) => (
                <ReplyCard key={reply.id} reply={reply} />
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
