"use client";

import { useEffect, useState } from "react";
import { createClientComponentClient } from "@/lib/supabase";

interface VariantSummary {
  campaign_id: string;
  template_variant_id: string;
  sends: number;
  replies: number;
  reply_rate_pct: number;
}

interface PromotionLog {
  id: string;
  action: string;
  message: string;
  meta: {
    template_variant_id?: string;
    p_value?: number;
    diff_pct?: number;
    winner_replies?: number;
    winner_sends?: number;
    contender_replies?: number;
    contender_sends?: number;
  };
  created_at: string;
}

interface ABPromotionDetailsProps {
  campaignId: string;
}

export default function ABPromotionDetails({ campaignId }: ABPromotionDetailsProps) {
  const supabase = createClientComponentClient();
  const [variants, setVariants] = useState<VariantSummary[]>([]);
  const [promotion, setPromotion] = useState<PromotionLog | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        // Fetch variant summaries
        const { data: variantData, error: vErr } = await supabase
          .from("campaign_variant_summary")
          .select("*")
          .eq("campaign_id", campaignId);

        if (vErr) throw vErr;
        setVariants(variantData || []);

        // Fetch promotion log
        const { data: logData, error: lErr } = await supabase
          .from("campaign_logs")
          .select("id, action, message, meta, created_at")
          .eq("campaign_id", campaignId)
          .eq("action", "ab_winner_promoted")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (lErr && lErr.code !== 'PGRST116') throw lErr; // PGRST116 = no rows
        if (logData) {
          setPromotion(logData as PromotionLog);
        }
      } catch (error) {
        console.error("Error fetching AB promotion details:", error);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [campaignId, supabase]);

  if (loading) {
    return (
      <div className="bg-white rounded-lg border p-4">
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-1/4 mb-4"></div>
          <div className="space-y-2">
            <div className="h-3 bg-gray-200 rounded"></div>
            <div className="h-3 bg-gray-200 rounded w-3/4"></div>
          </div>
        </div>
      </div>
    );
  }

  if (variants.length === 0 && !promotion) {
    return null; // Don't show if no data
  }

  return (
    <div className="bg-white rounded-lg border p-6 space-y-6">
      <h3 className="text-lg font-semibold text-gray-900">A/B Test Results</h3>

      {/* Variant Performance Table */}
      {variants.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-gray-700 mb-3">Variant Performance</h4>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Variant ID
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Sends
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Replies
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Reply Rate
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {variants.map((variant) => (
                  <tr key={variant.template_variant_id}>
                    <td className="px-4 py-3 whitespace-nowrap text-sm font-mono text-gray-900">
                      {variant.template_variant_id.slice(0, 8)}...
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                      {variant.sends}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                      {variant.replies}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                      {variant.reply_rate_pct.toFixed(2)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Promotion Decision */}
      {promotion && (
        <div className="border-t pt-4">
          <h4 className="text-sm font-medium text-gray-700 mb-3">Promotion Decision</h4>
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-yellow-800">Winner Locked</span>
              <span className="text-xs text-yellow-600">
                {new Date(promotion.created_at).toLocaleString()}
              </span>
            </div>
            {promotion.meta?.template_variant_id && (
              <div className="text-sm text-yellow-700">
                <strong>Winning Variant:</strong>{" "}
                <code className="bg-yellow-100 px-1 rounded">
                  {promotion.meta.template_variant_id.slice(0, 8)}...
                </code>
              </div>
            )}
            {promotion.meta?.p_value !== undefined && (
              <div className="text-sm text-yellow-700">
                <strong>P-value:</strong> {promotion.meta.p_value.toFixed(4)}
                {promotion.meta.p_value <= 0.05 && (
                  <span className="ml-2 text-green-600 font-semibold">✓ Significant</span>
                )}
              </div>
            )}
            {promotion.meta?.diff_pct !== undefined && (
              <div className="text-sm text-yellow-700">
                <strong>Reply Rate Difference:</strong> +{promotion.meta.diff_pct.toFixed(2)} percentage points
              </div>
            )}
            {promotion.message && (
              <div className="text-xs text-yellow-600 mt-2 italic">
                {promotion.message}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

