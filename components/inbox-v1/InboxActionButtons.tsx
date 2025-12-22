// Block 19600 — SmartSend Owner Inbox v1
// One-tap action buttons: Call Now, Send Estimate Link, Mark as Booked, Add Task, Add to CRM

"use client";

import { useState } from "react";

interface InboxActionButtonsProps {
  threadId: string;
}

export default function InboxActionButtons({ threadId }: InboxActionButtonsProps) {
  const [loading, setLoading] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  async function handleAction(action: string) {
    setLoading(action);
    setResult(null);
    try {
      const res = await fetch(`/api/inbox/replies/${threadId}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });

      const data = await res.json();
      if (res.ok) {
        setResult(data.message || "Action completed successfully");
        
        // Handle specific actions
        if (action === "call_now" && data.phone) {
          window.open(`tel:${data.phone}`, "_self");
        } else if (action === "send_estimate_link" && data.estimateLink) {
          // Copy to clipboard or open link
          navigator.clipboard.writeText(data.estimateLink);
          setResult(`Estimate link copied: ${data.estimateLink}`);
        }
      } else {
        setResult(data.error || "Action failed");
      }
    } catch (error: any) {
      setResult(error.message || "Action failed");
    } finally {
      setLoading(null);
      setTimeout(() => setResult(null), 5000);
    }
  }

  const buttons = [
    {
      action: "call_now",
      label: "Call Now",
      icon: "📞",
      color: "bg-green-500 hover:bg-green-600",
    },
    {
      action: "send_estimate_link",
      label: "Send Estimate",
      icon: "💰",
      color: "bg-blue-500 hover:bg-blue-600",
    },
    {
      action: "mark_as_booked",
      label: "Mark Booked",
      icon: "✅",
      color: "bg-purple-500 hover:bg-purple-600",
    },
    {
      action: "add_task",
      label: "Add Task",
      icon: "📋",
      color: "bg-orange-500 hover:bg-orange-600",
    },
    {
      action: "add_to_crm",
      label: "Add to CRM",
      icon: "🔗",
      color: "bg-indigo-500 hover:bg-indigo-600",
    },
  ];

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {buttons.map((btn) => (
          <button
            key={btn.action}
            onClick={() => handleAction(btn.action)}
            disabled={loading === btn.action}
            className={`${btn.color} text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2`}
          >
            <span>{btn.icon}</span>
            <span>{btn.label}</span>
            {loading === btn.action && (
              <span className="animate-spin">⏳</span>
            )}
          </button>
        ))}
      </div>
      {result && (
        <div className={`text-sm p-2 rounded ${
          result.includes("failed") || result.includes("error")
            ? "bg-red-50 text-red-700"
            : "bg-green-50 text-green-700"
        }`}>
          {result}
        </div>
      )}
    </div>
  );
}



















































