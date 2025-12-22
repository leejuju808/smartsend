"use client";

import { useState } from "react";
import { ShareModal } from "./ShareModal";
import { ViewPicker } from "./ViewPicker";
import { ViewTable } from "./ViewTable";
import { QueueModal } from "./QueueModal";

export default function ViewsPage() {
  const [viewId, setViewId] = useState("");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <ViewPicker onChange={setViewId} />
        <div className="flex items-center gap-2">
          {viewId ? (
            <a
              href={`/api/saved-views/${viewId}/export`}
              className="btn btn-sm border px-3 py-1 rounded-md"
            >
              Export CSV
            </a>
          ) : null}
          {viewId ? <QueueModal viewId={viewId} /> : null}
          {viewId ? <ShareModal viewId={viewId} /> : null}
        </div>
      </div>
      <ViewTable viewId={viewId} />
    </div>
  );
}

