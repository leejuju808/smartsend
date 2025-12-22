"use client";

// Block 27210 — SmartSend Roofing E-Sign & Acceptance Tracker v1
// Block 33155 — SmartSend Roofing "Smart Financing Engine + Homeowner Offer Flow" v1
// Public Proposal Approval Page
// Homeowner-facing page for accepting/declining proposals

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { FinancingButton } from "@/components/financing/FinancingButton";
import { FinancingCalculator } from "@/components/financing/FinancingCalculator";
import { FinancingApplicationFlow } from "@/components/financing/FinancingApplicationFlow";

interface ProposalData {
  token: string;
  job: {
    id: string;
    job_name?: string;
    homeowner_name?: string;
    address?: string;
  };
  proposal: {
    id: string;
    tier: string;
    title?: string;
    subtitle?: string;
    price: number;
    features: string[];
    warranty_text?: string;
  };
  already_accepted?: boolean;
  acceptance_date?: string;
}

export default function PublicProposalPage() {
  const params = useParams();
  const token = params?.token as string;
  const [data, setData] = useState<ProposalData | null>(null);
  const [decision, setDecision] = useState<"accepted" | "declined" | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [homeownerName, setHomeownerName] = useState("");
  const [homeownerEmail, setHomeownerEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [showFinancingCalculator, setShowFinancingCalculator] = useState(false);
  const [showFinancingApplication, setShowFinancingApplication] = useState(false);
  const [selectedTerm, setSelectedTerm] = useState<{ months: number; payment: number } | null>(null);

  useEffect(() => {
    if (!token) {
      setError("Invalid proposal link");
      setLoading(false);
      return;
    }

    fetch(`/api/proposal-from-token/${token}`)
      .then((r) => {
        if (!r.ok) {
          return r.json().then((err) => {
            throw new Error(err.error || "Failed to load proposal");
          });
        }
        return r.json();
      })
      .then((d) => {
        setData(d);
        if (d.already_accepted) {
          setDecision("accepted");
        }
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message || "Failed to load proposal");
        setLoading(false);
      });
  }, [token]);

  const submitDecision = async (choice: "accepted" | "declined") => {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/proposal-decision/${token}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          decision: choice,
          homeowner_name: homeownerName,
          homeowner_email: homeownerEmail,
          homeowner_notes: notes,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to submit decision");
      }

      setDecision(choice);
    } catch (err: any) {
      setError(err.message || "Failed to submit decision");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-black mx-auto mb-4"></div>
          <p className="text-gray-600">Loading proposal...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="text-center max-w-md">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            Proposal Not Found
          </h1>
          <p className="text-gray-600">
            {error || "This proposal link is invalid or has expired."}
          </p>
        </div>
      </div>
    );
  }

  const { job, proposal } = data;

  if (decision === "accepted") {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="max-w-xl w-full bg-white rounded-xl shadow-sm border p-8 text-center">
          <div className="mb-4">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg
                className="w-8 h-8 text-green-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
          </div>
          <h1 className="text-2xl font-bold mb-2">
            Thank you, {homeownerName || job?.homeowner_name || "Homeowner"}!
          </h1>
          <p className="text-sm text-gray-600 mb-4">
            Your approval has been recorded. Our team will reach out shortly to
            schedule your installation.
          </p>
          <p className="text-xs text-gray-500">
            Approval recorded on {new Date().toLocaleDateString()} at{" "}
            {new Date().toLocaleTimeString()}
          </p>
        </div>
      </div>
    );
  }

  if (decision === "declined") {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="max-w-xl w-full bg-white rounded-xl shadow-sm border p-8 text-center">
          <h1 className="text-2xl font-bold mb-2">Response received.</h1>
          <p className="text-sm text-gray-600 mb-4">
            We appreciate your time. Our team may follow up if we can address
            your concerns.
          </p>
          {notes && (
            <div className="mt-4 p-4 bg-gray-50 rounded-lg text-left">
              <p className="text-xs text-gray-500 mb-1">Your notes:</p>
              <p className="text-sm text-gray-700">{notes}</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-2xl mx-auto space-y-6">
        <header className="bg-white rounded-xl border shadow-sm p-6">
          <h1 className="text-2xl font-bold mb-2">Roof Replacement Proposal</h1>
          <p className="text-sm text-gray-500">
            {job?.homeowner_name || "Homeowner"} • {job?.address || ""}
          </p>
        </header>

        <section className="bg-white rounded-xl border shadow-sm p-6">
          <div className="text-xs uppercase text-gray-500 mb-2 font-semibold">
            {proposal.tier.toUpperCase()} TIER
          </div>
          <h2 className="text-xl font-semibold mb-2">
            {proposal.title || `${proposal.tier.charAt(0).toUpperCase() + proposal.tier.slice(1)} Option`}
          </h2>
          {proposal.subtitle && (
            <p className="text-sm text-gray-500 mb-4">{proposal.subtitle}</p>
          )}
          <div className="text-4xl font-bold mb-4">
            ${Number(proposal.price || 0).toLocaleString()}
          </div>
          {proposal.features && proposal.features.length > 0 && (
            <ul className="text-sm text-gray-800 space-y-2 mb-4">
              {proposal.features.map((f: string, idx: number) => (
                <li key={idx} className="flex items-start">
                  <span className="mr-2">•</span>
                  <span>{f}</span>
                </li>
              ))}
            </ul>
          )}
          {proposal.warranty_text && (
            <p className="text-xs text-gray-500 mt-4 pt-4 border-t">
              {proposal.warranty_text}
            </p>
          )}
        </section>

        {/* Financing Section - Block 36555 */}
        {!showFinancingCalculator && !showFinancingApplication && (
          <section className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl border-2 border-blue-200 shadow-sm p-6 space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <h3 className="font-semibold text-base mb-2 text-gray-900">
                  Pay Monthly Instead of Upfront
                </h3>
                <p className="text-sm text-gray-700 mb-3">
                  See monthly payment options with soft-pull prequalification. No impact to your credit score.
                </p>
                <div className="flex items-center gap-4 text-sm">
                  <div>
                    <span className="text-gray-500">Est. Monthly:</span>
                    <span className="font-bold text-lg text-blue-700 ml-2">
                      ${Math.round((proposal.price || 0) / 24).toLocaleString()}/mo
                    </span>
                  </div>
                  <div className="text-gray-500">
                    (24 months • APR 8-15%)
                  </div>
                </div>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowFinancingCalculator(true)}
                className="flex-1 px-6 py-3 rounded-lg bg-gradient-to-r from-blue-600 to-blue-700 text-white font-medium text-sm shadow-md hover:shadow-lg transition-all duration-200 hover:from-blue-700 hover:to-blue-800"
              >
                See Monthly Payment Options (Soft Pull, No Impact to Credit)
              </button>
            </div>
            <p className="text-xs text-gray-600">
              Compare 12, 24, and 36 month plans. Prequalify in 60 seconds with no credit impact.
            </p>
          </section>
        )}

        {showFinancingCalculator && !showFinancingApplication && (
          <section className="space-y-4">
            <FinancingCalculator
              amount={proposal.price}
              onSelectTerm={(months, payment) => {
                setSelectedTerm({ months, payment });
                setShowFinancingApplication(true);
              }}
            />
            <button
              onClick={() => {
                setShowFinancingCalculator(false);
                setSelectedTerm(null);
              }}
              className="w-full px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
            >
              ← Back to proposal
            </button>
          </section>
        )}

        {showFinancingApplication && (
          <section className="space-y-4">
            <FinancingApplicationFlow
              amount={proposal.price}
              proposalId={proposal.id}
              onComplete={(applicationId) => {
                // Handle completion - could redirect or show success
                setShowFinancingApplication(false);
                setShowFinancingCalculator(false);
                setSelectedTerm(null);
                alert("Financing application submitted! We'll review it and get back to you.");
              }}
              onCancel={() => {
                setShowFinancingApplication(false);
                setShowFinancingCalculator(true);
              }}
            />
          </section>
        )}

        <section className="bg-white rounded-xl border shadow-sm p-6 space-y-4">
          <h3 className="font-semibold text-sm">Your Details</h3>
          <div className="space-y-3 text-sm">
            <div>
              <label className="block text-xs text-gray-500 mb-1 font-medium">
                Name (required)
              </label>
              <input
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
                value={homeownerName}
                onChange={(e) => setHomeownerName(e.target.value)}
                placeholder="Enter your full name"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1 font-medium">
                Email (optional)
              </label>
              <input
                type="email"
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
                value={homeownerEmail}
                onChange={(e) => setHomeownerEmail(e.target.value)}
                placeholder="your@email.com"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1 font-medium">
                Notes (optional)
              </label>
              <textarea
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Any questions or comments..."
              />
            </div>
          </div>
        </section>

        <section className="bg-white rounded-xl border shadow-sm p-6 space-y-4">
          <h3 className="font-semibold text-sm">Approve or Decline</h3>
          <p className="text-xs text-gray-500 leading-relaxed">
            By clicking "Approve", you authorize the contractor to proceed
            according to this proposal, subject to final scheduling and any
            written contract you sign with the company.
          </p>
          <div className="flex gap-3">
            <button
              disabled={submitting || !homeownerName.trim()}
              onClick={() => submitDecision("accepted")}
              className="flex-1 px-6 py-3 rounded-lg bg-black text-white text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-800 transition-colors"
            >
              {submitting ? "Submitting..." : "Approve & Move Forward"}
            </button>
            <button
              disabled={submitting}
              onClick={() => submitDecision("declined")}
              className="flex-1 px-6 py-3 rounded-lg border border-gray-300 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 transition-colors"
            >
              Decline
            </button>
          </div>
          <p className="text-[10px] text-gray-400 mt-2">
            This electronic approval will be recorded with timestamp and IP
            address for your records.
          </p>
        </section>
      </div>
    </div>
  );
}
