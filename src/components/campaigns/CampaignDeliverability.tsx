"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

interface DeliverabilityData {
  attempts: number;
  delivered: number;
  bounced: number;
  failed: number;
  complaints: number;
}

export function CampaignDeliverability({ campaignId }: { campaignId: string }) {
  const [data, setData] = useState<DeliverabilityData | null>(null);
  const [loading, setLoading] = useState(true);
  const supabase = createClientComponentClient();

  useEffect(() => {
    async function load() {
      try {
        const { data: deliverability, error } = await supabase
          .from("v_campaign_deliverability")
          .select("*")
          .eq("campaign_id", campaignId)
          .maybeSingle();

        if (error) {
          console.error("Error loading deliverability:", error);
          setData({
            attempts: 0,
            delivered: 0,
            bounced: 0,
            failed: 0,
            complaints: 0,
          });
        } else {
          setData(deliverability || {
            attempts: 0,
            delivered: 0,
            bounced: 0,
            failed: 0,
            complaints: 0,
          });
        }
      } catch (e) {
        console.error("Error:", e);
        setData({
          attempts: 0,
          delivered: 0,
          bounced: 0,
          failed: 0,
          complaints: 0,
        });
      } finally {
        setLoading(false);
      }
    }
    load();

    // Refresh every 30 seconds
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, [campaignId, supabase]);

  if (loading) {
    return (
      <Card className="p-4">
        <div className="text-sm text-muted-foreground">Loading deliverability...</div>
      </Card>
    );
  }

  const attempts = data?.attempts ?? 0;
  const delivered = data?.delivered ?? 0;
  const bounced = data?.bounced ?? 0;
  const failed = data?.failed ?? 0;
  const complaints = data?.complaints ?? 0;

  const deliveredRate = attempts > 0 ? ((delivered / attempts) * 100).toFixed(1) : "0.0";
  const bounceRate = attempts > 0 ? ((bounced / attempts) * 100).toFixed(1) : "0.0";
  const complaintRate = attempts > 0 ? ((complaints / attempts) * 100).toFixed(2) : "0.00";

  return (
    <Card className="p-4 space-y-4">
      <div className="text-sm font-medium">Deliverability Summary</div>
      
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div>
          <div className="text-xs text-muted-foreground">Total Attempts</div>
          <div className="text-xl font-semibold">{attempts}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Delivered</div>
          <div className="text-xl font-semibold text-green-600">
            {delivered} <span className="text-sm">({deliveredRate}%)</span>
          </div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Bounced</div>
          <div className="text-xl font-semibold text-red-600">
            {bounced} <span className="text-sm">({bounceRate}%)</span>
          </div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Complaints</div>
          <div className="text-xl font-semibold text-orange-600">
            {complaints} <span className="text-sm">({complaintRate}%)</span>
          </div>
        </div>
      </div>

      {attempts > 0 && (
        <div className="space-y-2">
          <div className="text-xs text-muted-foreground">Delivery Rate</div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-green-600 h-2 rounded-full transition-all"
              style={{ width: `${deliveredRate}%` }}
            />
          </div>
        </div>
      )}

      {failed > 0 && (
        <div className="text-xs text-muted-foreground">
          Failed sends: {failed}
        </div>
      )}
    </Card>
  );
}

