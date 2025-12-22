'use client';

import { useEffect, useState } from 'react';
import HQCards from '@/components/hq/HQCards';
import HQActivity from '@/components/hq/HQActivity';
import HQTrend from '@/components/hq/HQTrend';
import useSWR from 'swr';

const f = (url: string) => fetch(url).then(r => r.json());

export default function HQDashboard() {
  const [view, setView] = useState<'org' | 'global'>('org');
  const [isAdmin, setIsAdmin] = useState(false);

  const { data, error, isLoading } = useSWR(`/api/hq/metrics?view=${view}`, f, {
    refreshInterval: 30000 // Refresh every 30 seconds
  });

  useEffect(() => {
    if (data) {
      setIsAdmin(data.isAdmin || false);
    }
  }, [data]);

  const overview = data?.overview || null;
  const trends = data?.trends || [];
  const activity = data?.activity || [];

  return (
    <div className="min-h-screen bg-gray-50 p-6 space-y-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">
            <span className="bg-gradient-to-r from-yellow-500 to-yellow-600 bg-clip-text text-transparent">
              ⚡ AUREV HQ
            </span>
            {' '}
            <span className="text-gray-900">Dashboard</span>
          </h1>
          <p className="text-gray-600">
            Unified command center for SmartSend × OpsGrid × AgentCloud
          </p>
          {isAdmin && (
            <div className="mt-4 flex items-center space-x-2">
              <span className="text-xs text-gray-500">View:</span>
              <button
                onClick={() => setView(view === 'org' ? 'global' : 'org')}
                className={`text-xs font-semibold px-3 py-1 rounded transition-colors ${
                  view === 'org' 
                    ? 'bg-yellow-100 text-yellow-800' 
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                {view === 'org' ? 'Organization' : 'Global'}
              </button>
            </div>
          )}
        </div>

        {/* Loading State */}
        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-yellow-500"></div>
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-800">
            <p className="font-semibold">Error loading dashboard</p>
            <p className="text-sm mt-1">Please refresh the page or try again later.</p>
          </div>
        )}

        {/* Dashboard Content */}
        {!isLoading && !error && (
          <>
            {/* KPI Cards */}
            <HQCards overview={overview} />

            {/* Activity Trend Chart */}
            <HQTrend data={trends} />

            {/* Recent Activity Feed */}
            <HQActivity items={activity} />

            {/* Empty State */}
            {(!overview || Object.values(overview).every(v => !v || v === 0)) && trends.length === 0 && (
              <div className="text-center py-12 bg-white border rounded-2xl">
                <div className="text-6xl mb-4">⚡</div>
                <h3 className="text-xl font-semibold mb-2">No Data Yet</h3>
                <p className="text-gray-600 max-w-md mx-auto">
                  Start using SmartSend, OpsGrid, or AgentCloud to see real-time metrics here.
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

