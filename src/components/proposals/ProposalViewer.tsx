// Block 32711 — SmartSend Roofing "AI Proposal Builder + Dynamic Contract Generator" v1
// Component: Proposal Viewer with Engagement Tracking

"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import ReactMarkdown from "react-markdown";

interface ProposalViewerProps {
  proposal: any;
  onConvertToContract?: () => void;
  onEdit?: () => void;
}

export function ProposalViewer({
  proposal,
  onConvertToContract,
  onEdit,
}: ProposalViewerProps) {
  const [trackingInitialized, setTrackingInitialized] = useState(false);

  useEffect(() => {
    // Track proposal view
    if (proposal?.id && !trackingInitialized) {
      trackEngagement("opened");
      setTrackingInitialized(true);
    }
  }, [proposal?.id, trackingInitialized]);

  const trackEngagement = async (eventType: string, section?: string) => {
    try {
      await fetch(`/api/proposals/${proposal.id}/track`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          event_type: eventType,
          section,
        }),
      });
    } catch (error) {
      console.error("Failed to track engagement:", error);
    }
  };

  const handleSectionView = (section: string) => {
    trackEngagement("section_viewed", section);
  };

  const handleFinancingClick = () => {
    trackEngagement("financing_clicked");
  };

  const handleWarrantyView = () => {
    trackEngagement("warranty_viewed");
  };

  if (!proposal) {
    return <div>Loading proposal...</div>;
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="mb-6 flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">{proposal.title || "Proposal"}</h1>
          <p className="text-gray-600 mt-2">
            Status: <span className="font-semibold">{proposal.status}</span>
            {proposal.viewed_at && (
              <span className="ml-4">
                Viewed: {new Date(proposal.viewed_at).toLocaleDateString()}
              </span>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          {onEdit && (
            <Button variant="outline" onClick={onEdit}>
              Edit
            </Button>
          )}
          {onConvertToContract && proposal.status !== "signed" && (
            <Button onClick={onConvertToContract}>
              Convert to Contract
            </Button>
          )}
        </div>
      </div>

      <div
        className="proposal-content prose max-w-none"
        onScroll={() => handleSectionView("content")}
      >
        {proposal.content ? (
          <ReactMarkdown>{proposal.content}</ReactMarkdown>
        ) : (
          <div className="text-gray-500">No content available</div>
        )}
      </div>

      {proposal.price && (
        <div
          className="mt-8 p-6 bg-blue-50 rounded-lg"
          onMouseEnter={() => handleSectionView("pricing")}
        >
          <h2 className="text-2xl font-bold mb-2">Investment</h2>
          <p className="text-3xl font-bold text-blue-600">
            ${proposal.price.toLocaleString()}
          </p>
        </div>
      )}

      {proposal.warranty_details && (
        <div
          className="mt-6 p-6 border rounded-lg"
          onMouseEnter={handleWarrantyView}
        >
          <h2 className="text-xl font-bold mb-2">Warranty Information</h2>
          <div className="text-gray-700">
            {JSON.stringify(proposal.warranty_details, null, 2)}
          </div>
        </div>
      )}

      <div className="mt-6 p-4 bg-gray-50 rounded">
        <p className="text-sm text-gray-600">
          <a
            href="#financing"
            onClick={handleFinancingClick}
            className="text-blue-600 hover:underline"
          >
            Learn about financing options
          </a>
        </p>
      </div>

      {proposal.signed_at && (
        <div className="mt-6 p-4 bg-green-50 border border-green-200 rounded">
          <p className="text-green-800 font-semibold">
            ✓ Signed on {new Date(proposal.signed_at).toLocaleDateString()}
          </p>
        </div>
      )}
    </div>
  );
}

































