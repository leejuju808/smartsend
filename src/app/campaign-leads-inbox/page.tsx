"use client";

import { useLeadReplies, type Lead } from "../../../lib/hooks/useLeadReplies";
import { useState } from "react";

const mockLeads: Lead[] = [
  { id: "ld_1", email: "jane@acme.com", name: "Jane", last_message_snippet: "Following up…", has_replied: false, campaign_id: "cmp_1" },
  { id: "ld_2", email: "bob@contoso.com", name: "Bob", last_message_snippet: "Checking in", has_replied: false, campaign_id: "cmp_1" },
];

export default function CampaignLeadsInboxPage() {
  // In real app, fetch initial leads from your API or Supabase query
  const [campaignId] = useState<string | undefined>("cmp_1");
  const { leads, setLeads } = useLeadReplies(mockLeads, { campaignId });

  // optional local toggle to sort replied to top
  const [showRepliedFirst, setShowRepliedFirst] = useState(true);
  const ordered = [...leads].sort((a, b) => Number(b.has_replied) - Number(a.has_replied));

  // quick test helper: pretend an edge function just marked one as replied
  const simulateReplyLocal = (leadId: string) => {
    setLeads((prev) =>
      prev.map((l) => (l.id === leadId ? { ...l, has_replied: true } : l))
    );
  };

  // call the **deployed** edge function to test end-to-end
  const simulateReplyEdgeFn = async (leadId: string, snippet: string) => {
    const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/reply-detection`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ leadId, emailSnippet: snippet }),
    });
    const json = await res.json();
    console.log("EdgeFn:", json);
  };

  const list = showRepliedFirst ? ordered : leads;

  return (
    <main className="mx-auto max-w-4xl p-6 space-y-4">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Replies Inbox</h1>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={showRepliedFirst}
              onChange={(e) => setShowRepliedFirst(e.target.checked)}
            />
            Replied first
          </label>
        </div>
      </header>

      <ul className="space-y-3">
        {list.map((lead) => (
          <li key={lead.id} className="rounded-2xl border p-4 flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-medium">{lead.name ?? lead.email}</span>
                {lead.has_replied && (
                  <span className="rounded-full px-2 py-0.5 text-xs border">
                    Replied
                  </span>
                )}
              </div>
              {lead.last_message_snippet && (
                <p className="text-sm opacity-80 mt-1">{lead.last_message_snippet}</p>
              )}
            </div>

            <div className="flex items-center gap-2">
              {/* Local-only visual test */}
              {!lead.has_replied && (
                <button
                  onClick={() => simulateReplyLocal(lead.id)}
                  className="rounded-xl border px-3 py-1 text-sm"
                >
                  Simulate Local Reply
                </button>
              )}

              {/* End-to-end edge function test */}
              {!lead.has_replied && (
                <button
                  onClick={() => simulateReplyEdgeFn(lead.id, "Hey, thanks for reaching out.")}
                  className="rounded-xl border px-3 py-1 text-sm"
                >
                  Test EdgeFn
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}

