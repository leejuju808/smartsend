/**
 * Block 23200 — Silent Forge Beta Group Dashboard
 * Dashboard for beta testers to submit feedback and view metrics
 */

'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { isSalesModeEnabled } from '@/lib/feature-flags';

interface BetaInfo {
  id: string;
  company_name: string;
  status: string;
  tier: string;
  locked_price_monthly: number;
  onboarding_completed_at: string | null;
  first_real_job_at: string | null;
  last_feedback_at: string | null;
}

export default function SilentForgeDashboardPage() {
  const router = useRouter();
  if (isSalesModeEnabled()) return null;
  const [betaInfo, setBetaInfo] = useState<BetaInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'feedback' | 'metrics'>('overview');

  useEffect(() => {
    // BLOCK 281000 — Sales Mode: hide beta-only dashboards.
    if (isSalesModeEnabled()) {
      router.replace('/dashboard');
      return;
    }
    // Fetch beta info would go here
    // For now, just set loading to false
    setLoading(false);
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-7xl mx-auto">
          <div className="animate-pulse">Loading...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Silent Forge Beta Group
          </h1>
          <p className="text-gray-600">
            Welcome to the elite beta testing program. Help us perfect SmartSend.
          </p>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200 mb-6">
          <nav className="-mb-px flex space-x-8">
            <button
              onClick={() => setActiveTab('overview')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'overview'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Overview
            </button>
            <button
              onClick={() => setActiveTab('feedback')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'feedback'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Weekly Feedback
            </button>
            <button
              onClick={() => setActiveTab('metrics')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'metrics'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Metrics Dashboard
            </button>
          </nav>
        </div>

        {/* Tab Content */}
        {activeTab === 'overview' && (
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold mb-4">Beta Program Overview</h2>
            <div className="space-y-4">
              <div>
                <h3 className="font-medium text-gray-900 mb-2">Silent Forge Rules</h3>
                <ul className="list-disc list-inside space-y-1 text-gray-600">
                  <li>Use SmartSend on REAL jobs only</li>
                  <li>No public talk about SmartSend</li>
                  <li>Submit weekly feedback</li>
                  <li>Only business-critical feature requests</li>
                  <li>You get lifetime discount (50% off)</li>
                </ul>
              </div>
              <div>
                <h3 className="font-medium text-gray-900 mb-2">Your Benefits</h3>
                <ul className="list-disc list-inside space-y-1 text-gray-600">
                  <li>Early access to elite software</li>
                  <li>Priority onboarding and support</li>
                  <li>Lifetime discount: ${betaInfo?.locked_price_monthly?.toFixed(2)}/mo</li>
                  <li>Shape the product before public launch</li>
                </ul>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'feedback' && (
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold mb-4">Submit Weekly Feedback</h2>
            <p className="text-gray-600 mb-6">
              Short, clear, brutal honesty. Not long meetings. Not "ideas." REAL issues + REAL wins.
            </p>
            {/* Feedback form would go here */}
            <div className="text-gray-500 text-sm">
              Feedback form is not available here.
            </div>
          </div>
        )}

        {activeTab === 'metrics' && (
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold mb-4">Metrics Dashboard</h2>
            <p className="text-gray-600 mb-6">
              Track performance across the 7 testing buckets.
            </p>
            {/* Metrics dashboard would go here */}
            <div className="text-gray-500 text-sm">
              Metrics dashboard is not available here.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}







































