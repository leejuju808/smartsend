// Block 16600 — SmartSend Activity Log v2
// Company-Level Activity Stream Page (Mission Control Feed)

"use client";

import { useState } from "react";
import { ActivityFeed } from "@/components/activity/ActivityFeed";
import { useActivityLogs } from "@/lib/hooks/useActivityLogs";
import { ActivityLog } from "@/components/activity/ActivityFeed";

export default function ActivityPage() {
  const [filters, setFilters] = useState({
    category: "",
    severity: "",
  });
  const [cursor, setCursor] = useState<string | null>(null);

  const { logs, pagination, loading, error, mutate } = useActivityLogs({
    category: filters.category || undefined,
    severity: filters.severity || undefined,
    cursor: cursor || undefined,
    limit: 50,
  });

  const handleLoadMore = () => {
    if (pagination?.nextCursor) {
      setCursor(pagination.nextCursor);
    }
  };

  if (error) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-sm text-red-600">Error loading activity logs</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Activity Log
          </h1>
          <p className="text-gray-600">
            Complete audit trail of all SmartSend activity — messages, pipeline moves, tasks, storms, insurance signals, and more.
          </p>
        </div>

        {/* Activity Feed */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <ActivityFeed
            logs={logs}
            loading={loading}
            onLoadMore={handleLoadMore}
            hasMore={pagination?.hasMore || false}
          />
        </div>

        {/* Stats Summary */}
        <div className="mt-8 grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
            <div className="text-sm text-gray-500 mb-1">Total Events</div>
            <div className="text-2xl font-bold text-gray-900">{logs.length}</div>
          </div>
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
            <div className="text-sm text-gray-500 mb-1">Urgent</div>
            <div className="text-2xl font-bold text-red-600">
              {logs.filter((l) => l.severity === "urgent").length}
            </div>
          </div>
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
            <div className="text-sm text-gray-500 mb-1">Important</div>
            <div className="text-2xl font-bold text-yellow-600">
              {logs.filter((l) => l.severity === "important").length}
            </div>
          </div>
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
            <div className="text-sm text-gray-500 mb-1">Success</div>
            <div className="text-2xl font-bold text-green-600">
              {logs.filter((l) => l.severity === "success").length}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}





















































