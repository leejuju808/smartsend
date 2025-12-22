"use client";

import { useState } from "react";
import { BillingStatusNudge } from "@/components/billing/BillingStatusNudge";
import { SendCapNudge } from "@/components/billing/SendCapNudge";
import {
  InboxFilters,
  InboxFilterState,
} from "@/components/inbox/InboxFilters";
import { useInboxReplies } from "@/lib/hooks/useInboxReplies";
import { ReplyIntentBadges } from "@/components/inbox/ReplyIntentBadges";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function InboxPage() {
  const [filters, setFilters] = useState<InboxFilterState>({
    category: "all",
    hasMeetingOnly: false,
    stopFollowupsOnly: false,
    search: "",
  });

  const { data, loading, reload } = useInboxReplies(filters);
  const replies = data?.replies || [];

  return (
    <div className="p-6 space-y-4">
      {/* Billing guardrails */}
      <BillingStatusNudge />
      <SendCapNudge />

      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">Replies Inbox</h1>
          <p className="text-xs text-muted-foreground">
            AI-focused view of replies, prioritized by interest and meeting intent.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            className="h-8 px-3 text-[11px]"
            onClick={reload}
          >
            Refresh
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card className="bg-slate-950/80 border-slate-800">
        <CardContent className="p-3">
          <InboxFilters filters={filters} setFilters={setFilters} />
        </CardContent>
      </Card>

      {/* Replies list */}
      <Card className="bg-slate-950/80 border-slate-800">
        <CardContent className="p-0">
          {loading ? (
            <p className="px-3 py-2 text-[11px] text-muted-foreground">
              Loading replies…
            </p>
          ) : replies.length === 0 ? (
            <p className="px-3 py-2 text-[11px] text-muted-foreground">
              No replies found for the current filters.
            </p>
          ) : (
            <div className="max-h-[640px] overflow-y-auto text-xs">
              <table className="w-full text-left text-[11px]">
                <thead className="bg-slate-950/70 sticky top-0 z-10">
                  <tr className="border-b border-slate-800">
                    <th className="px-3 py-2 font-medium w-[40%]">
                      Subject
                    </th>
                    <th className="px-3 py-2 font-medium w-[25%]">
                      Contact
                    </th>
                    <th className="px-3 py-2 font-medium">
                      AI intent
                    </th>
                    <th className="px-3 py-2 font-medium text-right w-[15%]">
                      Received
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {replies.map((r) => {
                    const leadEmail = r.lead_email || r.leads?.email || "Unknown";
                    return (
                      <tr
                        key={r.id}
                        className="border-b border-slate-900/80 hover:bg-slate-950/70"
                      >
                        <td className="px-3 py-2 align-top">
                          <div className="font-semibold line-clamp-2">
                            {r.subject || "(no subject)"}
                          </div>
                        </td>
                        <td className="px-3 py-2 align-top">
                          <div className="text-[11px]">
                            {leadEmail}
                          </div>
                        </td>
                        <td className="px-3 py-2 align-top">
                          <ReplyIntentBadges
                            aiCategory={r.ai_category}
                            aiHasMeeting={r.ai_has_meeting}
                            aiStopFollowups={r.ai_stop_followups}
                          />
                        </td>
                        <td className="px-3 py-2 align-top text-right">
                          <span className="text-[10px] text-muted-foreground">
                            {new Date(r.received_at).toLocaleString()}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}





