"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Trophy, TrendingUp } from "lucide-react";

type VariantMetric = {
  variant_key: 'A' | 'B';
  sent: number;
  replies: number;
  hot: number;
  reply_rate: number;
  hot_rate: number;
  is_winner?: boolean;
};

type VariantAnalyticsResponse = {
  variants: VariantMetric[];
  winner: 'A' | 'B' | null;
  improvement: number | null;
};

type ABVariantAnalyticsProps = {
  campaignId: string;
  stepId: string;
  stepNo: number;
};

export function ABVariantAnalytics({ campaignId, stepId, stepNo }: ABVariantAnalyticsProps) {
  const [variants, setVariants] = useState<VariantMetric[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadAnalytics();
  }, [campaignId, stepId]);

  async function loadAnalytics() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/steps/${stepId}/variants/analytics`);
      const data: VariantAnalyticsResponse = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || "Failed to load analytics");
      }

      if (data.variants && data.variants.length > 0) {
        setVariants(data.variants);
      } else {
        setVariants([]);
      }
    } catch (err: any) {
      setError(err.message || "Failed to load variant analytics");
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="p-4">
          <div className="text-sm text-muted-foreground">Loading variant analytics...</div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="p-4">
          <div className="text-sm text-red-600">{error}</div>
        </CardContent>
      </Card>
    );
  }

  if (variants.length === 0) {
    return (
      <Card>
        <CardContent className="p-4">
          <div className="text-sm text-muted-foreground">
            No A/B test data available. Enable variants and send some emails to see metrics.
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="p-4">
      <CardHeader className="p-0 pb-4">
        <CardTitle className="text-lg">A/B Test Breakdown - Step {stepNo}</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left p-2 font-semibold">Variant</th>
                <th className="text-right p-2 font-semibold">Sent</th>
                <th className="text-right p-2 font-semibold">Replies</th>
                <th className="text-right p-2 font-semibold">HOT</th>
                <th className="text-right p-2 font-semibold">Reply Rate</th>
                <th className="text-right p-2 font-semibold">Hot Rate</th>
              </tr>
            </thead>
            <tbody>
              {variants.map((variant) => (
                <tr
                  key={variant.variant_key}
                  className={`border-b ${
                    variant.is_winner
                      ? "bg-green-50 border-green-200"
                      : "hover:bg-muted/50"
                  }`}
                >
                  <td className="p-2">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">Variant {variant.variant_key}</span>
                      {variant.is_winner && (
                        <div className="flex items-center gap-1 text-green-600">
                          <Trophy className="h-4 w-4" />
                          <span className="text-xs font-semibold">Winning Variant</span>
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="text-right p-2">{variant.sent.toLocaleString()}</td>
                  <td className="text-right p-2">{variant.replies.toLocaleString()}</td>
                  <td className="text-right p-2 font-semibold text-orange-600">
                    {variant.hot.toLocaleString()}
                  </td>
                  <td className="text-right p-2">
                    <div className="flex items-center justify-end gap-1">
                      {variant.reply_rate.toFixed(1)}%
                      {variant.is_winner && (
                        <TrendingUp className="h-3 w-3 text-green-600" />
                      )}
                    </div>
                  </td>
                  <td className="text-right p-2">
                    <div className="flex items-center justify-end gap-1">
                      {variant.hot_rate.toFixed(1)}%
                      {variant.is_winner && (
                        <TrendingUp className="h-3 w-3 text-green-600" />
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        
        {variants.some(v => v.is_winner) && (
          <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-md">
            <div className="flex items-start gap-2">
              <Trophy className="h-5 w-5 text-green-600 mt-0.5" />
              <div className="flex-1">
                <div className="text-sm font-semibold text-green-900">
                  Winner: Variant {variants.find(v => v.is_winner)?.variant_key}
                </div>
                <div className="text-xs text-green-700 mt-1">
                  Variant {variants.find(v => v.is_winner)?.variant_key} is performing better with a {variants.find(v => v.is_winner)?.reply_rate.toFixed(1)}% reply rate. 
                  Consider using this variant as your default for future campaigns.
                </div>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

