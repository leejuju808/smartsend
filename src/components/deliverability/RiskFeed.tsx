// src/components/deliverability/RiskFeed.tsx
// Risk Feed: list of blocked/throttled items with reason and a quick "Fix content" link

"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/badge";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import Link from "next/link";

interface RiskItem {
  id: string;
  campaign_id: string;
  contact_id: string | null;
  subject: string | null;
  body: string | null;
  throttled: boolean;
  throttle_reason: string | null;
  spam_risk: number | null;
  created_at: string;
  campaign_name?: string;
}

export function RiskFeed({ accountId }: { accountId: string }) {
  const supabase = createClientComponentClient();
  const [items, setItems] = useState<RiskItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        // Get throttled/blocked messages from scheduled_messages
        const { data: messages, error } = await supabase
          .from("scheduled_messages")
          .select("*, campaigns(name)")
          .eq("throttled", true)
          .order("created_at", { ascending: false })
          .limit(50);

        if (error) throw error;

        const riskItems: RiskItem[] = (messages || []).map((m: any) => ({
          id: m.id,
          campaign_id: m.campaign_id,
          contact_id: m.contact_id,
          subject: m.subject,
          body: m.body,
          throttled: m.throttled,
          throttle_reason: m.throttle_reason,
          spam_risk: m.spam_risk,
          created_at: m.created_at,
          campaign_name: m.campaigns?.name,
        }));

        setItems(riskItems);
      } catch (err) {
        console.error("Error loading risk feed:", err);
      } finally {
        setLoading(false);
      }
    }

    if (accountId) {
      load();
      // Refresh every 30 seconds
      const interval = setInterval(load, 30000);
      return () => clearInterval(interval);
    }
  }, [accountId, supabase]);

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Risk Feed</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-muted-foreground">Loading...</div>
        </CardContent>
      </Card>
    );
  }

  if (items.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Risk Feed</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-muted-foreground">No blocked or throttled items</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Risk Feed</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {items.map((item) => (
            <div key={item.id} className="border rounded-lg p-3">
              <div className="flex items-start justify-between mb-2">
                <div className="flex-1">
                  <div className="font-medium text-sm mb-1">
                    {item.subject || "(no subject)"}
                  </div>
                  <div className="text-xs text-muted-foreground mb-2">
                    {item.campaign_name || `Campaign ${item.campaign_id.slice(0, 8)}`}
                  </div>
                </div>
                <div className="flex gap-2">
                  {item.throttled && (
                    <Badge variant="destructive" className="text-xs">
                      THROTTLED
                    </Badge>
                  )}
                  {item.spam_risk !== null && item.spam_risk >= 0.55 && (
                    <Badge variant="outline" className="text-xs text-amber-600">
                      Risk {(item.spam_risk * 100).toFixed(0)}%
                    </Badge>
                  )}
                </div>
              </div>
              <div className="text-xs text-muted-foreground mb-2">
                Reason: {item.throttle_reason || "content_risky"}
              </div>
              {item.campaign_id && (
                <Link href={`/campaigns/${item.campaign_id}`}>
                  <Button variant="outline" size="sm" className="text-xs">
                    Fix Content
                  </Button>
                </Link>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

