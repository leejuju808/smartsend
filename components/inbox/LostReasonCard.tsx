// Block 20230 — Lost Reason Card

"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertCircle } from "lucide-react";

interface LostReasonCardProps {
  conversationId: string;
  leadStage?: string | null;
  initialCategory?: string | null;
  initialDetail?: string | null;
  initialCompetitorName?: string | null;
  initialCompetitorBid?: number | null;
  onUpdated?: (patch: any) => void;
}

export function LostReasonCard({
  conversationId,
  leadStage,
  initialCategory,
  initialDetail,
  initialCompetitorName,
  initialCompetitorBid,
  onUpdated,
}: LostReasonCardProps) {
  const [category, setCategory] = useState(initialCategory || "");
  const [detail, setDetail] = useState(initialDetail || "");
  const [competitorName, setCompetitorName] = useState(
    initialCompetitorName || ""
  );
  const [competitorBid, setCompetitorBid] = useState(
    initialCompetitorBid ? String(initialCompetitorBid) : ""
  );
  const [saving, setSaving] = useState(false);

  const isLost = leadStage === "lost";

  async function save() {
    if (!category) return;
    setSaving(true);
    try {
      const res = await fetch("/api/inbox/lost-reason", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversation_id: conversationId,
          lost_reason_category: category,
          lost_reason_detail: detail || null,
          lost_to_competitor_name: competitorName || null,
          lost_to_competitor_bid: competitorBid ? Number(competitorBid) : null,
        }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to save lost reason");
      }

      const json = await res.json();
      setSaving(false);

      if (json?.conversation && onUpdated) {
        onUpdated(json.conversation);
      }
    } catch (error) {
      console.error("Failed to save lost reason:", error);
      setSaving(false);
      alert("Failed to save lost reason. Please try again.");
    }
  }

  return (
    <Card className="border-l-4 border-l-red-500">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-red-100 rounded-lg">
              <AlertCircle className="w-5 h-5 text-red-600" />
            </div>
            <div className="flex-1">
              <CardTitle className="text-base font-semibold">Lost reason</CardTitle>
              <p className="text-xs text-gray-500 mt-1">
                Track why jobs are lost
              </p>
            </div>
          </div>
          {saving && (
            <span className="text-[10px] text-gray-400">Saving…</span>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {!isLost && (
          <p className="text-[11px] text-gray-400">
            When this job is lost, record why so you can improve your close
            rate over time.
          </p>
        )}

        <div className="space-y-2 text-xs">
          <div>
            <label className="block text-[11px] text-gray-500 mb-1">
              Category
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full border rounded-lg px-2 py-1 bg-white text-xs focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
            >
              <option value="">Select reason</option>
              <option value="price">Price too high</option>
              <option value="chose_competitor">Chose another roofer</option>
              <option value="timing">Timing / schedule</option>
              <option value="insurance_denied">Insurance denied</option>
              <option value="other">Other</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] text-gray-500 mb-1">
              Details (optional)
            </label>
            <textarea
              value={detail}
              onChange={(e) => setDetail(e.target.value)}
              rows={2}
              className="w-full border rounded-lg px-2 py-1 text-[11px] resize-none focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
              placeholder="e.g. 'Other roofer was $2,500 cheaper' or 'decided to wait until next year'"
            />
          </div>

          <div>
            <label className="block text-[11px] text-gray-500 mb-1">
              Competitor (optional)
            </label>
            <input
              type="text"
              value={competitorName}
              onChange={(e) => setCompetitorName(e.target.value)}
              className="w-full border rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
              placeholder="Name of roofing company"
            />
          </div>

          <div>
            <label className="block text-[11px] text-gray-500 mb-1">
              Competitor bid ($)
            </label>
            <input
              type="number"
              min={0}
              value={competitorBid}
              onChange={(e) => setCompetitorBid(e.target.value)}
              className="w-full border rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
              placeholder="If homeowner shared their price"
            />
          </div>
        </div>

        <div className="flex justify-end">
          <Button
            type="button"
            onClick={save}
            disabled={!category || saving}
            size="sm"
            className="px-3 py-1 rounded-full border border-gray-300 hover:border-black text-xs disabled:opacity-50"
            variant="outline"
          >
            {saving ? "Saving…" : "Save lost reason"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

















































