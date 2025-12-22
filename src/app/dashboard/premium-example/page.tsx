"use client";
import { PlanGate, UpsellCard } from "@/lib/plan";

export default function PremiumExamplePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold mb-2">Premium Features Demo</h1>
        <p className="text-gray-600">
          This page demonstrates how to gate premium features using the PlanGate component
        </p>
      </div>
      
      {/* Example 1: Gate a whole page section */}
      <PlanGate>
        <div className="rounded-xl border p-6 bg-gradient-to-r from-blue-50 to-purple-50">
          <h2 className="text-xl font-semibold mb-3">🚀 Pro Analytics Dashboard</h2>
          <p className="text-gray-600 mb-4">
            This entire section is only visible to Pro users. Free users will see the UpsellCard.
          </p>
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-white p-4 rounded-lg border">
              <div className="text-2xl font-bold text-blue-600">2.4x</div>
              <div className="text-sm text-gray-600">Conversion Rate</div>
            </div>
            <div className="bg-white p-4 rounded-lg border">
              <div className="text-2xl font-bold text-green-600">$12.5k</div>
              <div className="text-sm text-gray-600">Revenue Generated</div>
            </div>
            <div className="bg-white p-4 rounded-lg border">
              <div className="text-2xl font-bold text-purple-600">89%</div>
              <div className="text-sm text-gray-600">Reply Rate</div>
            </div>
          </div>
        </div>
      </PlanGate>

      {/* Example 2: Gate with custom fallback */}
      <PlanGate fallback={
        <div className="rounded-xl border p-6 bg-yellow-50">
          <h3 className="text-lg font-semibold mb-2">Custom Fallback Message</h3>
          <p className="text-gray-600">
            This shows a custom message instead of the default UpsellCard.
          </p>
        </div>
      }>
        <div className="rounded-xl border p-6 bg-gradient-to-r from-green-50 to-blue-50">
          <h2 className="text-xl font-semibold mb-3">📊 Advanced Reporting</h2>
          <p className="text-gray-600">
            Custom fallback example - this section shows custom content for non-Pro users.
          </p>
        </div>
      </PlanGate>

      {/* Example 3: Mixed content - some free, some premium */}
      <div className="rounded-xl border p-6">
        <h2 className="text-xl font-semibold mb-3">Mixed Content Example</h2>
        <p className="text-gray-600 mb-4">
          This section is visible to all users, but contains premium features within it.
        </p>
        
        {/* Free content */}
        <div className="bg-gray-50 p-4 rounded-lg mb-4">
          <h3 className="font-semibold">Free Feature</h3>
          <p className="text-sm text-gray-600">This is available to everyone.</p>
        </div>

        {/* Premium content */}
        <PlanGate fallback={<UpsellCard />}>
          <div className="bg-blue-50 p-4 rounded-lg">
            <h3 className="font-semibold">Premium Feature</h3>
            <p className="text-sm text-gray-600">This is only for Pro users.</p>
            <button className="mt-2 px-3 py-1 bg-blue-600 text-white rounded text-sm">
              Pro Action
            </button>
          </div>
        </PlanGate>
      </div>

      {/* Example 4: Different plan requirements */}
      <PlanGate require="enterprise">
        <div className="rounded-xl border p-6 bg-gradient-to-r from-purple-50 to-pink-50">
          <h2 className="text-xl font-semibold mb-3">🏢 Enterprise Features</h2>
          <p className="text-gray-600">
            This requires an "enterprise" plan (custom plan type example).
          </p>
        </div>
      </PlanGate>
    </div>
  );
} 