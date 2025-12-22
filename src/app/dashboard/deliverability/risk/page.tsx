import { redirect } from "next/navigation";
import { requireProOrRedirect } from "@/lib/subscription";
import RiskRadarClient from "./RiskRadarClient";

export default async function RiskRadarPage() {
  const gate = await requireProOrRedirect();
  if (!gate.ok) redirect(gate.redirect);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold mb-2">Risk Radar</h1>
        <p className="text-gray-600">
          Monitor domain health, manage risk levels, and protect your deliverability with intelligent risk assessment
        </p>
      </div>
      
      <RiskRadarClient />
    </div>
  );
} 