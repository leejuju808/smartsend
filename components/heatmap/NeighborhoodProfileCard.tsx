"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { MapPin, TrendingUp, Home, DollarSign, AlertTriangle } from "lucide-react";

interface NeighborhoodProfile {
  zip: string;
  neighborhood_name?: string;
  city?: string;
  state?: string;
  avg_home_age?: number;
  avg_roof_size_sqft?: number;
  avg_home_value?: number;
  median_home_value?: number;
  reply_rate_pct?: number;
  booked_inspections_count?: number;
  jobs_won_count?: number;
  avg_job_value?: number;
  storm_risk?: "low" | "medium" | "high";
  storm_history_count?: number;
  last_storm_date?: string;
  avg_income?: number;
  median_income?: number;
  income_band?: "low" | "medium" | "high" | "luxury";
  trending_interest_score?: number;
  interest_trend?: "rising" | "stable" | "declining";
  opportunity_score?: number;
}

interface NeighborhoodProfileCardProps {
  workspaceId: string;
  zip: string;
  neighborhoodName?: string;
}

export function NeighborhoodProfileCard({
  workspaceId,
  zip,
  neighborhoodName,
}: NeighborhoodProfileCardProps) {
  const [profile, setProfile] = useState<NeighborhoodProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadProfile();
  }, [workspaceId, zip, neighborhoodName]);

  const loadProfile = async () => {
    setLoading(true);
    try {
      const url = new URL("/api/heatmap/profile", window.location.origin);
      url.searchParams.set("workspace_id", workspaceId);
      url.searchParams.set("zip", zip);
      if (neighborhoodName) {
        url.searchParams.set("neighborhood_name", neighborhoodName);
      }

      const response = await fetch(url.toString());
      if (!response.ok) {
        throw new Error("Failed to load profile");
      }

      const result = await response.json();
      setProfile(result.profile);
    } catch (error) {
      console.error("Error loading profile:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="text-center text-muted-foreground">Loading profile...</div>
        </CardContent>
      </Card>
    );
  }

  if (!profile) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="text-center text-muted-foreground">Profile not found</div>
        </CardContent>
      </Card>
    );
  }

  const getOpportunityColor = (score?: number) => {
    if (!score) return "text-gray-500";
    if (score >= 8) return "text-green-600";
    if (score >= 6) return "text-yellow-600";
    return "text-red-600";
  };

  const getStormRiskColor = (risk?: string) => {
    switch (risk) {
      case "high":
        return "text-red-600";
      case "medium":
        return "text-yellow-600";
      default:
        return "text-green-600";
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="border-b pb-4">
        <h3 className="text-2xl font-bold mb-1">
          {profile.neighborhood_name || `ZIP ${profile.zip}`}
        </h3>
        {profile.city && profile.state && (
          <div className="flex items-center text-muted-foreground">
            <MapPin className="w-4 h-4 mr-1" />
            {profile.city}, {profile.state}
          </div>
        )}
      </div>

      {/* Opportunity Score */}
      {profile.opportunity_score !== undefined && (
        <div className="bg-gray-50 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-muted-foreground">Opportunity Score</span>
            <span className={`text-3xl font-bold ${getOpportunityColor(profile.opportunity_score)}`}>
              {profile.opportunity_score}/10
            </span>
          </div>
        </div>
      )}

      {/* Property Intelligence */}
      <Card>
        <CardContent className="p-4">
          <h4 className="font-semibold mb-3 flex items-center">
            <Home className="w-4 h-4 mr-2" />
            Property Intelligence
          </h4>
          <div className="grid grid-cols-2 gap-4 text-sm">
            {profile.avg_home_age !== undefined && (
              <div>
                <span className="text-muted-foreground">Home Age:</span>
                <span className="ml-2 font-medium">{profile.avg_home_age.toFixed(1)} years</span>
              </div>
            )}
            {profile.avg_home_value !== undefined && (
              <div>
                <span className="text-muted-foreground">Avg Home Value:</span>
                <span className="ml-2 font-medium">
                  ${profile.avg_home_value.toLocaleString()}
                </span>
              </div>
            )}
            {profile.median_home_value !== undefined && (
              <div>
                <span className="text-muted-foreground">Median Home Value:</span>
                <span className="ml-2 font-medium">
                  ${profile.median_home_value.toLocaleString()}
                </span>
              </div>
            )}
            {profile.avg_roof_size_sqft !== undefined && (
              <div>
                <span className="text-muted-foreground">Avg Roof Size:</span>
                <span className="ml-2 font-medium">{profile.avg_roof_size_sqft} sq ft</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Engagement Metrics */}
      <Card>
        <CardContent className="p-4">
          <h4 className="font-semibold mb-3 flex items-center">
            <TrendingUp className="w-4 h-4 mr-2" />
            Engagement Metrics
          </h4>
          <div className="grid grid-cols-2 gap-4 text-sm">
            {profile.reply_rate_pct !== undefined && (
              <div>
                <span className="text-muted-foreground">Reply Rate:</span>
                <span className="ml-2 font-medium">{profile.reply_rate_pct.toFixed(1)}%</span>
              </div>
            )}
            {profile.booked_inspections_count !== undefined && (
              <div>
                <span className="text-muted-foreground">Booked Inspections:</span>
                <span className="ml-2 font-medium">{profile.booked_inspections_count}</span>
              </div>
            )}
            {profile.jobs_won_count !== undefined && (
              <div>
                <span className="text-muted-foreground">Jobs Won:</span>
                <span className="ml-2 font-medium">{profile.jobs_won_count}</span>
              </div>
            )}
            {profile.avg_job_value !== undefined && (
              <div>
                <span className="text-muted-foreground">Avg Job Value:</span>
                <span className="ml-2 font-medium">
                  ${profile.avg_job_value.toLocaleString()}
                </span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Storm Intelligence */}
      <Card>
        <CardContent className="p-4">
          <h4 className="font-semibold mb-3 flex items-center">
            <AlertTriangle className="w-4 h-4 mr-2" />
            Storm Intelligence
          </h4>
          <div className="grid grid-cols-2 gap-4 text-sm">
            {profile.storm_risk && (
              <div>
                <span className="text-muted-foreground">Storm Risk:</span>
                <span className={`ml-2 font-medium capitalize ${getStormRiskColor(profile.storm_risk)}`}>
                  {profile.storm_risk}
                </span>
              </div>
            )}
            {profile.storm_history_count !== undefined && (
              <div>
                <span className="text-muted-foreground">Storm History:</span>
                <span className="ml-2 font-medium">{profile.storm_history_count} events</span>
              </div>
            )}
            {profile.last_storm_date && (
              <div className="col-span-2">
                <span className="text-muted-foreground">Last Storm:</span>
                <span className="ml-2 font-medium">
                  {new Date(profile.last_storm_date).toLocaleDateString()}
                </span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Demographics */}
      {(profile.avg_income !== undefined || profile.income_band) && (
        <Card>
          <CardContent className="p-4">
            <h4 className="font-semibold mb-3 flex items-center">
              <DollarSign className="w-4 h-4 mr-2" />
              Demographics
            </h4>
            <div className="grid grid-cols-2 gap-4 text-sm">
              {profile.avg_income !== undefined && (
                <div>
                  <span className="text-muted-foreground">Avg Income:</span>
                  <span className="ml-2 font-medium">
                    ${profile.avg_income.toLocaleString()}
                  </span>
                </div>
              )}
              {profile.median_income !== undefined && (
                <div>
                  <span className="text-muted-foreground">Median Income:</span>
                  <span className="ml-2 font-medium">
                    ${profile.median_income.toLocaleString()}
                  </span>
                </div>
              )}
              {profile.income_band && (
                <div className="col-span-2">
                  <span className="text-muted-foreground">Income Band:</span>
                  <span className="ml-2 font-medium capitalize">{profile.income_band}</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Trending Interest */}
      {profile.trending_interest_score !== undefined && (
        <Card>
          <CardContent className="p-4">
            <h4 className="font-semibold mb-3">Trending Interest</h4>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Interest Score:</span>
              <span className="text-lg font-semibold">{profile.trending_interest_score}/100</span>
            </div>
            {profile.interest_trend && (
              <div className="mt-2">
                <span className="text-sm text-muted-foreground">Trend:</span>
                <span className="ml-2 text-sm font-medium capitalize">
                  {profile.interest_trend}
                </span>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}






































