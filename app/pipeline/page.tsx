"use client";

import { useEffect, useState } from "react";
import { PipelineColumn } from "@/components/pipeline/PipelineColumn";

const STAGES = [
  { id: "new", label: "New" },
  { id: "hot", label: "Hot" },
  { id: "appointment_set", label: "Appointment Set" },
  { id: "estimate_sent", label: "Estimate Sent" },
  { id: "won", label: "Won" },
  { id: "lost", label: "Lost" },
];

export default function PipelinePage() {
  const [summary, setSummary] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/pipeline")
      .then((r) => r.json())
      .then((s) => {
        setSummary(s);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Error loading pipeline:", err);
        setLoading(false);
      });
  }, []);

  return (
    <div className="space-y-6 p-6">
      <h1 className="text-xl font-bold text-white">📈 Sales Pipeline</h1>

      {loading && (
        <div className="text-gray-400 text-sm">Loading pipeline…</div>
      )}

      {!loading && (
        <div className="grid gap-4 overflow-x-auto pipeline-grid">
          <div className="grid grid-cols-3 lg:grid-cols-6 gap-4 min-w-max">
            {STAGES.map((stage) => (
              <PipelineColumn
                key={stage.id}
                stageId={stage.id}
                label={stage.label}
                count={summary[stage.id] ?? 0}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}










































