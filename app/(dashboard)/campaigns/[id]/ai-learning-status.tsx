"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";

interface ToneStat {
  tone: string;
  engagement_score: number;
  message_count: number;
  positive_rate: number;
  meeting_rate: number;
}

interface AILearningData {
  last_tuned: string | null;
  stats: ToneStat[];
}

export default function AILearningStatus({ campaignId }: { campaignId: string }) {
  const { data, error, isLoading } = useSWR<AILearningData>(
    `/api/campaigns/${campaignId}/ai-learning`,
    (url) => fetch(url).then((r) => r.json())
  );

  if (isLoading) {
    return (
      <div className="rounded-2xl border p-4">
        <h3 className="font-semibold mb-1">AI Learning Loop</h3>
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (error || !data) {
    return null;
  }

  return (
    <div className="rounded-2xl border p-4">
      <h3 className="font-semibold mb-1">AI Learning Loop</h3>
      <p className="text-sm text-muted-foreground mb-2">
        Last tuned: {data.last_tuned ? new Date(data.last_tuned).toLocaleString() : "—"}
      </p>
      {data.stats && data.stats.length > 0 ? (
        <div className="grid grid-cols-2 gap-2 text-sm">
          {data.stats.map((t) => (
            <div key={t.tone} className="p-2 rounded-xl border">
              <p className="font-semibold capitalize">{t.tone}</p>
              <p>Engagement Score: {(t.engagement_score * 100).toFixed(1)}%</p>
              <p>Samples: {t.message_count}</p>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No feedback data yet</p>
      )}
    </div>
  );
}















