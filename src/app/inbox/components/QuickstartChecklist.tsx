"use client";

import { useState, useEffect } from "react";
import { CheckCircle2, Circle, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { isCoachingUIEnabled } from "@/lib/feature-flags";

interface ChecklistItem {
  id: string;
  label: string;
  link: string;
  completed: boolean;
}

interface QuickstartChecklistProps {
  setupStatus: {
    hasEmailConnected: boolean;
    hasCampaigns: boolean;
    hasReplies: boolean;
    isLive: boolean;
    email: string | null;
  };
}

export function QuickstartChecklist({ setupStatus }: QuickstartChecklistProps) {
  // BLOCK 272500 — Internalization Sprint: no coaching UI by default.
  if (!isCoachingUIEnabled()) return null;

  const router = useRouter();
  const [isOpen, setIsOpen] = useState(true);

  // Build checklist items based on setup status
  const checklistItems: ChecklistItem[] = [
    {
      id: "connect-email",
      label: "Connect your sending email",
      link: "/settings/email",
      completed: setupStatus.hasEmailConnected,
    },
    {
      id: "create-campaign",
      label: "Create your first roofing campaign",
      link: "/campaigns/new",
      completed: setupStatus.hasCampaigns,
    },
    {
      id: "import-contacts",
      label: "Import 50–100 local homeowners",
      link: "/contacts/import",
      completed: false, // Would need to check contacts count
    },
    {
      id: "send-test",
      label: "Send a test to yourself",
      link: "/campaigns/new",
      completed: false, // Would need to check if test was sent
    },
    {
      id: "watch-reply",
      label: "Watch your reply appear in this Inbox",
      link: "/inbox",
      completed: setupStatus.hasReplies,
    },
  ];

  const allCompleted = checklistItems.every((item) => item.completed);

  if (allCompleted) {
    return null; // Hide checklist when all items are complete
  }

  return (
    <div className="border-l bg-white p-4 w-80 overflow-y-auto">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-gray-900">Quickstart Checklist</h3>
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="text-gray-400 hover:text-gray-600 text-xs"
        >
          {isOpen ? "Hide" : "Show"}
        </button>
      </div>

      {isOpen && (
        <div className="space-y-3">
          {checklistItems.map((item) => (
            <div
              key={item.id}
              className={cn(
                "flex items-start gap-2 text-sm",
                item.completed && "opacity-60"
              )}
            >
              {item.completed ? (
                <CheckCircle2 className="h-4 w-4 text-green-600 flex-shrink-0 mt-0.5" />
              ) : (
                <Circle className="h-4 w-4 text-gray-300 flex-shrink-0 mt-0.5" />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1">
                  <span
                    className={cn(
                      item.completed
                        ? "text-gray-500 line-through"
                        : "text-gray-700"
                    )}
                  >
                    {item.label}
                  </span>
                  {!item.completed && (
                    <button
                      onClick={() => router.push(item.link)}
                      className="text-primary hover:text-primary/80 text-xs flex items-center gap-1"
                    >
                      Go
                      <ExternalLink className="h-3 w-3" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}



















































