"use client";

// Block 26540 — SmartSend Roofing Lead Score & Heat Ranking v1
// Sales Priority Queue Page
// Shows leads ranked by closability with recommended next actions

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Phone, Mail, MapPin, Clock, TrendingUp } from "lucide-react";

type LeadPriority = {
  lead_id: string;
  workspace_id: string;
  name: string;
  email: string;
  phone: string | null;
  address: string;
  city: string | null;
  state: string | null;
  zip_code: string | null;
  created_at: string;
  last_reply_at: string | null;
  source: string | null;
  status: string | null;
  roofing_pipeline_stage: string | null;
  lead_status: string | null;
  total_score: number;
  heat_level: "hot" | "warm" | "cold" | "noise";
  reply_speed_score: number | null;
  intent_keyword_score: number | null;
  sentiment_score: number | null;
  source_score: number | null;
  location_score: number | null;
  next_action: string;
  score_insight: string | null;
};

export default function PriorityLeadsPage() {
  const [data, setData] = useState<LeadPriority[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [heatFilter, setHeatFilter] = useState<string>("all");
  const [limit, setLimit] = useState(50);

  useEffect(() => {
    fetchPriorityQueue();
  }, [heatFilter, limit]);

  const fetchPriorityQueue = async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        limit: limit.toString(),
        offset: "0",
      });

      if (heatFilter !== "all") {
        params.append("heat_level", heatFilter);
      }

      const response = await fetch(`/api/lead-priority?${params.toString()}`);
      
      if (!response.ok) {
        throw new Error("Failed to fetch lead priority queue");
      }

      const result = await response.json();
      setData(result.queue || []);
    } catch (err: any) {
      setError(err.message || "Failed to load leads");
      console.error("Error fetching priority queue:", err);
    } finally {
      setLoading(false);
    }
  };

  const getHeatBadgeColor = (heatLevel: string) => {
    switch (heatLevel) {
      case "hot":
        return "bg-red-100 text-red-800 border-red-300";
      case "warm":
        return "bg-yellow-100 text-yellow-800 border-yellow-300";
      case "cold":
        return "bg-blue-100 text-blue-800 border-blue-300";
      case "noise":
        return "bg-gray-100 text-gray-800 border-gray-300";
      default:
        return "bg-gray-100 text-gray-800 border-gray-300";
    }
  };

  const getHeatEmoji = (heatLevel: string) => {
    switch (heatLevel) {
      case "hot":
        return "🔥";
      case "warm":
        return "⭐";
      case "cold":
        return "❄️";
      case "noise":
        return "💤";
      default:
        return "";
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "Never";
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: date.getFullYear() !== new Date().getFullYear() ? "numeric" : undefined,
    });
  };

  const formatRelativeTime = (dateString: string | null) => {
    if (!dateString) return "No replies";
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return formatDate(dateString);
  };

  if (loading && data.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Lead Priority Queue</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Leads ranked by closability • See who to contact first
          </p>
        </div>
        <div className="flex items-center gap-4">
          <Select value={heatFilter} onValueChange={setHeatFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Filter by heat" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Leads</SelectItem>
              <SelectItem value="hot">🔥 Hot</SelectItem>
              <SelectItem value="warm">⭐ Warm</SelectItem>
              <SelectItem value="cold">❄️ Cold</SelectItem>
              <SelectItem value="noise">💤 Noise</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={fetchPriorityQueue} variant="outline" size="sm">
            Refresh
          </Button>
        </div>
      </div>

      {/* Error State */}
      {error && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-6">
            <p className="text-red-800">{error}</p>
          </CardContent>
        </Card>
      )}

      {/* Stats Summary */}
      {data.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Hot Leads</p>
                  <p className="text-2xl font-bold text-red-600">
                    {data.filter((l) => l.heat_level === "hot").length}
                  </p>
                </div>
                <div className="text-3xl">🔥</div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Warm Leads</p>
                  <p className="text-2xl font-bold text-yellow-600">
                    {data.filter((l) => l.heat_level === "warm").length}
                  </p>
                </div>
                <div className="text-3xl">⭐</div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Cold Leads</p>
                  <p className="text-2xl font-bold text-blue-600">
                    {data.filter((l) => l.heat_level === "cold").length}
                  </p>
                </div>
                <div className="text-3xl">❄️</div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Avg Score</p>
                  <p className="text-2xl font-bold">
                    {Math.round(
                      data.reduce((sum, l) => sum + l.total_score, 0) / data.length
                    )}
                  </p>
                </div>
                <div className="text-3xl">
                  <TrendingUp className="h-8 w-8 text-gray-400" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Priority Queue Table */}
      <Card>
        <CardHeader>
          <CardTitle>Sales Priority Queue</CardTitle>
          <CardDescription>
            Leads ranked by total score (highest closability first)
          </CardDescription>
        </CardHeader>
        <CardContent>
          {data.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <p>No leads found. Try adjusting your filters.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left border-b">
                    <th className="p-3 font-medium text-muted-foreground">Lead</th>
                    <th className="p-3 font-medium text-muted-foreground">Contact</th>
                    <th className="p-3 font-medium text-muted-foreground">Address</th>
                    <th className="p-3 font-medium text-muted-foreground">Score</th>
                    <th className="p-3 font-medium text-muted-foreground">Heat</th>
                    <th className="p-3 font-medium text-muted-foreground">Next Action</th>
                    <th className="p-3 font-medium text-muted-foreground">Last Reply</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((lead) => (
                    <tr
                      key={lead.lead_id}
                      className="border-b hover:bg-muted/50 transition-colors"
                    >
                      <td className="p-3">
                        <div className="font-medium">{lead.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {lead.source || "Unknown source"}
                        </div>
                      </td>
                      <td className="p-3">
                        <div className="flex flex-col gap-1">
                          <a
                            href={`mailto:${lead.email}`}
                            className="text-blue-600 hover:underline flex items-center gap-1"
                          >
                            <Mail className="h-3 w-3" />
                            {lead.email}
                          </a>
                          {lead.phone && (
                            <a
                              href={`tel:${lead.phone}`}
                              className="text-blue-600 hover:underline flex items-center gap-1"
                            >
                              <Phone className="h-3 w-3" />
                              {lead.phone}
                            </a>
                          )}
                        </div>
                      </td>
                      <td className="p-3">
                        <div className="flex items-start gap-1">
                          <MapPin className="h-3 w-3 mt-0.5 text-muted-foreground" />
                          <div>
                            <div>{lead.address || "No address"}</div>
                            {(lead.city || lead.state) && (
                              <div className="text-xs text-muted-foreground">
                                {[lead.city, lead.state, lead.zip_code]
                                  .filter(Boolean)
                                  .join(", ")}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="p-3">
                        <div className="font-bold text-lg">{lead.total_score}</div>
                        {lead.score_insight && (
                          <div className="text-xs text-muted-foreground">
                            {lead.score_insight}
                          </div>
                        )}
                      </td>
                      <td className="p-3">
                        <Badge
                          className={`${getHeatBadgeColor(lead.heat_level)} font-bold`}
                        >
                          {getHeatEmoji(lead.heat_level)} {lead.heat_level.toUpperCase()}
                        </Badge>
                      </td>
                      <td className="p-3">
                        <div className="font-medium">{lead.next_action}</div>
                        {lead.roofing_pipeline_stage && (
                          <div className="text-xs text-muted-foreground">
                            Stage: {lead.roofing_pipeline_stage}
                          </div>
                        )}
                      </td>
                      <td className="p-3">
                        <div className="flex items-center gap-1 text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          <span className="text-xs">
                            {formatRelativeTime(lead.last_reply_at)}
                          </span>
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">
                          Created {formatDate(lead.created_at)}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Load More */}
      {data.length >= limit && (
        <div className="flex justify-center">
          <Button
            onClick={() => setLimit(limit + 50)}
            variant="outline"
            disabled={loading}
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Loading...
              </>
            ) : (
              "Load More"
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
