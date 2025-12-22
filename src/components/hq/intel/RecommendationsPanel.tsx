'use client';

import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';

interface Recommendation {
  id: string;
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  suggested_action: string;
  estimated_impact: any;
  confidence: number;
  status: string;
  created_at: string;
}

interface RecommendationsPanelProps {
  recommendations: Recommendation[];
  orgId: string | null;
  onRefresh: () => void;
}

export default function RecommendationsPanel({ recommendations, orgId, onRefresh }: RecommendationsPanelProps) {
  const [processing, setProcessing] = useState<string | null>(null);
  
  const handleRecommendationAction = async (recId: string, action: 'approve' | 'apply' | 'ignore') => {
    setProcessing(recId);
    try {
      const status = action === 'approve' ? 'approved' : action === 'apply' ? 'applied' : 'ignored';
      const response = await fetch('/api/hq/intel/recommend', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recommendation_id: recId,
          status,
          auto_apply: action === 'apply'
        })
      });
      
      if (response.ok) {
        onRefresh();
      }
    } catch (error) {
      console.error('Error updating recommendation:', error);
    } finally {
      setProcessing(null);
    }
  };
  
  const priorityColors = {
    critical: 'bg-red-100 text-red-700 border-red-300',
    high: 'bg-orange-100 text-orange-700 border-orange-300',
    medium: 'bg-yellow-100 text-yellow-700 border-yellow-300',
    low: 'bg-blue-100 text-blue-700 border-blue-300'
  };
  
  const sortedRecs = [...recommendations].sort((a, b) => {
    const priorityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
    return priorityOrder[b.priority] - priorityOrder[a.priority];
  });
  
  return (
    <Card>
      <CardContent className="p-6">
        <div className="mb-4">
          <h3 className="text-lg font-semibold">AI Recommendations</h3>
          <p className="text-sm text-gray-600">Optimization suggestions based on your data</p>
        </div>
        
        <div className="space-y-3 max-h-[600px] overflow-y-auto">
          {sortedRecs.length === 0 ? (
            <div className="text-center py-8 text-gray-500 text-sm">
              No recommendations at this time. Check back later for AI-driven optimizations.
            </div>
          ) : (
            sortedRecs.map((rec) => (
              <div
                key={rec.id}
                className={`border-2 rounded-lg p-4 ${priorityColors[rec.priority]}`}
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold text-sm">{rec.title}</span>
                      <span className={`text-xs px-2 py-0.5 rounded ${
                        rec.priority === 'critical' ? 'bg-red-200' :
                        rec.priority === 'high' ? 'bg-orange-200' :
                        rec.priority === 'medium' ? 'bg-yellow-200' :
                        'bg-blue-200'
                      }`}>
                        {rec.priority}
                      </span>
                    </div>
                    <p className="text-xs opacity-90 mb-2">{rec.description}</p>
                    {rec.suggested_action && (
                      <div className="text-xs font-medium mb-2">
                        💡 {rec.suggested_action}
                      </div>
                    )}
                    {rec.estimated_impact && typeof rec.estimated_impact === 'object' && (
                      <div className="text-xs opacity-80">
                        Expected impact: {JSON.stringify(rec.estimated_impact)}
                      </div>
                    )}
                  </div>
                  <div className="text-right text-xs">
                    {(rec.confidence * 100).toFixed(0)}% confidence
                  </div>
                </div>
                
                <div className="flex gap-2 mt-3 pt-3 border-t border-current opacity-60">
                  <Button
                    onClick={() => handleRecommendationAction(rec.id, 'apply')}
                    disabled={processing === rec.id || rec.status !== 'pending'}
                    size="sm"
                    className="flex-1 text-xs"
                  >
                    {processing === rec.id ? 'Applying...' : 'Auto-Apply'}
                  </Button>
                  <Button
                    onClick={() => handleRecommendationAction(rec.id, 'approve')}
                    disabled={processing === rec.id || rec.status !== 'pending'}
                    size="sm"
                    variant="outline"
                    className="flex-1 text-xs"
                  >
                    Approve
                  </Button>
                  <Button
                    onClick={() => handleRecommendationAction(rec.id, 'ignore')}
                    disabled={processing === rec.id || rec.status !== 'pending'}
                    size="sm"
                    variant="outline"
                    className="flex-1 text-xs"
                  >
                    Ignore
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}

