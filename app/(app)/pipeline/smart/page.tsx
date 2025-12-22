// Block 22085 — SmartSend Roofing Smart Pipeline Board v2
// The intelligent, auto-prioritized, AI-enhanced pipeline every roofer DREAMS of

"use client";

import { SmartPipelineBoard } from "@/components/pipeline/SmartPipelineBoard";

export default function SmartPipelinePage() {
  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Smart Pipeline Board v2</h1>
          <p className="text-sm text-gray-400 mt-1">
            The intelligent, revenue-driven pipeline board that sorts jobs by priority to win revenue.
            All your SmartSend intelligence in one place.
          </p>
        </div>
      </div>

      <SmartPipelineBoard />
    </div>
  );
}









































