// Block 14000 — SmartSend Pipeline Board v1
// The Visual Kanban Board That Shows Roofers EXACTLY Where Every Lead Is

"use client";

import { PipelineBoardV1 } from "@/components/pipeline/PipelineBoardV1";
import Link from "next/link";

export default function PipelinePage() {
  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Pipeline Board</h1>
          <p className="text-sm text-gray-600 mt-1">
            Visual Kanban board showing exactly where every lead is in your sales pipeline.
            Drag & drop leads between stages to organize your sales process.
          </p>
        </div>
        <Link
          href="/contacts"
          className="text-sm px-4 py-2 rounded-lg border hover:bg-gray-50 transition-colors"
        >
          View all contacts
        </Link>
      </div>

      <PipelineBoardV1 />
    </div>
  );
}


