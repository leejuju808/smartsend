// app/dashboard/_components/HotLeadsWidget.tsx
// Block 97000 — Hot Lead Fastlane Widget
// Enhanced version with one-click reply templates and fastlane UI

import { createClient } from "@/utils/supabase/server";
import { getActiveWorkspaceId } from "@/lib/workspace/context";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { MessageSquare, Clock } from "lucide-react";

type HotLeadData = {
  lead_id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  heat_score: string;
  last_updated: string;
  latest_event: {
    intent: string;
    confidence: number;
    message_text: string | null;
    created_at: string;
  } | null;
};

function formatTimeAgo(dateString: string | null): string {
  if (!dateString) return "Unknown";
  try {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  } catch {
    return dateString;
  }
}

function formatConfidence(confidence: number | null): string {
  if (confidence == null) return "—";
  const pct = Math.round(confidence * 100);
  return `${pct}%`;
}

async function getHotLeadsCount(): Promise<number> {
  const supabase = createClient();
  const workspaceId = await getActiveWorkspaceId();

  if (!workspaceId) {
    return 0;
  }

  const { count, error } = await supabase
    .from("leads")
    .select("*", { count: "exact", head: true })
    .eq("heat_score", "hot");

  if (error) {
    console.error("Error loading hot leads count:", error);
    return 0;
  }

  return count || 0;
}

async function getRecentHotLeads(): Promise<HotLeadData[]> {
  try {
    const response = await fetch(
      `${process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"}/api/hot-leads?limit=5`,
      { cache: "no-store" }
    );

    if (!response.ok) {
      console.error("Failed to fetch hot leads");
      return [];
    }

    return await response.json();
  } catch (error) {
    console.error("Error fetching hot leads:", error);
    return [];
  }
}

export default async function HotLeadsWidget() {
  const [totalHot, recentHot] = await Promise.all([
    getHotLeadsCount(),
    getRecentHotLeads(),
  ]);

  return (
    <section className="flex flex-col rounded-2xl border bg-card p-4 shadow-sm">
      <header className="flex items-start justify-between gap-2 mb-4">
        <div>
          <h2 className="text-sm font-semibold tracking-tight flex items-center gap-2">
            🔥 HOT LEADS (Reply Now)
          </h2>
          <p className="text-xs text-muted-foreground mt-1">
            Respond within 60 seconds — this is how roofers win jobs.
          </p>
        </div>
        <div className="flex flex-col items-end">
          <span className="text-2xl font-semibold tabular-nums text-red-600">
            {totalHot}
          </span>
          <span className="text-[11px] text-muted-foreground">
            Hot leads
          </span>
        </div>
      </header>

      <div className="space-y-2">
        {recentHot.length === 0 ? (
          <p className="text-xs text-muted-foreground py-4 text-center">
            No hot leads yet. Once replies start coming in, SmartSend will flag
            the hottest ones here.
          </p>
        ) : (
          recentHot.map((lead) => {
            const name = lead.first_name || lead.last_name
              ? `${lead.first_name || ""} ${lead.last_name || ""}`.trim()
              : lead.email.split("@")[0];
            const confidence = lead.latest_event?.confidence || 0;

            return (
              <Link
                key={lead.lead_id}
                href={`/dashboard/hot-leads/${lead.lead_id}`}
                className="block"
              >
                <article className="flex flex-col gap-2 rounded-xl border-2 border-red-500/20 bg-red-50/50 dark:bg-red-950/20 px-3 py-2.5 text-xs hover:border-red-500/40 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex flex-col gap-1 flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold leading-tight text-foreground">
                          {name}
                        </span>
                        <span className="rounded-full border border-red-600 bg-red-500/10 px-2 py-0.5 text-[10px] font-medium text-red-600 whitespace-nowrap">
                          HOT
                        </span>
                      </div>
                      {lead.email && (
                        <span className="text-[11px] text-muted-foreground truncate">
                          {lead.email}
                        </span>
                      )}
                      {lead.latest_event?.message_text && (
                        <p className="line-clamp-2 text-[11px] text-muted-foreground mt-1">
                          "{lead.latest_event.message_text.slice(0, 100)}..."
                        </p>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formatTimeAgo(lead.last_updated)}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {formatConfidence(confidence)} confidence
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-1 border-t border-border/50">
                    <span className="text-[10px] text-muted-foreground">
                      Click to reply →
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-6 text-[10px] px-2"
                      onClick={(e) => {
                        e.preventDefault();
                        window.location.href = `/dashboard/hot-leads/${lead.lead_id}`;
                      }}
                    >
                      <MessageSquare className="w-3 h-3 mr-1" />
                      Reply Now
                    </Button>
                  </div>
                </article>
              </Link>
            );
          })
        )}
      </div>

      {recentHot.length > 0 && (
        <div className="mt-4 pt-4 border-t border-border">
          <Link
            href="/dashboard/hot-leads"
            className="text-xs text-muted-foreground hover:text-foreground font-medium"
          >
            View all hot leads →
          </Link>
        </div>
      )}
    </section>
  );
}
































