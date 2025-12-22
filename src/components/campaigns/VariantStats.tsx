"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/badge";

type VariantStat = {
  variant_id: string;
  variant_name: string;
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  replied: number;
  bounced: number;
  spam: number;
  open_rate: number;
  click_rate: number;
  reply_rate: number;
  bounce_rate: number;
  spam_rate: number;
  delivery_rate: number;
};

type VariantStatsProps = {
  stepId: string;
  campaignId: string;
};

export function VariantStats({ stepId, campaignId }: VariantStatsProps) {
  const [variants, setVariants] = useState<VariantStat[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadVariantStats() {
      setLoading(true);
      try {
        const res = await fetch(`/api/campaigns/${campaignId}/steps/${stepId}/variants/stats`);
        if (res.ok) {
          const data = await res.json();
          setVariants(data.variants || []);
        }
      } catch (error) {
        console.error("Failed to load variant stats:", error);
      } finally {
        setLoading(false);
      }
    }

    if (stepId && campaignId) {
      loadVariantStats();
    }
  }, [stepId, campaignId]);

  if (loading) {
    return (
      <Card>
        <CardContent className="p-4">
          <div className="text-sm text-muted-foreground">Loading variant stats...</div>
        </CardContent>
      </Card>
    );
  }

  if (variants.length === 0) {
    return null;
  }

  // Find winner (highest reply rate, then open rate)
  const winner = variants.reduce((best, current) => {
    if (current.reply_rate > best.reply_rate) return current;
    if (current.reply_rate === best.reply_rate && current.open_rate > best.open_rate) return current;
    return best;
  }, variants[0]);

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="text-sm font-medium">Variant Performance</div>
        {variants.map((variant) => {
          const isWinner = variant.variant_id === winner.variant_id;
          return (
            <div
              key={variant.variant_id}
              className={`border rounded-md p-3 ${
                isWinner ? "bg-green-50 border-green-200" : ""
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{variant.variant_name}</span>
                  {isWinner && (
                    <Badge variant="outline" className="bg-green-100 text-green-800">
                      Winner
                    </Badge>
                  )}
                </div>
                <div className="text-xs text-muted-foreground">
                  {variant.sent.toLocaleString()} sends
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 text-sm">
                <div>
                  <span className="text-muted-foreground">Open:</span>{" "}
                  <span className="font-semibold">{variant.open_rate.toFixed(1)}%</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Click:</span>{" "}
                  <span className="font-semibold">{variant.click_rate.toFixed(1)}%</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Reply:</span>{" "}
                  <span className="font-semibold">{variant.reply_rate.toFixed(2)}%</span>
                </div>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}



