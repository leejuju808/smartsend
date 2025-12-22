'use client';

import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';

interface SimulationModeProps {
  orgId: string | null;
}

export default function SimulationMode({ orgId }: SimulationModeProps) {
  const [loading, setLoading] = useState(false);
  const [scenario, setScenario] = useState({
    type: 'price_increase',
    value: 10
  });
  const [results, setResults] = useState<any>(null);
  
  const handleSimulate = async () => {
    if (!orgId) return;
    
    setLoading(true);
    try {
      const response = await fetch('/api/hq/intel/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          org_id: orgId,
          scenario_type: scenario.type,
          scenario_value: scenario.value
        })
      });
      
      if (response.ok) {
        const data = await response.json();
        setResults(data);
      }
    } catch (error) {
      console.error('Error running simulation:', error);
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <Card>
      <CardContent className="p-6">
        <div className="mb-4">
          <h3 className="text-lg font-semibold">Simulation Mode</h3>
          <p className="text-sm text-gray-600">Test scenarios before applying changes</p>
        </div>
        
        <div className="space-y-4">
          <div>
            <label className="text-xs text-gray-600 mb-1 block">Scenario</label>
            <select
              value={scenario.type}
              onChange={(e) => setScenario({ ...scenario, type: e.target.value })}
              className="w-full text-sm border rounded px-2 py-2"
            >
              <option value="price_increase">Price Increase (%)</option>
              <option value="price_decrease">Price Decrease (%)</option>
              <option value="send_volume">Send Volume Change (%)</option>
              <option value="campaign_frequency">Campaign Frequency Change (%)</option>
            </select>
          </div>
          
          <div>
            <label className="text-xs text-gray-600 mb-1 block">Value (%)</label>
            <input
              type="number"
              value={scenario.value}
              onChange={(e) => setScenario({ ...scenario, value: parseInt(e.target.value) })}
              className="w-full text-sm border rounded px-2 py-2"
              min="1"
              max="100"
            />
          </div>
          
          <Button
            onClick={handleSimulate}
            disabled={loading || !orgId}
            className="w-full"
          >
            {loading ? 'Simulating...' : 'Run Simulation'}
          </Button>
          
          {results && (
            <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded">
              <div className="text-sm font-semibold mb-2">Simulation Results</div>
              <div className="text-xs space-y-1">
                {Object.entries(results).map(([key, value]) => (
                  <div key={key}>
                    <span className="font-medium capitalize">{key.replace(/_/g, ' ')}:</span>{' '}
                    <span>{String(value)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

