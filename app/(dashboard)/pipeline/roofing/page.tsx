// Block 24260 — SmartSend Roofing Pipeline Page
// The Pipeline Roofers Have Always Needed — ZERO FLUFF

"use client";

import { RoofingPipelineBoard } from "@/components/pipeline/RoofingPipelineBoard";

export default function RoofingPipelinePage() {
  return (
    <div className="h-full overflow-auto p-6 bg-zinc-950">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-white mb-2">
          Roofing Job Pipeline
        </h1>
        <p className="text-sm text-zinc-400">
          Track every lead from first contact to completed installation. Drag and drop to move jobs between stages.
        </p>
      </div>

      <RoofingPipelineBoard />
    </div>
  );
}






































