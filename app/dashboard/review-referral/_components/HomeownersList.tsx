"use client";

// Block 28060 — Homeowners List Component

import { useEffect, useState } from "react";
import Link from "next/link";

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

export function HomeownersList({ workspaceId }: { workspaceId: string }) {
  const [homeowners, setHomeowners] = useState<Homeowner[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchHomeowners();
  }, [workspaceId]);

  const fetchHomeowners = async () => {
    try {
      const response = await fetch("/api/review-referral/homeowners");
      const data = await response.json();
      if (data.ok) {
        setHomeowners(data.homeowners || []);
      }
    } catch (error) {
      console.error("Error fetching homeowners:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="text-center py-4">Loading homeowners...</div>;
  }

  return (
    <div className="bg-white rounded-lg border">
      <div className="p-6 border-b">
        <h2 className="text-lg font-semibold">Homeowners</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Track referral codes, reviews, and rewards for each homeowner
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Homeowner
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Referral Code
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Referrals
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Reviews
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {homeowners.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-8 text-center text-sm text-muted-foreground">
                  No homeowners yet. Homeowner profiles are created automatically when a lead becomes a customer.
                </td>
              </tr>
            ) : (
              homeowners.map((homeowner) => {
                const name = homeowner.lead
                  ? `${homeowner.lead.first_name || ""} ${homeowner.lead.last_name || ""}`.trim() || homeowner.lead.email
                  : "Unknown";

                return (
                  <tr key={homeowner.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">{name}</div>
                      {homeowner.lead?.email && (
                        <div className="text-sm text-gray-500">{homeowner.lead.email}</div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <code className="text-sm bg-gray-100 px-2 py-1 rounded">
                        {homeowner.referral_code}
                      </code>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{homeowner.referrals_count}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        {homeowner.reviews_completed} / {homeowner.reviews_requested}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <Link
                        href={`/dashboard/review-referral/homeowners/${homeowner.id}`}
                        className="text-blue-600 hover:text-blue-800"
                      >
                        View Details
                      </Link>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}


































