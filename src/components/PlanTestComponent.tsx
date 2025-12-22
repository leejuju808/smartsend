"use client";
import { usePlan, PlanGate, UpsellCard } from "@/lib/plan";

export default function PlanTestComponent() {
  const { loading, plan, user } = usePlan();

  return (
    <div className="space-y-6 p-6 border rounded-lg">
      <h2 className="text-xl font-semibold">Plan System Test Component</h2>
      
      {/* Current Plan Status */}
      <div className="bg-gray-50 p-4 rounded">
        <h3 className="font-medium mb-2">Current Status:</h3>
        {loading ? (
          <p className="text-gray-600">Loading plan...</p>
        ) : (
          <div className="space-y-1">
            <p><strong>Plan:</strong> {plan}</p>
            <p><strong>User ID:</strong> {user?.id || 'Not signed in'}</p>
            <p><strong>Email:</strong> {user?.email || 'Not signed in'}</p>
          </div>
        )}
      </div>

      {/* Test PlanGate with default UpsellCard */}
      <PlanGate>
        <div className="bg-green-50 p-4 rounded border border-green-200">
          <h3 className="font-medium text-green-800 mb-2">✅ Pro Feature (Default Gate)</h3>
          <p className="text-green-700 text-sm">
            This content is only visible to Pro users. Free users see the default UpsellCard.
          </p>
        </div>
      </PlanGate>

      {/* Test PlanGate with custom fallback */}
      <PlanGate fallback={
        <div className="bg-yellow-50 p-4 rounded border border-yellow-200">
          <h3 className="font-medium text-yellow-800 mb-2">🔒 Custom Fallback</h3>
          <p className="text-yellow-700 text-sm">
            This shows a custom message instead of the default UpsellCard.
          </p>
        </div>
      }>
        <div className="bg-blue-50 p-4 rounded border border-blue-200">
          <h3 className="font-medium text-blue-800 mb-2">🚀 Pro Feature (Custom Fallback)</h3>
          <p className="text-blue-700 text-sm">
            This content is only visible to Pro users. Free users see the custom fallback.
          </p>
        </div>
      </PlanGate>

      {/* Test different plan requirement */}
      <PlanGate require="enterprise">
        <div className="bg-purple-50 p-4 rounded border border-purple-200">
          <h3 className="font-medium text-purple-800 mb-2">🏢 Enterprise Feature</h3>
          <p className="text-purple-700 text-sm">
            This requires an "enterprise" plan (custom plan type example).
          </p>
        </div>
      </PlanGate>

      {/* Manual UpsellCard test */}
      <div className="bg-gray-50 p-4 rounded">
        <h3 className="font-medium mb-2">Manual UpsellCard Test:</h3>
        <UpsellCard />
      </div>
    </div>
  );
} 