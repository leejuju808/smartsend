"use client";

import { useEffect, useState } from "react";
import { Button } from "@/src/components/ui/Button";

interface Lead {
  id: string;
  email: string;
  first_name?: string;
  last_name?: string;
  company?: string;
  phone?: string;
  status?: string;
}

interface MergeQueueItem {
  id: string;
  created_at: string;
  reason: string;
  status: string;
  lead_a: Lead;
  lead_b: Lead;
}

export default function MergeReviewPage() {
  const [items, setItems] = useState<MergeQueueItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/merge/list");
      const json = await res.json();
      setItems(json.items ?? []);
    } catch (error) {
      console.error("Error loading merge queue:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const resolve = async (primary: string, secondary: string) => {
    try {
      const res = await fetch("/api/merge/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ primaryId: primary, secondaryId: secondary }),
      });

      if (!res.ok) {
        const error = await res.json();
        alert(`Error: ${error.error || "Failed to merge"}`);
        return;
      }

      await load();
    } catch (error) {
      console.error("Error resolving merge:", error);
      alert("Failed to merge leads");
    }
  };

  const ignore = async (id: string) => {
    try {
      const res = await fetch("/api/merge/ignore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });

      if (!res.ok) {
        const error = await res.json();
        alert(`Error: ${error.error || "Failed to ignore"}`);
        return;
      }

      await load();
    } catch (error) {
      console.error("Error ignoring merge:", error);
      alert("Failed to ignore merge");
    }
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="text-sm text-gray-500">Loading merge queue...</div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Merge Review Queue</h1>
        <Button size="sm" variant="outline" onClick={load}>
          Refresh
        </Button>
      </div>

      {items.length === 0 ? (
        <div className="border rounded-lg p-8 text-center text-gray-500">
          <p className="text-lg font-medium mb-2">No pending merges</p>
          <p className="text-sm">All duplicate leads have been reviewed.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {items.map((i) => (
            <div
              key={i.id}
              className="border border-gray-200 rounded-lg p-4 bg-white shadow-sm"
            >
              <div className="text-xs mb-3 text-gray-500 font-medium">
                Reason: <span className="text-gray-700">{i.reason}</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                {/* Lead A */}
                <div className="border border-gray-200 rounded p-3 space-y-2 bg-gray-50">
                  <div className="font-medium text-sm text-gray-700">Lead A</div>
                  <div className="text-sm">
                    <div className="font-medium text-gray-900">
                      {i.lead_a.email}
                    </div>
                    {(i.lead_a.first_name || i.lead_a.last_name) && (
                      <div className="text-gray-600 mt-1">
                        {i.lead_a.first_name} {i.lead_a.last_name}
                      </div>
                    )}
                    {i.lead_a.company && (
                      <div className="text-gray-600 mt-1">{i.lead_a.company}</div>
                    )}
                    {i.lead_a.phone && (
                      <div className="text-gray-600 mt-1">{i.lead_a.phone}</div>
                    )}
                    {i.lead_a.status && (
                      <div className="mt-1">
                        <span className="inline-block px-2 py-0.5 text-xs rounded bg-gray-200 text-gray-700">
                          {i.lead_a.status}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Lead B */}
                <div className="border border-gray-200 rounded p-3 space-y-2 bg-gray-50">
                  <div className="font-medium text-sm text-gray-700">Lead B</div>
                  <div className="text-sm">
                    <div className="font-medium text-gray-900">
                      {i.lead_b.email}
                    </div>
                    {(i.lead_b.first_name || i.lead_b.last_name) && (
                      <div className="text-gray-600 mt-1">
                        {i.lead_b.first_name} {i.lead_b.last_name}
                      </div>
                    )}
                    {i.lead_b.company && (
                      <div className="text-gray-600 mt-1">{i.lead_b.company}</div>
                    )}
                    {i.lead_b.phone && (
                      <div className="text-gray-600 mt-1">{i.lead_b.phone}</div>
                    )}
                    {i.lead_b.status && (
                      <div className="mt-1">
                        <span className="inline-block px-2 py-0.5 text-xs rounded bg-gray-200 text-gray-700">
                          {i.lead_b.status}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex gap-2 flex-wrap">
                <Button
                  size="sm"
                  variant="default"
                  onClick={() => resolve(i.lead_a.id, i.lead_b.id)}
                >
                  Keep A, Merge B into A
                </Button>

                <Button
                  size="sm"
                  variant="default"
                  onClick={() => resolve(i.lead_b.id, i.lead_a.id)}
                >
                  Keep B, Merge A into B
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => ignore(i.id)}
                >
                  Ignore
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}












