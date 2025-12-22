"use client";

// Block 28060 — Homeowner Detail Component

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";

interface Homeowner {
  id: string;
  referral_code: string;
  referrals_count: number;
  reviews_requested: number;
  reviews_completed: number;
  lead: {
    id: string;
    email: string;
    first_name: string | null;
    last_name: string | null;
    phone: string | null;
  } | null;
}

export function HomeownerDetail({
  homeownerId,
  workspaceId,
}: {
  homeownerId: string;
  workspaceId: string;
}) {
  const [homeowner, setHomeowner] = useState<Homeowner | null>(null);
  const [loading, setLoading] = useState(true);
  const [sendingReview, setSendingReview] = useState(false);

  useEffect(() => {
    fetchHomeowner();
  }, [homeownerId]);

  const fetchHomeowner = async () => {
    try {
      const response = await fetch(`/api/review-referral/homeowners/${homeownerId}`);
      const data = await response.json();
      if (data.ok) {
        setHomeowner(data.homeowner);
      }
    } catch (error) {
      console.error("Error fetching homeowner:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleRequestReview = async () => {
    if (!homeowner || !homeowner.lead) return;

    setSendingReview(true);
    try {
      const response = await fetch("/api/review-referral/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          homeowner_id: homeowner.id,
          lead_id: homeowner.lead.id,
        }),
      });

      const data = await response.json();
      if (data.ok) {
        alert("Review request sent successfully!");
        fetchHomeowner();
      } else {
        alert(`Error: ${data.error}`);
      }
    } catch (error) {
      console.error("Error sending review request:", error);
      alert("Failed to send review request");
    } finally {
      setSendingReview(false);
    }
  };

  if (loading) {
    return <div className="text-center py-8">Loading...</div>;
  }

  if (!homeowner) {
    return <div className="text-center py-8">Homeowner not found</div>;
  }

  const name = homeowner.lead
    ? `${homeowner.lead.first_name || ""} ${homeowner.lead.last_name || ""}`.trim() || homeowner.lead.email
    : "Unknown";

  const referralLink = `${process.env.NEXT_PUBLIC_APP_URL || "https://smartsendhq.com"}/r/${homeowner.referral_code}`;

  return (
    <div className="space-y-6">
      {/* Contact Info */}
      <div className="bg-white rounded-lg border p-6">
        <h2 className="text-lg font-semibold mb-4">Contact Information</h2>
        <div className="space-y-2">
          <div>
            <span className="text-sm text-muted-foreground">Name:</span>
            <span className="ml-2 font-medium">{name}</span>
          </div>
          {homeowner.lead?.email && (
            <div>
              <span className="text-sm text-muted-foreground">Email:</span>
              <span className="ml-2 font-medium">{homeowner.lead.email}</span>
            </div>
          )}
          {homeowner.lead?.phone && (
            <div>
              <span className="text-sm text-muted-foreground">Phone:</span>
              <span className="ml-2 font-medium">{homeowner.lead.phone}</span>
            </div>
          )}
        </div>
      </div>

      {/* Referral Link */}
      <div className="bg-white rounded-lg border p-6">
        <h2 className="text-lg font-semibold mb-4">Referral Link</h2>
        <div className="space-y-4">
          <div>
            <label className="text-sm text-muted-foreground">Share this link:</label>
            <div className="mt-2 flex gap-2">
              <input
                type="text"
                readOnly
                value={referralLink}
                className="flex-1 px-3 py-2 border rounded-md bg-gray-50"
              />
              <Button
                onClick={() => {
                  navigator.clipboard.writeText(referralLink);
                  alert("Link copied to clipboard!");
                }}
              >
                Copy
              </Button>
            </div>
          </div>
          <div>
            <label className="text-sm text-muted-foreground">Referral Code:</label>
            <div className="mt-2">
              <code className="text-sm bg-gray-100 px-3 py-2 rounded block">
                {homeowner.referral_code}
              </code>
            </div>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-lg border p-6">
          <div className="text-sm text-muted-foreground">Referrals</div>
          <div className="text-2xl font-bold mt-2">{homeowner.referrals_count}</div>
        </div>
        <div className="bg-white rounded-lg border p-6">
          <div className="text-sm text-muted-foreground">Reviews Requested</div>
          <div className="text-2xl font-bold mt-2">{homeowner.reviews_requested}</div>
        </div>
        <div className="bg-white rounded-lg border p-6">
          <div className="text-sm text-muted-foreground">Reviews Completed</div>
          <div className="text-2xl font-bold mt-2">{homeowner.reviews_completed}</div>
        </div>
      </div>

      {/* Actions */}
      <div className="bg-white rounded-lg border p-6">
        <h2 className="text-lg font-semibold mb-4">Actions</h2>
        <div className="space-y-2">
          <Button
            onClick={handleRequestReview}
            disabled={sendingReview || !homeowner.lead}
          >
            {sendingReview ? "Sending..." : "Request Review"}
          </Button>
        </div>
      </div>
    </div>
  );
}


































