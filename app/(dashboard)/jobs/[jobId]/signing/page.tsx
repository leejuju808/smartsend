// Block 27210 — SmartSend Roofing E-Sign & Acceptance Tracker v1
// Internal Signing Status Page
// Shows active approval links and decision history for sales/owners

"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

interface Token {
  id: string;
  job_id: string;
  proposal_tier: string;
  token: string;
  expires_at: string | null;
  is_active: boolean;
  created_at: string;
}

interface Acceptance {
  id: string;
  job_id: string;
  proposal_tier: string;
  token: string;
  decision: "accepted" | "declined";
  decision_at: string;
  homeowner_name: string | null;
  homeowner_email: string | null;
  homeowner_ip: string | null;
  homeowner_notes: string | null;
  created_at: string;
}

export default function SigningStatusPage() {
  const params = useParams();
  const job_id = params.jobId as string;
  const [data, setData] = useState<{
    tokens: Token[];
    acceptances: Acceptance[];
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!job_id) {
      setError("Job ID is required");
      setLoading(false);
      return;
    }

    fetch(`/api/job/${job_id}/signing-status`)
      .then((r) => {
        if (!r.ok) {
          throw new Error("Failed to load signing status");
        }
        return r.json();
      })
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, [job_id]);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    // You could add a toast notification here
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-black"></div>
        <p className="text-sm text-gray-600 mt-2">Loading signing status...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-6">
        <div className="text-red-600">
          {error || "Failed to load signing status"}
        </div>
      </div>
    );
  }

  const { tokens, acceptances } = data;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://app.smartsendhq.com";

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold mb-2">Proposal Acceptance</h1>
        <p className="text-sm text-gray-600">
          Manage approval links and track homeowner decisions
        </p>
      </div>

      <section className="bg-white rounded-xl border shadow-sm p-6">
        <h2 className="font-semibold text-sm mb-4">Active Approval Links</h2>
        {tokens.length === 0 ? (
          <div className="text-xs text-gray-500 py-4">
            No active approval links. Create one using the API endpoint.
          </div>
        ) : (
          <div className="space-y-3">
            {tokens.map((t) => {
              const approvalUrl = `${appUrl}/p/${t.token}`;
              return (
                <div
                  key={t.id}
                  className="flex justify-between items-center p-3 bg-gray-50 rounded-lg border"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-medium text-gray-700">
                        Tier:
                      </span>
                      <span className="text-xs font-bold uppercase">
                        {t.proposal_tier}
                      </span>
                      <span className="text-xs text-gray-500">•</span>
                      <span className="text-xs text-gray-500 font-mono">
                        {t.token}
                      </span>
                    </div>
                    <div className="text-xs text-gray-500">
                      Created: {new Date(t.created_at).toLocaleString()}
                      {t.expires_at && (
                        <span className="ml-2">
                          • Expires: {new Date(t.expires_at).toLocaleString()}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => copyToClipboard(approvalUrl)}
                      className="px-3 py-1 text-xs border rounded hover:bg-gray-100"
                    >
                      Copy Link
                    </button>
                    <a
                      href={approvalUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-1 text-xs bg-black text-white rounded hover:bg-gray-800"
                    >
                      Open Link
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="bg-white rounded-xl border shadow-sm p-6">
        <h2 className="font-semibold text-sm mb-4">Decision History</h2>
        {acceptances.length === 0 ? (
          <div className="text-xs text-gray-500 py-4">
            No decisions recorded yet.
          </div>
        ) : (
          <div className="space-y-3">
            {acceptances.map((a) => (
              <div
                key={a.id}
                className="border-b last:border-0 pb-3 last:pb-0 space-y-2"
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`text-xs font-bold uppercase px-2 py-1 rounded ${
                      a.decision === "accepted"
                        ? "bg-green-100 text-green-800"
                        : "bg-red-100 text-red-800"
                    }`}
                  >
                    {a.decision}
                  </span>
                  <span className="text-xs font-medium uppercase text-gray-600">
                    {a.proposal_tier}
                  </span>
                  <span className="text-xs text-gray-400">•</span>
                  <span className="text-xs text-gray-500">
                    {new Date(a.decision_at).toLocaleString()}
                  </span>
                </div>
                <div className="text-xs text-gray-600">
                  <span className="font-medium">
                    {a.homeowner_name || "Anonymous"}
                  </span>
                  {a.homeowner_email && (
                    <span className="ml-2">({a.homeowner_email})</span>
                  )}
                  {a.homeowner_ip && (
                    <span className="ml-2 text-gray-400">
                      • IP: {a.homeowner_ip}
                    </span>
                  )}
                </div>
                {a.homeowner_notes && (
                  <div className="text-xs text-gray-600 mt-2 p-2 bg-gray-50 rounded">
                    <span className="font-medium">Notes:</span> {a.homeowner_notes}
                  </div>
                )}
                {a.token && (
                  <div className="text-xs text-gray-400 font-mono">
                    Token: {a.token}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="bg-blue-50 rounded-xl border border-blue-200 p-4">
        <h3 className="font-semibold text-sm mb-2 text-blue-900">
          Create New Approval Link
        </h3>
        <p className="text-xs text-blue-700 mb-3">
          Use the API endpoint to create a new approval link for a specific tier:
        </p>
        <code className="text-xs bg-white p-2 rounded border block">
          POST /api/job/{job_id}/create-approval-link
          <br />
          Body: {"{"}"proposal_tier": "good" | "better" | "best"{"}"}
        </code>
      </section>
    </div>
  );
}



































