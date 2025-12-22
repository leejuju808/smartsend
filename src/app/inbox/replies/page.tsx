"use client";

import { useState } from "react";
import { useReplyInbox } from "@/hooks/useReplyInbox";
import type { ReplyIntent, ReplyStatus } from "@/types/reply-inbox";
import ReplyInboxFilters from "./components/ReplyInboxFilters";
import ReplyList from "./components/ReplyList";
import ReplyDetail from "./components/ReplyDetail";
import { ExportContactsModal } from "@/components/contacts/ExportContactsModal";
import { Button } from "@/components/ui/Button";

export default function ReplyInboxPage() {
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [filters, setFilters] = useState<{
    intent?: ReplyIntent | ReplyIntent[] | "all";
    status?: ReplyStatus | "all";
    campaignId?: string;
    q?: string;
    scope?: "mine" | "all";
    dateRange?: "today" | "7days" | "30days" | "all";
  }>({
    status: "open",
    scope: "mine",
    dateRange: "all",
  });

  const { data, loading, error, reload } = useReplyInbox(filters);

  // Determine export filters based on current inbox filters
  const exportFilters = {
    activity: "replied" as const,
    intent: filters.intent && filters.intent !== "all" 
      ? (Array.isArray(filters.intent) ? filters.intent[0] : filters.intent)
      : undefined,
    campaignId: filters.campaignId,
  };

  return (
    <div className="flex h-screen flex-col">
      <div className="border-b bg-background px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Reply Inbox</h1>
            <p className="text-sm text-muted-foreground">
              All replies from homeowners across every campaign.
            </p>
          </div>
          <div className="flex items-center gap-4">
            <select
              value={filters.scope || "mine"}
              onChange={(e) =>
                setFilters({ ...filters, scope: e.target.value as "mine" | "all" })
              }
              className="rounded-md border px-3 py-2 text-sm"
            >
              <option value="mine">My replies</option>
              <option value="all">All replies</option>
            </select>
            <Button
              variant="outline"
              onClick={() => setExportModalOpen(true)}
            >
              Export Replied Contacts
            </Button>
          </div>
        </div>
      </div>
      <ReplyInboxFilters filters={filters} onFiltersChange={setFilters} />
      
      <div className="flex flex-1 overflow-hidden">
        <div className="w-1/2 border-r overflow-y-auto">
          <ReplyList
            threads={data?.threads || []}
            loading={loading}
            selectedThreadId={selectedThreadId}
            onSelectThread={setSelectedThreadId}
            onReload={reload}
          />
        </div>
        
        <div className="w-1/2 overflow-y-auto">
          {selectedThreadId ? (
            <ReplyDetail
              threadId={selectedThreadId}
              onClose={() => setSelectedThreadId(null)}
              onUpdate={reload}
            />
          ) : (
            <div className="flex h-full items-center justify-center text-muted-foreground">
              Select a thread to view details
            </div>
          )}
        </div>
      </div>

      <ExportContactsModal
        open={exportModalOpen}
        onOpenChange={setExportModalOpen}
        defaultFilters={exportFilters}
      />
    </div>
  );
}

