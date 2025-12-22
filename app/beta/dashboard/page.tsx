// Block 10100 — Beta Tester Dashboard Page
// The "Holy Shit" dashboard that shows beta testers their results

"use client";

import { useEffect, useState } from "react";
import { BetaConversionDashboard } from "@/components/beta/BetaConversionDashboard";
import { useSearchParams } from "next/navigation";

export default function BetaDashboardPage() {
  const searchParams = useSearchParams();
  const betaTesterId = searchParams.get("beta_tester_id");
  const workspaceId = searchParams.get("workspace_id");

  const [loading, setLoading] = useState(true);
  const [betaTester, setBetaTester] = useState<any>(null);

  useEffect(() => {
    async function loadBetaTester() {
      if (!betaTesterId) {
        setLoading(false);
        return;
      }

      try {
        const res = await fetch(
          `/api/beta/tester?beta_tester_id=${betaTesterId}`
        );
        if (res.ok) {
          const json = await res.json();
          setBetaTester(json.betaTester);
        }
      } catch (error) {
        console.error("Error loading beta tester:", error);
      } finally {
        setLoading(false);
      }
    }
    loadBetaTester();
  }, [betaTesterId]);

  if (loading) {
    return (
      <div className="p-6">
        <div className="text-sm text-gray-500">Loading...</div>
      </div>
    );
  }

  if (!betaTesterId) {
    return (
      <div className="p-6">
        <div className="text-sm text-red-600">
          Missing beta_tester_id parameter
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="border-b pb-4">
          <h1 className="text-2xl font-bold text-gray-900">
            SmartSend Beta Dashboard
          </h1>
          {betaTester && (
            <p className="text-sm text-gray-600 mt-1">
              {betaTester.company_name} • Beta Status:{" "}
              <span className="font-medium capitalize">
                {betaTester.beta_status}
              </span>
            </p>
          )}
        </div>

        {/* Main Conversion Dashboard */}
        <BetaConversionDashboard
          betaTesterId={betaTesterId}
          workspaceId={workspaceId || undefined}
        />

        {/* Conversion Offer Section */}
        {betaTester?.conversion_offer_sent_at && (
          <div className="border rounded-2xl p-6 bg-white">
            <h2 className="text-lg font-semibold mb-4">Founders Deal</h2>
            <div className="space-y-4">
              <div className="text-sm text-gray-700">
                You've been offered the exclusive Founders Deal. Your rate will
                never increase, and you'll get priority access to every upgrade.
              </div>
              <div className="grid md:grid-cols-3 gap-4">
                <PlanCard
                  name="Starter"
                  price={99}
                  features={[
                    "1 campaign",
                    "500 emails/mo",
                    "Basic AI personalization",
                    "Reply tracking",
                  ]}
                />
                <PlanCard
                  name="Growth"
                  price={199}
                  features={[
                    "3 campaigns",
                    "2,000 emails/mo",
                    "Advanced automation",
                    "Priority support",
                  ]}
                  highlighted
                />
                <PlanCard
                  name="Domination"
                  price={399}
                  features={[
                    "Unlimited campaigns",
                    "Full automation",
                    "Revenue dashboard",
                  ]}
                />
              </div>
              <div className="pt-4 border-t">
                <a
                  href={`/beta/convert?beta_tester_id=${betaTesterId}`}
                  className="inline-block px-6 py-3 bg-emerald-600 text-white font-medium rounded-lg hover:bg-emerald-700 transition-colors"
                >
                  Activate Your Plan →
                </a>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function PlanCard({
  name,
  price,
  features,
  highlighted,
}: {
  name: string;
  price: number;
  features: string[];
  highlighted?: boolean;
}) {
  return (
    <div
      className={`border rounded-xl p-4 ${
        highlighted
          ? "border-emerald-500 bg-emerald-50"
          : "border-gray-200 bg-white"
      }`}
    >
      <div className="font-semibold text-lg mb-1">{name}</div>
      <div className="text-2xl font-bold mb-3">
        ${price}
        <span className="text-sm font-normal text-gray-600">/mo</span>
      </div>
      <ul className="space-y-1 text-sm text-gray-700">
        {features.map((feature, idx) => (
          <li key={idx} className="flex items-start">
            <span className="mr-2">•</span>
            <span>{feature}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}























































