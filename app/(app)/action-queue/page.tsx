// Block 21900 — SmartSend Roofing Action Queue Page v1
// "Do This Next" List for Owners & Estimators — Zero Guesswork, All Money

"use client";

import { ActionQueue } from "@/components/action-queue/ActionQueue";

export default function ActionQueuePage() {
  return (
    <div className="min-h-screen bg-gray-950">
      <div className="max-w-6xl mx-auto py-6">
        <ActionQueue assignedTo="me" limit={50} />
      </div>
    </div>
  );
}









































