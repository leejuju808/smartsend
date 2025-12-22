"use client";
import { PlanGate, UpsellCard } from "@/lib/plan";
import PipelineClient from "./PipelineClient";
import ReplyIntentDashboard from "@/components/ReplyIntentDashboard";
import ReplyIntentTester from "@/components/ReplyIntentTester";

export default function PipelinePlanDemoPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold mb-2">Pipeline & Reply Intent (Plan Demo)</h1>
        <p className="text-gray-600">
          This page demonstrates client-side plan gating. The existing page uses server-side gating.
        </p>
      </div>
      
      {/* Free content - visible to all users */}
      <div className="bg-gray-50 p-4 rounded-lg">
        <h2 className="text-lg font-semibold mb-2">Free Features</h2>
        <p className="text-gray-600 text-sm">
          This section is visible to all users, including free users.
        </p>
      </div>
      
      {/* Pro-only Reply Intent Dashboard */}
      <PlanGate fallback={
        <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
          <h2 className="text-lg font-semibold text-blue-800 mb-2">Reply Intent Dashboard</h2>
          <p className="text-blue-700 text-sm mb-3">
            Upgrade to Pro to access advanced reply intent detection and analytics.
          </p>
          <UpsellCard />
        </div>
      }>
        <div>
          <h2 className="text-xl font-semibold mb-4">Reply Intent Dashboard - Pro Feature</h2>
          <ReplyIntentDashboard />
        </div>
      </PlanGate>
      
      {/* Pro-only Reply Intent Tester */}
      <PlanGate fallback={
        <div className="bg-green-50 p-4 rounded-lg border border-green-200">
          <h2 className="text-lg font-semibold text-green-800 mb-2">Reply Intent Tester</h2>
          <p className="text-green-700 text-sm mb-3">
            Test reply intent detection with Pro features.
          </p>
          <UpsellCard />
        </div>
      }>
        <div>
          <h2 className="text-xl font-semibold mb-4">Reply Intent Tester - Pro Feature</h2>
          <ReplyIntentTester />
        </div>
      </PlanGate>
      
      {/* Pro-only Deal Pipeline */}
      <PlanGate fallback={
        <div className="bg-purple-50 p-4 rounded-lg border border-purple-200">
          <h2 className="text-lg font-semibold text-purple-800 mb-2">Deal Pipeline</h2>
          <p className="text-purple-700 text-sm mb-3">
            Track your deals and pipeline with Pro features.
          </p>
          <UpsellCard />
        </div>
      }>
        <div>
          <h2 className="text-xl font-semibold mb-4">Deal Pipeline - Pro Feature</h2>
          <PipelineClient />
        </div>
      </PlanGate>
    </div>
  );
} 