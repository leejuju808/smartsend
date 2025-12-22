// Block 20280 — Lead Tags Card

"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tag as TagIcon } from "lucide-react";

type Tag = {
  id: string;
  label: string;
  color?: string | null;
  category?: string | null;
};

interface LeadTagsCardProps {
  conversationId: string;
  initialTags?: Tag[]; // optional, if you preload via join
  onUpdated?: (tags: Tag[]) => void;
}

export function LeadTagsCard({
  conversationId,
  initialTags,
  onUpdated,
}: LeadTagsCardProps) {
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>(
    initialTags?.map((t) => t.id) ?? []
  );
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);

  async function loadTags() {
    setLoading(true);
    try {
      const res = await fetch("/api/lead-tags");
      if (!res.ok) {
        throw new Error("Failed to load tags");
      }
      const json = await res.json();
      setAllTags(json.tags ?? []);
    } catch (error) {
      console.error("Error loading tags:", error);
    } finally {
      setLoading(false);
    }
  }

  async function loadConversationTags() {
    // Load current tags for this conversation
    // This is a simple approach - in a later block, you can preload via join
    try {
      // For now, we'll rely on initialTags prop or fetch separately
      // In a future version, this could be part of the thread query
    } catch (error) {
      console.error("Error loading conversation tags:", error);
    }
  }

  async function saveSelection() {
    setSaving(true);
    try {
      const res = await fetch("/api/inbox/conversation-tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversation_id: conversationId,
          tag_ids: selectedIds,
        }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to save tags");
      }

      const json = await res.json();
      setSaving(false);

      if (json?.tags && onUpdated) {
        onUpdated(json.tags);
      }
    } catch (error: any) {
      console.error("Failed to save tags:", error);
      setSaving(false);
      alert(`Failed to save tags: ${error.message}`);
    }
  }

  function toggleTag(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  useEffect(() => {
    loadTags();
    loadConversationTags();
  }, []);

  // Update selectedIds when initialTags changes
  useEffect(() => {
    if (initialTags) {
      setSelectedIds(initialTags.map((t) => t.id));
    }
  }, [initialTags]);

  const selectedTags = allTags.filter((t) => selectedIds.includes(t.id));

  return (
    <Card className="border-l-4 border-l-purple-500">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-100 rounded-lg">
              <TagIcon className="w-5 h-5 text-purple-600" />
            </div>
            <div className="flex-1">
              <CardTitle className="text-base font-semibold">Lead tags</CardTitle>
              <p className="text-xs text-gray-500 mt-1">Classify this lead</p>
            </div>
          </div>
          {(saving || loading) && (
            <span className="text-[10px] text-gray-400">
              {saving ? "Saving…" : "Loading…"}
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {allTags.length === 0 && !loading && (
          <p className="text-[11px] text-gray-400">
            No tags yet. Create some under Settings → Lead tags.
          </p>
        )}

        {allTags.length > 0 && (
          <>
            <div className="flex flex-wrap gap-1.5 text-[11px]">
              {allTags.map((t) => {
                const active = selectedIds.includes(t.id);
                const baseColor =
                  t.color === "red"
                    ? "border-red-200 text-red-700 bg-red-50"
                    : t.color === "amber"
                    ? "border-amber-200 text-amber-700 bg-amber-50"
                    : t.color === "green"
                    ? "border-emerald-200 text-emerald-700 bg-emerald-50"
                    : t.color === "blue"
                    ? "border-blue-200 text-blue-700 bg-blue-50"
                    : "border-slate-200 text-slate-700 bg-slate-50";

                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => toggleTag(t.id)}
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border transition-colors ${
                      active
                        ? baseColor + " font-semibold"
                        : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"
                    }`}
                  >
                    <span className="truncate max-w-[120px]">{t.label}</span>
                  </button>
                );
              })}
            </div>

            <div className="flex justify-end pt-1">
              <Button
                type="button"
                onClick={saveSelection}
                disabled={saving}
                variant="outline"
                size="sm"
                className="px-3 py-1 rounded-full text-[11px] disabled:opacity-50"
              >
                Save tags
              </Button>
            </div>

            {selectedTags.length > 0 && (
              <div className="pt-1 border-t mt-1">
                <p className="text-[10px] text-gray-400 mb-1">
                  Applied to this lead:
                </p>
                <div className="flex flex-wrap gap-1">
                  {selectedTags.map((t) => (
                    <span
                      key={t.id}
                      className="inline-flex items-center px-2 py-0.5 rounded-full bg-gray-900 text-white text-[10px]"
                    >
                      {t.label}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

