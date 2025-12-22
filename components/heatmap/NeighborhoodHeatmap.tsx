"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { NeighborhoodProfileCard } from "./NeighborhoodProfileCard";
import { HeatmapInsights } from "./HeatmapInsights";
import { CampaignSuggestions } from "./CampaignSuggestions";
import { MapPin, TrendingUp, AlertCircle } from "lucide-react";

type HeatmapLayer = "engagement" | "pipeline" | "storm";

interface HeatmapDataPoint {
  zip: string;
  neighborhood_name?: string;
  city?: string;
  state?: string;
  center_lat?: number;
  center_lon?: number;
  engagement_heat_score?: number;
  engagement_heat_color?: "green" | "yellow" | "red";
  pipeline_heat_score?: number;
  storm_severity_score?: number;
  storm_risk_level?: "low" | "medium" | "high";
  opportunity_score?: number;
  [key: string]: any;
}

interface NeighborhoodHeatmapProps {
  workspaceId: string;
}

export function NeighborhoodHeatmap({ workspaceId }: NeighborhoodHeatmapProps) {
  const [layer, setLayer] = useState<HeatmapLayer>("engagement");
  const [heatmapData, setHeatmapData] = useState<HeatmapDataPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedNeighborhood, setSelectedNeighborhood] = useState<{
    zip: string;
    neighborhood_name?: string;
  } | null>(null);
  const [showProfile, setShowProfile] = useState(false);

  useEffect(() => {
    loadHeatmapData();
  }, [workspaceId, layer]);

  const loadHeatmapData = async () => {
    setLoading(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        console.error("Not authenticated");
        return;
      }

      const response = await fetch(
        `/api/heatmap/data?workspace_id=${workspaceId}&layer=${layer}`
      );
      
      if (!response.ok) {
        throw new Error("Failed to load heatmap data");
      }

      const result = await response.json();
      setHeatmapData(result.data || []);
    } catch (error) {
      console.error("Error loading heatmap data:", error);
    } finally {
      setLoading(false);
    }
  };

  const getHeatColor = (score?: number, color?: string) => {
    if (color) {
      return {
        green: "bg-green-500",
        yellow: "bg-yellow-500",
        red: "bg-red-500",
      }[color] || "bg-gray-300";
    }
    
    if (score === undefined) return "bg-gray-300";
    
    if (score >= 70) return "bg-green-500";
    if (score >= 40) return "bg-yellow-500";
    return "bg-red-500";
  };

  const getHeatIntensity = (score?: number) => {
    if (score === undefined) return 0.3;
    return Math.max(0.3, Math.min(1, score / 100));
  };

  const handleNeighborhoodClick = (zip: string, neighborhood_name?: string) => {
    setSelectedNeighborhood({ zip, neighborhood_name });
    setShowProfile(true);
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <div className="text-muted-foreground">Loading heatmap data...</div>
        </CardContent>
      </Card>
    );
}

  return (
    <div className="space-y-6">
      {/* Layer Selector */}
      <Card>
        <CardHeader>
          <CardTitle>Neighborhood Heatmap</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2 mb-6">
            <Button
              variant={layer === "engagement" ? "default" : "outline"}
              onClick={() => setLayer("engagement")}
              size="sm"
            >
              <TrendingUp className="w-4 h-4 mr-2" />
              Engagement
            </Button>
            <Button
              variant={layer === "pipeline" ? "default" : "outline"}
              onClick={() => setLayer("pipeline")}
              size="sm"
            >
              Pipeline
            </Button>
            <Button
              variant={layer === "storm" ? "default" : "outline"}
              onClick={() => setLayer("storm")}
              size="sm"
            >
              <AlertCircle className="w-4 h-4 mr-2" />
              Storm Impact
            </Button>
          </div>

          {/* Heatmap Grid */}
          {heatmapData.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              No heatmap data available. Start sending campaigns to see neighborhood performance.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {heatmapData.map((point, idx) => (
                <div
                  key={`${point.zip}-${point.neighborhood_name || ""}-${idx}`}
                  className="border rounded-lg p-4 cursor-pointer hover:shadow-md transition-shadow"
                  onClick={() => handleNeighborhoodClick(point.zip, point.neighborhood_name)}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <h4 className="font-semibold">
                        {point.neighborhood_name || `ZIP ${point.zip}`}
                      </h4>
                      {point.city && point.state && (
                        <p className="text-sm text-muted-foreground">
                          {point.city}, {point.state}
                        </p>
                      )}
                    </div>
                    <div
                      className={`w-4 h-4 rounded-full ${getHeatColor(
                        layer === "engagement"
                          ? point.engagement_heat_score
                          : layer === "pipeline"
                          ? point.pipeline_heat_score
                          : point.storm_severity_score,
                        point.engagement_heat_color
                      )}`}
                      style={{
                        opacity: getHeatIntensity(
                          layer === "engagement"
                            ? point.engagement_heat_score
                            : layer === "pipeline"
                            ? point.pipeline_heat_score
                            : point.storm_severity_score
                        ),
                      }}
                    />
                  </div>

                  {layer === "engagement" && (
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Reply Rate:</span>
                        <span className="font-medium">
                          {point.reply_rate_pct?.toFixed(1) || 0}%
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Open Rate:</span>
                        <span className="font-medium">
                          {point.open_rate_pct?.toFixed(1) || 0}%
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Bookings:</span>
                        <span className="font-medium">{point.total_bookings || 0}</span>
                      </div>
                    </div>
                  )}

                  {layer === "pipeline" && (
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Active Jobs:</span>
                        <span className="font-medium">{point.total_active_jobs || 0}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Total Revenue:</span>
                        <span className="font-medium">
                          ${point.total_revenue?.toLocaleString() || 0}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Avg Job Value:</span>
                        <span className="font-medium">
                          ${point.avg_job_value?.toLocaleString() || 0}
                        </span>
                      </div>
                    </div>
                  )}

                  {layer === "storm" && (
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Storm Risk:</span>
                        <span className="font-medium capitalize">
                          {point.storm_risk_level || "low"}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Severity Score:</span>
                        <span className="font-medium">{point.storm_severity_score || 0}/100</span>
                      </div>
                      {point.last_storm_date && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Last Storm:</span>
                          <span className="font-medium text-xs">
                            {new Date(point.last_storm_date).toLocaleDateString()}
                          </span>
                        </div>
                      )}
                    </div>
                  )}

                  {point.opportunity_score !== undefined && (
                    <div className="mt-3 pt-3 border-t">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">Opportunity Score</span>
                        <span className="text-sm font-semibold">
                          {point.opportunity_score}/100
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Insights */}
      <HeatmapInsights workspaceId={workspaceId} />

      {/* Campaign Suggestions */}
      <CampaignSuggestions workspaceId={workspaceId} />

      {/* Neighborhood Profile Modal */}
      {showProfile && selectedNeighborhood && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-start mb-4">
                <h2 className="text-xl font-semibold">Neighborhood Profile</h2>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setShowProfile(false);
                    setSelectedNeighborhood(null);
                  }}
                >
                  ✕
                </Button>
              </div>
              <NeighborhoodProfileCard
                workspaceId={workspaceId}
                zip={selectedNeighborhood.zip}
                neighborhoodName={selectedNeighborhood.neighborhood_name}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}






































