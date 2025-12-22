'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/Card';
import { Alert } from '@/components/ui/Alert';

interface Anomaly {
  type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  metric: string;
  value: number;
  expected: number;
}

interface AnomaliesAlertProps {
  orgId: string | null;
}

export default function AnomaliesAlert({ orgId }: AnomaliesAlertProps) {
  const [anomalies, setAnomalies] = useState<Anomaly[]>([]);
  const [loading, setLoading] = useState(false);
  
  useEffect(() => {
    if (!orgId) return;
    
    setLoading(true);
    fetch(`/api/hq/intel/anomalies?org_id=${orgId}`)
      .then(r => r.json())
      .then(data => {
        setAnomalies(data.anomalies || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [orgId]);
  
  if (!orgId || loading) return null;
  
  if (anomalies.length === 0) {
    return (
      <Alert className="bg-green-50 border-green-200 text-green-800">
        <div className="flex items-center gap-2">
          <span className="text-xl">✓</span>
          <span className="text-sm font-medium">No anomalies detected. System health is optimal.</span>
        </div>
      </Alert>
    );
  }
  
  const criticalAnomalies = anomalies.filter(a => a.severity === 'critical' || a.severity === 'high');
  const mediumAnomalies = anomalies.filter(a => a.severity === 'medium');
  
  return (
    <div className="space-y-2">
      {criticalAnomalies.map((anomaly, idx) => (
        <Alert
          key={idx}
          className={`border-2 ${
            anomaly.severity === 'critical'
              ? 'bg-red-50 border-red-400 text-red-900'
              : 'bg-orange-50 border-orange-400 text-orange-900'
          }`}
        >
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="font-semibold text-sm mb-1">
                {anomaly.severity === 'critical' ? '🚨 Critical' : '⚠️ High'} Anomaly Detected
              </div>
              <div className="text-sm">{anomaly.description}</div>
              <div className="text-xs mt-1 opacity-75">
                Metric: {anomaly.metric} • Value: {anomaly.value} • Expected: ~{anomaly.expected}
              </div>
            </div>
          </div>
        </Alert>
      ))}
      
      {mediumAnomalies.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <div className="text-sm font-semibold mb-2">Medium Priority Issues</div>
            {mediumAnomalies.map((anomaly, idx) => (
              <div key={idx} className="text-sm text-gray-700 mb-1">
                • {anomaly.description}
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

