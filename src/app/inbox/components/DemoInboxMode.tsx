"use client";

import { Thread } from "../page";
import { ThreadList } from "./ThreadList";
import { ConversationView } from "./ConversationView";
import { Button } from "@/components/ui/button";
import { X, AlertCircle } from "lucide-react";
import { useState } from "react";
import { useRouter } from "next/navigation";

// Demo threads - in-memory only, not stored in DB
const demoThreads: Thread[] = [
  {
    id: "demo-1",
    contactId: null,
    campaignId: null,
    contactName: "Sarah Johnson",
    contactEmail: "sarah.j@example.com",
    contactCity: "Austin",
    contactState: "TX",
    contactPhone: "(512) 555-0123",
    intent: "hot",
    leadScore: 92,
    status: "open",
    lastMessageAt: new Date().toISOString(),
    lastMessagePreview: "Our roof started leaking last night after the wind storm. We need someone to come out ASAP.",
    lastMessageFrom: "sarah.j@example.com",
    createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "demo-2",
    contactId: null,
    campaignId: null,
    contactName: "Michael Chen",
    contactEmail: "mchen@example.com",
    contactCity: "Dallas",
    contactState: "TX",
    contactPhone: "(214) 555-0456",
    intent: "warm",
    leadScore: 76,
    status: "open",
    lastMessageAt: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
    lastMessagePreview: "We're talking to our insurance about a full replacement. What's your availability next week?",
    lastMessageFrom: "mchen@example.com",
    createdAt: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: "demo-3",
    contactId: null,
    campaignId: null,
    contactName: "Emily Rodriguez",
    contactEmail: "emily.r@example.com",
    contactCity: "Houston",
    contactState: "TX",
    contactPhone: "(713) 555-0789",
    intent: "follow_up",
    leadScore: 61,
    status: "open",
    lastMessageAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    lastMessagePreview: "We might do this in spring. What does pricing usually look like for a 2000 sq ft home?",
    lastMessageFrom: "emily.r@example.com",
    createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
  },
];

interface DemoInboxModeProps {
  onDismiss: () => void;
}

export function DemoInboxMode({ onDismiss }: DemoInboxModeProps) {
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const router = useRouter();

  const handleDismiss = async () => {
    try {
      const response = await fetch("/api/inbox/owner/tour", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dismissed: true }),
      });
      if (response.ok) {
        onDismiss();
      } else {
        onDismiss(); // Still dismiss even if API fails
      }
    } catch (error) {
      console.error("Error dismissing demo:", error);
      onDismiss(); // Still dismiss even if API fails
    }
  };

  const handleGoLive = () => {
    router.push("/campaigns/new");
  };

  return (
    <div className="flex h-screen flex-col bg-background">
      {/* Demo Banner */}
      <div className="border-b bg-yellow-50 px-6 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-yellow-600" />
            <p className="text-sm text-yellow-800">
              <span className="font-semibold">You're viewing sample data.</span>{" "}
              Launch a campaign and real leads will appear here automatically.
            </p>
          </div>
          <button
            onClick={handleDismiss}
            className="text-yellow-600 hover:text-yellow-800 text-sm font-medium"
          >
            Hide sample data
          </button>
        </div>
      </div>

      {/* Main Content - Split Pane */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Panel - Thread List */}
        <div className="w-[35%] border-r overflow-y-auto bg-white">
          <ThreadList
            threads={demoThreads}
            selectedThreadId={selectedThreadId}
            onSelectThread={setSelectedThreadId}
          />
        </div>

        {/* Right Panel - Conversation View */}
        <div className="flex-1 overflow-y-auto bg-gray-50">
          {selectedThreadId ? (
            <div className="p-6">
              <div className="bg-white rounded-lg border p-6 mb-4">
                <h3 className="text-lg font-semibold mb-2">AI Summary</h3>
                <p className="text-sm text-gray-600 mb-4">
                  {selectedThreadId === "demo-1" &&
                    "Homeowner reports urgent roof leak after wind storm. High urgency - needs immediate attention. Insurance claim likely."}
                  {selectedThreadId === "demo-2" &&
                    "Homeowner is working with insurance on full roof replacement. Ready to schedule estimate next week. Strong lead."}
                  {selectedThreadId === "demo-3" &&
                    "Homeowner considering spring project. Asking about pricing for 2000 sq ft home. Warm lead, needs follow-up."}
                </p>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" disabled>
                    Call
                  </Button>
                  <Button size="sm" variant="outline" disabled>
                    Send Estimate
                  </Button>
                  <Button size="sm" variant="outline" disabled>
                    Mark as Booked
                  </Button>
                </div>
                <p className="text-xs text-gray-500 mt-4 italic">
                  This is how it'll work with real leads
                </p>
              </div>
              <div className="bg-white rounded-lg border p-6">
                <h4 className="font-semibold mb-2">Sample Conversation</h4>
                <div className="space-y-4">
                  {selectedThreadId === "demo-1" && (
                    <>
                      <div className="bg-blue-50 p-3 rounded">
                        <p className="text-sm">
                          Our roof started leaking last night after the wind storm.
                          We need someone to come out ASAP. Can you help?
                        </p>
                        <p className="text-xs text-gray-500 mt-1">Sarah Johnson • 2 hours ago</p>
                      </div>
                    </>
                  )}
                  {selectedThreadId === "demo-2" && (
                    <>
                      <div className="bg-blue-50 p-3 rounded">
                        <p className="text-sm">
                          We're talking to our insurance about a full replacement.
                          What's your availability next week?
                        </p>
                        <p className="text-xs text-gray-500 mt-1">Michael Chen • 5 hours ago</p>
                      </div>
                    </>
                  )}
                  {selectedThreadId === "demo-3" && (
                    <>
                      <div className="bg-blue-50 p-3 rounded">
                        <p className="text-sm">
                          We might do this in spring. What does pricing usually look
                          like for a 2000 sq ft home?
                        </p>
                        <p className="text-xs text-gray-500 mt-1">Emily Rodriguez • 1 day ago</p>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              <p>Select a thread to view conversation</p>
            </div>
          )}
        </div>
      </div>

      {/* Bottom CTA */}
      <div className="border-t bg-white px-6 py-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-600">
            Ready to see real leads? Connect your campaigns and start receiving replies.
          </p>
          <Button onClick={handleGoLive}>Connect My Campaigns & Go Live</Button>
        </div>
      </div>
    </div>
  );
}

