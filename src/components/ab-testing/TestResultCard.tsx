/**
 * Block 24020 — Simple A/B Test Result Card for Roofers
 * Shows winner in roofer-friendly format
 */

'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';

interface TestResult {
  test_id: string;
  test_type: string;
  winner_label: string;
  winner_open_rate: number;
  winner_reply_rate: number;
  improvement_percent: number;
  summary_text: string;
}

interface TestResultCardProps {
  campaignId: string;
}

export function TestResultCard({ campaignId }: TestResultCardProps) {
  const [result, setResult] = useState<TestResult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchResult() {
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      );

      const { data, error } = await supabase.rpc('get_ab_test_result_summary', {
        p_campaign_id: campaignId,
      });

      if (!error && data && data.length > 0) {
        setResult(data[0] as TestResult);
      }
      setLoading(false);
    }

    fetchResult();
  }, [campaignId]);

  if (loading) {
    return null;
  }

  if (!result) {
    return null;
  }

  return (
    <div className="rounded-lg border border-green-200 bg-green-50 p-4">
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-green-500 text-white">
            <span className="text-sm font-bold">✓</span>
          </div>
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-gray-900">
            Winner Selected: Version {result.winner_label}
          </h3>
          <p className="mt-1 text-sm text-gray-600">{result.summary_text}</p>
          <div className="mt-2 flex gap-4 text-xs text-gray-500">
            <span>
              {result.winner_open_rate.toFixed(1)}% open rate
            </span>
            <span>
              {result.winner_reply_rate.toFixed(1)}% reply rate
            </span>
            {result.improvement_percent && result.improvement_percent > 0 && (
              <span className="font-medium text-green-600">
                +{result.improvement_percent.toFixed(1)}% better
              </span>
            )}
          </div>
          <div className="mt-2 text-xs text-gray-500">
            <p className="font-medium">Why this won:</p>
            <ul className="mt-1 list-inside list-disc space-y-0.5">
              <li>More homeowners opened</li>
              <li>More homeowners replied</li>
              <li>Booked estimate potential increased</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}






































