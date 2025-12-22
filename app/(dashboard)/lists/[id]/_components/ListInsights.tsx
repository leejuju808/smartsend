"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { TrendingUp, Users, Mail, DollarSign, Tag } from "lucide-react";

type Insights = {
  insights: {
    total_contacts: number;
    hot_count: number;
    warm_count: number;
    not_interested_count: number;
    new_count: number;
    contacts_with_replies: number;
    emails_sent: number;
    tags_in_list: string[];
  };
  metrics: {
    reply_rate: number;
    hot_percentage: number;
    estimated_value: number;
  };
  campaigns: Array<{
    id: string;
    name: string;
    created_at: string;
  }>;
};

export function ListInsights({ listId }: { listId: string }) {
  const [insights, setInsights] = useState<Insights | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadInsights = async () => {
      try {
        const res = await fetch(`/api/lists/${listId}/insights`);
        const json = await res.json();
        setInsights(json);
      } catch (error) {
        console.error("Error loading insights:", error);
      } finally {
        setLoading(false);
      }
    };

    loadInsights();
  }, [listId]);

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>List Insights</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4 animate-pulse">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-16 bg-gray-200 rounded"></div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!insights) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>List Insights</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No insights available</p>
        </CardContent>
      </Card>
    );
  }

  const { insights: data, metrics, campaigns } = insights;

  return (
    <Card>
      <CardHeader>
        <CardTitle>List Insights</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Total Contacts */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">Total Contacts</span>
            <Users className="h-4 w-4 text-muted-foreground" />
          </div>
          <p className="text-2xl font-bold">{data.total_contacts}</p>
        </div>

        {/* Reply Rate */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">Reply Rate</span>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </div>
          <p className="text-2xl font-bold">{metrics.reply_rate.toFixed(1)}%</p>
          <p className="text-xs text-muted-foreground mt-1">
            {data.contacts_with_replies} with replies
          </p>
        </div>

        {/* HOT Percentage */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">% HOT</span>
            <TrendingUp className="h-4 w-4 text-green-600" />
          </div>
          <p className="text-2xl font-bold text-green-600">
            {metrics.hot_percentage.toFixed(1)}%
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {data.hot_count} HOT contacts
          </p>
        </div>

        {/* Status Breakdown */}
        <div className="space-y-2 pt-4 border-t">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">HOT</span>
            <span className="font-semibold">{data.hot_count}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">WARM</span>
            <span className="font-semibold">{data.warm_count}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">NEW</span>
            <span className="font-semibold">{data.new_count}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Not Interested</span>
            <span className="font-semibold">{data.not_interested_count}</span>
          </div>
        </div>

        {/* Emails Sent */}
        <div className="pt-4 border-t">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">Emails Sent</span>
            <Mail className="h-4 w-4 text-muted-foreground" />
          </div>
          <p className="text-2xl font-bold">{data.emails_sent}</p>
        </div>

        {/* Estimated Value */}
        {metrics.estimated_value > 0 && (
          <div className="pt-4 border-t">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">Estimated Value</span>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </div>
            <p className="text-2xl font-bold">
              ${metrics.estimated_value.toLocaleString()}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Based on HOT leads
            </p>
          </div>
        )}

        {/* Tags in List */}
        {data.tags_in_list && data.tags_in_list.length > 0 && (
          <div className="pt-4 border-t">
            <div className="flex items-center gap-2 mb-2">
              <Tag className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Tags</span>
            </div>
            <div className="flex flex-wrap gap-1">
              {data.tags_in_list.slice(0, 10).map((tag) => (
                <span
                  key={tag}
                  className="px-2 py-0.5 bg-gray-100 text-gray-700 text-xs rounded"
                >
                  {tag}
                </span>
              ))}
              {data.tags_in_list.length > 10 && (
                <span className="text-xs text-muted-foreground">
                  +{data.tags_in_list.length - 10} more
                </span>
              )}
            </div>
          </div>
        )}

        {/* Campaigns */}
        {campaigns.length > 0 && (
          <div className="pt-4 border-t">
            <div className="flex items-center gap-2 mb-2">
              <Mail className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Campaigns</span>
            </div>
            <div className="space-y-1">
              {campaigns.slice(0, 5).map((campaign) => (
                <div key={campaign.id} className="text-xs text-muted-foreground">
                  {campaign.name}
                </div>
              ))}
              {campaigns.length > 5 && (
                <div className="text-xs text-muted-foreground">
                  +{campaigns.length - 5} more
                </div>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}





















































