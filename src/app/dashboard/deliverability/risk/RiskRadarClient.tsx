'use client';

import { useState, useEffect } from 'react';
import { DomainRisk, RiskMetrics } from '@/lib/risk';

export default function RiskRadarClient() {
  const [domains, setDomains] = useState<DomainRisk[]>([]);
  const [metrics, setMetrics] = useState<RiskMetrics | null>(null);
  const [attentionDomains, setAttentionDomains] = useState<DomainRisk[]>([]);
  const [loading, setLoading] = useState(true);
  const [showOverrideForm, setShowOverrideForm] = useState(false);
  const [selectedDomain, setSelectedDomain] = useState<DomainRisk | null>(null);
  const [overrideData, setOverrideData] = useState({
    risk_level: 'normal' as 'normal' | 'watch' | 'high',
    reason: ''
  });

  // For demo purposes, use a default workspace ID
  const [workspaceId, setWorkspaceId] = useState<string>('');

  useEffect(() => {
    setWorkspaceId('demo-workspace-id');
  }, []);

  useEffect(() => {
    if (workspaceId) {
      loadRiskData();
    }
  }, [workspaceId]);

  const loadRiskData = async () => {
    if (!workspaceId) return;
    
    try {
      setLoading(true);
      const response = await fetch(`/api/risk/list?workspace_id=${workspaceId}`);
      const data = await response.json();
      
      if (response.ok) {
        setDomains(data.domains || []);
        setMetrics(data.metrics);
        setAttentionDomains(data.attention_domains || []);
      } else {
        console.error('Error loading risk data:', data.error);
      }
    } catch (error) {
      console.error('Error loading risk data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRecomputeRisk = async (domain?: string) => {
    if (!workspaceId) return;

    try {
      const response = await fetch('/api/risk/recompute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspace_id: workspaceId, domain })
      });

      const data = await response.json();
      
      if (response.ok) {
        alert(data.message);
        loadRiskData();
      } else {
        alert(`Error: ${data.error}`);
      }
    } catch (error) {
      console.error('Error recomputing risk:', error);
      alert('Error recomputing risk');
    }
  };

  const handleOverrideRisk = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!workspaceId || !selectedDomain) return;

    try {
      const response = await fetch('/api/risk/override', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspace_id: workspaceId,
          domain: selectedDomain.domain,
          risk_level: overrideData.risk_level,
          reason: overrideData.reason
        })
      });

      const data = await response.json();
      
      if (response.ok) {
        alert(data.message);
        setShowOverrideForm(false);
        setSelectedDomain(null);
        setOverrideData({ risk_level: 'normal', reason: '' });
        loadRiskData();
      } else {
        alert(`Error: ${data.error}`);
      }
    } catch (error) {
      console.error('Error overriding risk:', error);
      alert('Error overriding risk');
    }
  };

  const getRiskLevelColor = (riskLevel: string) => {
    switch (riskLevel) {
      case 'high':
        return 'bg-red-100 text-red-800';
      case 'watch':
        return 'bg-yellow-100 text-yellow-800';
      case 'normal':
        return 'bg-green-100 text-green-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getRiskLevelIcon = (riskLevel: string) => {
    switch (riskLevel) {
      case 'high':
        return '🔴';
      case 'watch':
        return '🟡';
      case 'normal':
        return '🟢';
      default:
        return '⚪';
    }
  };

  if (loading) {
    return <div className="text-center py-8">Loading risk data...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Risk Metrics Summary */}
      {metrics && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <div className="p-2 bg-blue-100 rounded-lg">
                <span className="text-2xl">📊</span>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Total Domains</p>
                <p className="text-2xl font-semibold text-gray-900">{metrics.total_domains}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <div className="p-2 bg-green-100 rounded-lg">
                <span className="text-2xl">🟢</span>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Normal</p>
                <p className="text-2xl font-semibold text-green-600">{metrics.normal_domains}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <div className="p-2 bg-yellow-100 rounded-lg">
                <span className="text-2xl">🟡</span>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Watch</p>
                <p className="text-2xl font-semibold text-yellow-600">{metrics.watch_domains}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <div className="p-2 bg-red-100 rounded-lg">
                <span className="text-2xl">🔴</span>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">High Risk</p>
                <p className="text-2xl font-semibold text-red-600">{metrics.high_risk_domains}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Average Metrics */}
      {metrics && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Average Bounce Rate (7d)</h3>
            <div className="text-3xl font-bold text-red-600">
              {(metrics.average_bounce_rate * 100).toFixed(2)}%
            </div>
            <p className="text-sm text-gray-500 mt-2">
              {metrics.average_bounce_rate > 0.05 ? '⚠️ Above recommended threshold' : '✅ Within normal range'}
            </p>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Average Open Rate (7d)</h3>
            <div className="text-3xl font-bold text-green-600">
              {(metrics.average_open_rate * 100).toFixed(2)}%
            </div>
            <p className="text-sm text-gray-500 mt-2">
              {metrics.average_open_rate < 0.15 ? '⚠️ Below recommended threshold' : '✅ Within normal range'}
            </p>
          </div>
        </div>
      )}

      {/* Attention Domains */}
      {attentionDomains.length > 0 && (
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-medium text-gray-900">⚠️ Domains Requiring Attention</h3>
            <p className="text-sm text-gray-500">These domains have elevated risk levels and may need intervention</p>
          </div>
          
          <div className="divide-y divide-gray-200">
            {attentionDomains.map((domain) => (
              <div key={domain.id} className="px-6 py-4">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-3">
                      <span className="text-2xl">{getRiskLevelIcon(domain.risk_level)}</span>
                      <h4 className="text-lg font-medium text-gray-900">{domain.domain}</h4>
                      <span className={`px-2 py-1 text-xs font-medium rounded-full ${getRiskLevelColor(domain.risk_level)}`}>
                        {domain.risk_level.toUpperCase()}
                      </span>
                    </div>
                    <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm text-gray-500">
                      <div>
                        <span className="font-medium">7d Bounce:</span> {(domain.bounce_rate_7d * 100).toFixed(2)}%
                      </div>
                      <div>
                        <span className="font-medium">30d Bounce:</span> {(domain.bounce_rate_30d * 100).toFixed(2)}%
                      </div>
                      <div>
                        <span className="font-medium">7d Open:</span> {(domain.open_rate_7d * 100).toFixed(2)}%
                      </div>
                      <div>
                        <span className="font-medium">Total Sent (7d):</span> {domain.total_sent_7d}
                      </div>
                    </div>
                    {domain.risk_override && (
                      <div className="mt-2 text-sm text-gray-600">
                        <span className="font-medium">Override Reason:</span> {domain.risk_override}
                      </div>
                    )}
                  </div>
                  <div className="flex space-x-2">
                    <button
                      onClick={() => handleRecomputeRisk(domain.domain)}
                      className="text-blue-600 hover:text-blue-800 px-3 py-1 rounded-md hover:bg-blue-50"
                    >
                      Recompute
                    </button>
                    <button
                      onClick={() => {
                        setSelectedDomain(domain);
                        setOverrideData({ risk_level: domain.risk_level, reason: '' });
                        setShowOverrideForm(true);
                      }}
                      className="text-purple-600 hover:text-purple-800 px-3 py-1 rounded-md hover:bg-purple-50"
                    >
                      Override
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* All Domains */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-medium text-gray-900">All Domain Risks</h3>
            <button
              onClick={() => handleRecomputeRisk()}
              className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700"
            >
              Recompute All
            </button>
          </div>
        </div>
        
        <div className="divide-y divide-gray-200">
          {domains.length === 0 ? (
            <div className="px-6 py-8 text-center text-gray-500">
              No domain risk data available. Risk levels are computed automatically based on email performance.
            </div>
          ) : (
            domains.map((domain) => (
              <div key={domain.id} className="px-6 py-4">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-3">
                      <span className="text-2xl">{getRiskLevelIcon(domain.risk_level)}</span>
                      <h4 className="text-lg font-medium text-gray-900">{domain.domain}</h4>
                      <span className={`px-2 py-1 text-xs font-medium rounded-full ${getRiskLevelColor(domain.risk_level)}`}>
                        {domain.risk_level.toUpperCase()}
                      </span>
                    </div>
                    <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm text-gray-500">
                      <div>
                        <span className="font-medium">7d Bounce:</span> {(domain.bounce_rate_7d * 100).toFixed(2)}%
                      </div>
                      <div>
                        <span className="font-medium">30d Bounce:</span> {(domain.bounce_rate_30d * 100).toFixed(2)}%
                      </div>
                      <div>
                        <span className="font-medium">7d Open:</span> {(domain.open_rate_7d * 100).toFixed(2)}%
                      </div>
                      <div>
                        <span className="font-medium">Total Sent (7d):</span> {domain.total_sent_7d}
                      </div>
                    </div>
                    <div className="mt-2 text-xs text-gray-400">
                      Last updated: {new Date(domain.last_risk_update).toLocaleString()}
                    </div>
                  </div>
                  <div className="flex space-x-2">
                    <button
                      onClick={() => handleRecomputeRisk(domain.domain)}
                      className="text-blue-600 hover:text-blue-800 px-3 py-1 rounded-md hover:bg-blue-50"
                    >
                      Recompute
                    </button>
                    <button
                      onClick={() => {
                        setSelectedDomain(domain);
                        setOverrideData({ risk_level: domain.risk_level, reason: '' });
                        setShowOverrideForm(true);
                      }}
                      className="text-purple-600 hover:text-purple-800 px-3 py-1 rounded-md hover:bg-purple-50"
                    >
                      Override
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Risk Override Form */}
      {showOverrideForm && selectedDomain && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
            <div className="mt-3">
              <h3 className="text-lg font-medium text-gray-900 mb-4">
                Override Risk Level for {selectedDomain.domain}
              </h3>
              
              <form onSubmit={handleOverrideRisk} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Risk Level</label>
                  <select
                    value={overrideData.risk_level}
                    onChange={(e) => setOverrideData({ 
                      ...overrideData, 
                      risk_level: e.target.value as 'normal' | 'watch' | 'high' 
                    })}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  >
                    <option value="normal">Normal</option>
                    <option value="watch">Watch</option>
                    <option value="high">High Risk</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">Reason for Override</label>
                  <textarea
                    value={overrideData.reason}
                    onChange={(e) => setOverrideData({ ...overrideData, reason: e.target.value })}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                    rows={3}
                    placeholder="Explain why you're overriding the automatic risk assessment..."
                    required
                  />
                </div>

                <div className="flex space-x-3 pt-4">
                  <button
                    type="submit"
                    className="flex-1 bg-purple-600 text-white px-4 py-2 rounded-md hover:bg-purple-700"
                  >
                    Override Risk
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowOverrideForm(false);
                      setSelectedDomain(null);
                      setOverrideData({ risk_level: 'normal', reason: '' });
                    }}
                    className="flex-1 bg-gray-300 text-gray-700 px-4 py-2 rounded-md hover:bg-gray-400"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
} 