// Block 27400 — SmartSend Roofing Referral & Review Engine v1
// Owner Dashboard: Reviews & Referrals
// Shows review rate, referral leads generated, and top referrer customers

"use client";

import { useEffect, useState } from "react";

interface Stats {
  completed_jobs_90d: number;
  review_requests_sent: number;
  reviews_completed: number;
  referrals_count: number;
  referral_conversion_rate: number;
}

interface Referral {
  id: string;
  referrer_name: string;
  referred_name: string;
  referred_email: string | null;
  referred_phone: string | null;
  referred_address: string | null;
  status: string;
  linked_lead_id: string | null;
  created_at: string;
}

interface DashboardData {
  stats: Stats;
  referrals: Referral[];
}

export default function ReferralsReviewsPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/owner/referrals-reviews")
      .then((r) => {
        if (!r.ok) {
          throw new Error(`Failed to load: ${r.statusText}`);
        }
        return r.json();
      })
      .then((d) => {
        setData(d);
      })
      .catch((err) => {
        console.error("Dashboard fetch error:", err);
        setError(err.message);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="p-6">
        <div className="text-lg">Loading reviews & referrals...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="text-red-600">Error: {error}</div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-6">
        <div>No data available</div>
      </div>
    );
  }

  const { stats, referrals } = data;

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold mb-2">Reviews & Referrals</h1>
        <p className="text-sm text-gray-600">
          Track review requests, referrals, and how happy customers are generating new leads.
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Metric
          label="Completed Jobs (Last 90d)"
          value={stats.completed_jobs_90d}
        />
        <Metric
          label="Review Requests Sent"
          value={stats.review_requests_sent}
        />
        <Metric
          label="Reviews Completed"
          value={stats.reviews_completed}
        />
        <Metric
          label="Referrals Received"
          value={stats.referrals_count}
        />
        <Metric
          label="Referral → Lead Conversion"
          value={`${stats.referral_conversion_rate}%`}
        />
        <Metric
          label="Review Completion Rate"
          value={
            stats.review_requests_sent > 0
              ? `${Math.round((stats.reviews_completed / stats.review_requests_sent) * 100)}%`
              : "0%"
          }
        />
      </div>

      <div className="rounded-xl border bg-white shadow-sm p-4">
        <h2 className="font-semibold mb-3 text-sm">Recent Referrals</h2>
        {referrals.length === 0 ? (
          <p className="text-sm text-gray-500 py-4">No referrals yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-gray-500 border-b">
                  <th align="left" className="pb-2 pr-4">Referrer</th>
                  <th align="left" className="pb-2 pr-4">Referred</th>
                  <th align="left" className="pb-2 pr-4">Contact</th>
                  <th align="left" className="pb-2 pr-4">Status</th>
                  <th align="left" className="pb-2 pr-4">Address</th>
                  <th align="left" className="pb-2">Created</th>
                </tr>
              </thead>
              <tbody>
                {referrals.map((r) => (
                  <tr key={r.id} className="border-b last:border-0">
                    <td className="py-2 pr-4">{r.referrer_name}</td>
                    <td className="py-2 pr-4">{r.referred_name}</td>
                    <td className="py-2 pr-4">
                      {r.referred_email && (
                        <div className="text-gray-600">{r.referred_email}</div>
                      )}
                      {r.referred_phone && (
                        <div className="text-gray-600 text-xs">{r.referred_phone}</div>
                      )}
                    </td>
                    <td className="py-2 pr-4">
                      <span
                        className={`inline-block px-2 py-1 rounded text-xs ${
                          r.status === "converted"
                            ? "bg-green-100 text-green-800"
                            : r.status === "new"
                            ? "bg-blue-100 text-blue-800"
                            : "bg-gray-100 text-gray-800"
                        }`}
                      >
                        {r.status.toUpperCase()}
                      </span>
                    </td>
                    <td className="py-2 pr-4">{r.referred_address || "—"}</td>
                    <td className="py-2">
                      {new Date(r.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border bg-white shadow-sm p-3">
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      <div className="text-lg font-bold">{value}</div>
    </div>
  );
}



































