'use client';

import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';

interface Prediction {
  id: string;
  scope: string;
  metric: string;
  horizon_days: number;
  predicted_value: number;
  confidence: number;
  drivers: string[];
  created_at: string;
}

interface PredictionsPanelProps {
  predictions: Prediction[];
  orgId: string | null;
  onRefresh: () => void;
}

export default function PredictionsPanel({ predictions, orgId, onRefresh }: PredictionsPanelProps) {
  const [loading, setLoading] = useState(false);
  const [selectedMetric, setSelectedMetric] = useState('churn');
  const [horizon, setHorizon] = useState(30);
  
  const handleGeneratePrediction = async () => {
    if (!orgId) return;
    
    setLoading(true);
    try {
      const response = await fetch('/api/hq/intel/predict', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scope: 'org',
          metric: selectedMetric,
          horizon,
          org_id: orgId
        })
      });
      
      if (response.ok) {
        onRefresh();
      }
    } catch (error) {
      console.error('Error generating prediction:', error);
    } finally {
      setLoading(false);
    }
  };
  
  const formatValue = (metric: string, value: number) => {
    switch (metric) {
      case 'churn':
        return `${(value * 100).toFixed(2)}%`;
      case 'revenue':
      case 'growth':
        return `$${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
      case 'campaign_reply_rate':
        return `${(value * 100).toFixed(1)}%`;
      default:
        return value.toFixed(2);
    }
  };
  
  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold">Predictions</h3>
            <p className="text-sm text-gray-600">AI-powered forecasts for key metrics</p>
          </div>
          <Button
            onClick={handleGeneratePrediction}
            disabled={loading || !orgId}
            size="sm"
          >
            {loading ? 'Generating...' : 'New Prediction'}
          </Button>
        </div>
        
        {/* Prediction Controls */}
        {orgId && (
          <div className="grid grid-cols-2 gap-2 mb-4 p-3 bg-gray-50 rounded">
            <div>
              <label className="text-xs text-gray-600 mb-1 block">Metric</label>
              <select
                value={selectedMetric}
                onChange={(e) => setSelectedMetric(e.target.value)}
                className="w-full text-sm border rounded px-2 py-1"
              >
                <option value="churn">Churn Rate</option>
                <option value="growth">Growth</option>
                <option value="campaign_reply_rate">Reply Rate</option>
                <option value="revenue">Revenue</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-600 mb-1 block">Horizon (days)</label>
              <input
                type="number"
                value={horizon}
                onChange={(e) => setHorizon(parseInt(e.target.value))}
                min="1"
                max="365"
                className="w-full text-sm border rounded px-2 py-1"
              />
            </div>
          </div>
        )}
        
        {/* Predictions List */}
        <div className="space-y-3">
          {predictions.length === 0 ? (
            <div className="text-center py-8 text-gray-500 text-sm">
              No predictions yet. Generate one to get started.
            </div>
          ) : (
            predictions.map((pred) => (
              <div
                key={pred.id}
                className="border rounded-lg p-4 bg-white hover:shadow-sm transition-shadow"
              >
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <div className="font-semibold text-sm capitalize">{pred.metric.replace(/_/g, ' ')}</div>
                    <div className="text-xs text-gray-500">
                      {pred.horizon_days} days ahead • {new Date(pred.created_at).toLocaleDateString()}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-bold">
                      {formatValue(pred.metric, pred.predicted_value)}
                    </div>
                    <div className="text-xs text-gray-500">
                      {(pred.confidence * 100).toFixed(0)}% confidence
                    </div>
                  </div>
                </div>
                
                {pred.drivers && pred.drivers.length > 0 && (
                  <div className="mt-2 pt-2 border-t">
                    <div className="text-xs text-gray-600 mb-1">Key Drivers:</div>
                    <div className="flex flex-wrap gap-1">
                      {pred.drivers.slice(0, 3).map((driver, idx) => (
                        <span
                          key={idx}
                          className="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded"
                        >
                          {driver}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}

