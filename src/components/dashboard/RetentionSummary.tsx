'use client';

import { useState, useEffect } from 'react';
import { createClientComponentClient } from '@supabase/supabase-js';
import { Card } from '@/components/ui/Card';
import { TrendingUp, TrendingDown, Users, AlertCircle } from 'lucide-react';

interface RetentionMetrics {
  org_id: string;
  org_name: string;
  nps_avg_score: number | null;
  nps_latest_score: number | null;
  promoters: number;
  passives: number;
  detractors: number;
  churn_risk_count: number;
  winback_sent_count: number;
}

export default function RetentionSummary() {
  const supabase = createClientComponentClient();
  const [metrics, setMetrics] = useState<RetentionMetrics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadMetrics() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }

      // Get org_id
      const { data: membership } = await supabase
        .from('org_members')
        .select('org_id')
        .eq('user_id', user.id)
        .limit(1)
        .maybeSingle();

      if (!membership) {
        setLoading(false);
        return;
      }

      // Fetch metrics
      const { data } = await supabase
        .from('view_retention_metrics')
        .select('*')
        .eq('org_id', membership.org_id)
        .maybeSingle();

      setMetrics(data);
      setLoading(false);
    }

    loadMetrics();
  }, [supabase]);

  if (loading) {
    return (
      <Card className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-4 bg-gray-200 rounded w-1/4"></div>
          <div className="h-8 bg-gray-200 rounded w-1/2"></div>
        </div>
      </Card>
    );
  }

  if (!metrics) {
    return null;
  }

  const npsScore = metrics.nps_latest_score ?? metrics.nps_avg_score ?? 0;
  const npsClassification = npsScore >= 9 ? 'promoter' : npsScore >= 7 ? 'passive' : 'detractor';
  const totalResponses = metrics.promoters + metrics.passives + metrics.detractors;

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">Retention Metrics</h3>
        {metrics.churn_risk_count > 0 && (
          <div className="flex items-center gap-2 text-amber-600">
            <AlertCircle className="h-5 w-5" />
            <span className="text-sm font-medium">Churn Risk: {metrics.churn_risk_count}</span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* NPS Score */}
        <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="h-5 w-5 text-blue-600" />
            <span className="text-sm font-medium text-blue-900">NPS Score</span>
          </div>
          <div className="text-3xl font-bold text-blue-700">{npsScore.toFixed(1)}</div>
          {totalResponses > 0 && (
            <div className="mt-2 text-sm text-blue-600">
              {totalResponses} response{totalResponses !== 1 ? 's' : ''}
            </div>
          )}
        </div>

        {/* NPS Breakdown */}
        <div className="bg-gray-50 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-3">
            <Users className="h-5 w-5 text-gray-600" />
            <span className="text-sm font-medium text-gray-700">NPS Breakdown</span>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-green-700">Promoters</span>
              <span className="font-semibold">{metrics.promoters}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-yellow-700">Passives</span>
              <span className="font-semibold">{metrics.passives}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-red-700">Detractors</span>
              <span className="font-semibold">{metrics.detractors}</span>
            </div>
          </div>
        </div>

        {/* Win-back Activity */}
        <div className="bg-purple-50 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <TrendingDown className="h-5 w-5 text-purple-600" />
            <span className="text-sm font-medium text-purple-900">Win-back Emails</span>
          </div>
          <div className="text-3xl font-bold text-purple-700">{metrics.winback_sent_count}</div>
          {metrics.winback_sent_count > 0 && (
            <div className="mt-2 text-sm text-purple-600">
              Engagement campaigns sent
            </div>
          )}
        </div>
      </div>

      {totalResponses === 0 && (
        <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-lg">
          <p className="text-sm text-amber-800">
            No NPS responses yet. Start collecting feedback to track customer satisfaction.
          </p>
        </div>
      )}
    </Card>
  );
}

