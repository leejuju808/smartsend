'use client';

import { useEffect, useState } from 'react';
import useSWR from 'swr';
import IntelligenceKPIs from '@/components/hq/intel/IntelligenceKPIs';
import PredictionsPanel from '@/components/hq/intel/PredictionsPanel';
import RecommendationsPanel from '@/components/hq/intel/RecommendationsPanel';
import AnomaliesAlert from '@/components/hq/intel/AnomaliesAlert';
import LiveInsightsFeed from '@/components/hq/intel/LiveInsightsFeed';
import SimulationMode from '@/components/hq/intel/SimulationMode';
import AgentIntelligenceBoard from '@/components/hq/intel/AgentIntelligenceBoard';

const fetcher = (url: string) => fetch(url).then(r => r.json());

export default function IntelligenceDashboard() {
  const [orgId, setOrgId] = useState<string | null>(null);
  const [isLoadingOrg, setIsLoadingOrg] = useState(true);
  
  // Fetch active org
  useEffect(() => {
    fetch('/api/orgs/list')
      .then(r => r.json())
      .then(data => {
        const activeOrg = data.current ? { id: data.current } : data.rows?.[0];
        if (activeOrg) {
          setOrgId(activeOrg.id);
        }
        setIsLoadingOrg(false);
      })
      .catch(() => setIsLoadingOrg(false));
  }, []);
  
  // Fetch dashboard data
  const { data, error, isLoading, mutate } = useSWR(
    orgId ? `/api/hq/intel/dashboard?org_id=${orgId}` : null,
    fetcher,
    { refreshInterval: 30000 } // Refresh every 30 seconds
  );
  
  if (isLoadingOrg || isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 p-6 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-yellow-500"></div>
      </div>
    );
  }
  
  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-7xl mx-auto">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-800">
            <p className="font-semibold">Error loading intelligence dashboard</p>
            <p className="text-sm mt-1">Please refresh the page or try again later.</p>
          </div>
        </div>
      </div>
    );
  }
  
  const kpis = data?.kpis || {};
  const predictions = data?.predictions || [];
  const recommendations = data?.recommendations || [];
  const accuracy = data?.accuracy || {};
  const feedback = data?.feedback || {};
  const recentEvents = data?.recent_events || [];
  
  return (
    <div className="min-h-screen bg-gray-50 p-6 space-y-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">
            <span className="bg-gradient-to-r from-purple-500 to-blue-600 bg-clip-text text-transparent">
              🧠 AUREV Intelligence
            </span>
            {' '}
            <span className="text-gray-900">Command Center</span>
          </h1>
          <p className="text-gray-600">
            Self-optimizing AI operating system — predictions, recommendations, and autonomous actions
          </p>
        </div>
        
        {/* Top KPIs */}
        <IntelligenceKPIs 
          kpis={kpis}
          accuracy={accuracy}
          feedback={feedback}
        />
        
        {/* Anomalies Alert */}
        <AnomaliesAlert orgId={orgId} />
        
        {/* Main Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left Column */}
          <div className="space-y-6">
            {/* Predictions Panel */}
            <PredictionsPanel 
              predictions={predictions}
              orgId={orgId}
              onRefresh={mutate}
            />
            
            {/* Live Insights Feed */}
            <LiveInsightsFeed events={recentEvents} />
          </div>
          
          {/* Right Column */}
          <div className="space-y-6">
            {/* Recommendations Panel */}
            <RecommendationsPanel 
              recommendations={recommendations}
              orgId={orgId}
              onRefresh={mutate}
            />
            
            {/* Simulation Mode */}
            <SimulationMode orgId={orgId} />
          </div>
        </div>
        
        {/* Agent Intelligence Board */}
        <AgentIntelligenceBoard orgId={orgId} />
      </div>
    </div>
  );
}

