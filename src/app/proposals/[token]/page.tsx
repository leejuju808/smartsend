// Block 220000 — SmartSend Roofing Public Proposal Viewing Page
// Page: Homeowner-facing proposal viewing with tracking

"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";

export default function PublicProposalPage() {
  const params = useParams();
  const token = params.token as string;

  const [proposal, setProposal] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (token) {
      loadProposal();
    }
  }, [token]);

  const loadProposal = async () => {
    try {
      // This will track the view automatically
      const response = await fetch(`/api/proposals/view?token=${token}`);
      if (response.ok) {
        const html = await response.text();
        setProposal({ html });
      }
    } catch (error) {
      console.error("Error loading proposal:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-center">
          <div className="h-8 bg-gray-200 rounded w-64 mb-4"></div>
          <p className="text-gray-600">Loading proposal...</p>
        </div>
      </div>
    );
  }

  if (!proposal) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-2">Proposal Not Found</h1>
          <p className="text-gray-600">
            The proposal you're looking for doesn't exist or has been removed.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div dangerouslySetInnerHTML={{ __html: proposal.html }} />
    </div>
  );
}

























