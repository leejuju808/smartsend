// Block 13300 — Lead List Component (Left Column)

"use client";

import { useState } from "react";
import { Pin, PinOff, MessageSquare, FileText, Flame, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { ThreadListSkeleton } from "@/components/inbox-v2/InboxV2Skeleton";

type Thread = {
  id: string;
  lead: {
    name: string;
    email: string;
  };
  latest_intent: string;
  unread_count: number;
  last_message_at: string;
  snippet: string;
  pinned: boolean;
  has_notes: boolean;
  suppressed: boolean;
};

type Filter = "all" | "hot" | "new_replies" | "follow_up" | "warm" | "not_interested";

type LeadListProps = {
  threads: Thread[];
  selectedThreadId: string | null;
  onSelectThread: (threadId: string) => void;
  onPinThread: (threadId: string, pinned: boolean) => Promise<void>;
  filter: Filter;
  onFilterChange: (filter: Filter) => void;
  selectedIds?: Set<string>;
  onToggleSelect?: (threadId: string) => void;
  onSelectAll?: () => void;
  onClearSelection?: () => void;
  loading?: boolean;
  loadingMore?: boolean;
  hasMore?: boolean;
  onLoadMore?: () => void;
};

export function LeadList({
  threads,
  selectedThreadId,
  onSelectThread,
  onPinThread,
  filter,
  onFilterChange,
  selectedIds,
  onToggleSelect,
  onSelectAll,
  onClearSelection,
  loading = false,
  loadingMore = false,
  hasMore = false,
  onLoadMore,
}: LeadListProps & {
  selectedIds?: Set<string>;
  onToggleSelect?: (threadId: string) => void;
  onSelectAll?: () => void;
  onClearSelection?: () => void;
  loading?: boolean;
  loadingMore?: boolean;
  hasMore?: boolean;
  onLoadMore?: () => void;
}) {
  const [localSelectedIds, setLocalSelectedIds] = useState<Set<string>>(new Set());
  const activeSelectedIds = selectedIds || localSelectedIds;
  const activeToggleSelect = onToggleSelect || ((id: string) => {
    setLocalSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  });

  const filters: { id: Filter; label: string; icon?: React.ReactNode }[] = [
    { id: "all", label: "All" },
    { id: "hot", label: "HOT", icon: <Flame className="w-3 h-3" /> },
    { id: "new_replies", label: "New Replies" },
    { id: "follow_up", label: "Follow Up", icon: <Clock className="w-3 h-3" /> },
    { id: "warm", label: "Warm" },
    { id: "not_interested", label: "Not Interested" },
  ];

  // Sort threads: pinned first, then by last_message_at
  const sortedThreads = [...threads].sort((a, b) => {
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    return (
      new Date(b.last_message_at).getTime() -
      new Date(a.last_message_at).getTime()
    );
  });

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m`;
    if (diffHours < 24) return `${diffHours}h`;
    if (diffDays < 7) return `${diffDays}d`;
    return date.toLocaleDateString();
  };

  const getStatusBadge = (intent: string) => {
    const badges: Record<string, { label: string; className: string }> = {
      HOT: { label: "HOT", className: "bg-red-100 text-red-700" },
      WARM: { label: "WARM", className: "bg-orange-100 text-orange-700" },
      FOLLOW_UP: { label: "Follow Up", className: "bg-blue-100 text-blue-700" },
      NOT_INTERESTED: {
        label: "Not Interested",
        className: "bg-gray-100 text-gray-700",
      },
      NEW_REPLY: { label: "New", className: "bg-green-100 text-green-700" },
    };

    return badges[intent] || null;
  };

  return (
    <div className="flex flex-col h-full border-r bg-white">
      {/* Bulk Selection Header */}
      {activeSelectedIds.size > 0 && (
        <div className="p-2 border-b bg-blue-50 flex items-center justify-between">
          <span className="text-xs font-medium">
            {activeSelectedIds.size} selected
          </span>
          {onClearSelection && (
            <button
              onClick={onClearSelection}
              className="text-xs text-blue-600 hover:text-blue-800"
            >
              Clear
            </button>
          )}
        </div>
      )}

      {/* Filters */}
      <div className="p-3 border-b space-y-2">
        <div className="flex flex-wrap gap-1">
          {filters.map((f) => (
            <button
              key={f.id}
              onClick={() => onFilterChange(f.id)}
              className={cn(
                "px-2 py-1 text-xs rounded-md transition-colors",
                filter === f.id
                  ? "bg-blue-500 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              )}
            >
              {f.icon && <span className="inline-flex items-center gap-1">{f.icon}</span>}
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Thread List */}
      <div className="flex-1 overflow-y-auto">
        {loading && threads.length === 0 ? (
          <ThreadListSkeleton count={5} />
        ) : sortedThreads.length === 0 ? (
          <div className="p-4 text-center text-sm text-gray-500">
            No threads found
          </div>
        ) : (
          <>
            <div className="divide-y">
              {sortedThreads.map((thread) => {
                const statusBadge = getStatusBadge(thread.latest_intent);
                const isSelected = selectedThreadId === thread.id;
                const isUnread = thread.unread_count > 0;

                const isBulkSelected = activeSelectedIds.has(thread.id);

                return (
                  <div
                    key={thread.id}
                    onClick={(e) => {
                      // Allow checkbox clicks without selecting thread
                      if ((e.target as HTMLElement).closest('input[type="checkbox"]')) {
                        return;
                      }
                      onSelectThread(thread.id);
                    }}
                    className={cn(
                      "p-3 cursor-pointer hover:bg-gray-50 transition-colors relative",
                      isSelected && "bg-blue-50 border-l-2 border-l-blue-500",
                      isUnread && "bg-blue-50/50",
                      isBulkSelected && "bg-blue-100"
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      {onToggleSelect && (
                        <input
                          type="checkbox"
                          checked={isBulkSelected}
                          onChange={() => activeToggleSelect(thread.id)}
                          onClick={(e) => e.stopPropagation()}
                          className="mt-1"
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          {thread.pinned && (
                            <Pin className="w-3 h-3 text-yellow-600 flex-shrink-0" />
                          )}
                          <span
                            className={cn(
                              "font-medium truncate",
                              isUnread && "font-semibold"
                            )}
                          >
                            {thread.lead.name}
                          </span>
                          {isUnread && (
                            <span className="w-2 h-2 bg-blue-500 rounded-full flex-shrink-0" />
                          )}
                        </div>

                        <div className="flex items-center gap-2 mb-1">
                          {statusBadge && (
                            <span
                              className={cn(
                                "text-xs px-1.5 py-0.5 rounded",
                                statusBadge.className
                              )}
                            >
                              {statusBadge.label}
                            </span>
                          )}
                          {thread.has_notes && (
                            <FileText className="w-3 h-3 text-gray-400" />
                          )}
                          {thread.suppressed && (
                            <span className="text-xs text-gray-400">🛑</span>
                          )}
                        </div>

                        <p className="text-xs text-gray-600 line-clamp-2 mb-1">
                          {thread.snippet || "No preview"}
                        </p>

                        <span className="text-xs text-gray-400">
                          {formatTime(thread.last_message_at)}
                        </span>
                      </div>

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onPinThread(thread.id, !thread.pinned);
                        }}
                        className="p-1 hover:bg-gray-200 rounded transition-colors flex-shrink-0"
                      >
                        {thread.pinned ? (
                          <Pin className="w-4 h-4 text-yellow-600" />
                        ) : (
                          <PinOff className="w-4 h-4 text-gray-400" />
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
            
            {/* Load More Button */}
            {hasMore && (
              <div className="p-4 border-t">
                <button
                  onClick={onLoadMore}
                  disabled={loadingMore}
                  className={cn(
                    "w-full px-4 py-2 text-sm font-medium rounded-md transition-colors",
                    loadingMore
                      ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                      : "bg-blue-50 text-blue-700 hover:bg-blue-100"
                  )}
                >
                  {loadingMore ? "Loading..." : "Load More"}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

