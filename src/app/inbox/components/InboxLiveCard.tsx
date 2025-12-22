"use client";

import { Button } from "@/components/ui/button";
import { CheckCircle2, Circle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";

interface InboxLiveCardProps {
  setupStatus: {
    hasEmailConnected: boolean;
    hasCampaigns: boolean;
    hasReplies: boolean;
    isLive: boolean;
    email: string | null;
  };
}

export function InboxLiveCard({ setupStatus }: InboxLiveCardProps) {
  const router = useRouter();
  const [isVisible, setIsVisible] = useState(true);

  // Hide card once user has replies
  useEffect(() => {
    if (setupStatus.hasReplies) {
      setIsVisible(false);
    }
  }, [setupStatus.hasReplies]);

  if (!isVisible || !setupStatus.isLive) {
    return null;
  }

  return (
    <div className="border-b bg-gradient-to-r from-green-50 to-blue-50 px-6 py-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle2 className="h-6 w-6 text-green-600" />
              <h2 className="text-xl font-bold text-gray-900">
                Your SmartSend Inbox Is Live ✅
              </h2>
            </div>
            <p className="text-sm text-gray-600 mb-4">
              Any homeowner who replies to your campaigns will appear here automatically.
            </p>

            {/* Mini Checklist */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm">
                <CheckCircle2 className="h-4 w-4 text-green-600 flex-shrink-0" />
                <span className="text-gray-700">Sending email connected</span>
                {setupStatus.email && (
                  <span className="text-xs text-gray-500">
                    ({setupStatus.email})
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 text-sm">
                <CheckCircle2 className="h-4 w-4 text-green-600 flex-shrink-0" />
                <span className="text-gray-700">Reply capture active</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <CheckCircle2 className="h-4 w-4 text-green-600 flex-shrink-0" />
                <span className="text-gray-700">AI lead scoring ready</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                {setupStatus.hasCampaigns ? (
                  <CheckCircle2 className="h-4 w-4 text-green-600 flex-shrink-0" />
                ) : (
                  <Circle className="h-4 w-4 text-gray-400 flex-shrink-0" />
                )}
                <span
                  className={
                    setupStatus.hasCampaigns
                      ? "text-gray-700"
                      : "text-gray-500"
                  }
                >
                  Launch first campaign
                </span>
              </div>
            </div>
          </div>

          {!setupStatus.hasCampaigns && (
            <Button
              onClick={() => router.push("/campaigns/new")}
              className="ml-4"
            >
              Launch My First Campaign
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}



















































