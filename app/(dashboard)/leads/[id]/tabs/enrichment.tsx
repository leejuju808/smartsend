"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ExternalLink, RefreshCw } from "lucide-react";
import { useState } from "react";

interface EnrichmentTabProps {
  leadId: string;
  enrichment: any;
}

export default function EnrichmentTab({ leadId, enrichment }: EnrichmentTabProps) {
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      const response = await fetch(`/api/leads/${leadId}/enrich`, {
        method: "POST",
      });
      if (response.ok) {
        // Reload the page to show updated data
        window.location.reload();
      } else {
        alert("Failed to refresh enrichment data");
      }
    } catch (error) {
      console.error("Error refreshing enrichment:", error);
      alert("Error refreshing enrichment data");
    } finally {
      setIsRefreshing(false);
    }
  };

  if (!enrichment) {
    return (
      <div className="space-y-6 mt-4">
        <Card className="p-6">
          <div className="text-center py-8">
            <p className="text-muted-foreground mb-4">No enrichment data available</p>
            <Button onClick={handleRefresh} disabled={isRefreshing}>
              <RefreshCw className={`mr-2 h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
              {isRefreshing ? "Enriching..." : "Enrich Lead"}
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  const qualityScore = enrichment.quality_score || 0;
  const qualityColor = qualityScore >= 50 ? "bg-green-500" : qualityScore >= 30 ? "bg-yellow-500" : "bg-gray-500";

  return (
    <div className="space-y-6 mt-4">
      {/* Quality Score */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Enrichment Quality</CardTitle>
            <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isRefreshing}>
              <RefreshCw className={`mr-2 h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <div className={`w-16 h-16 rounded-full ${qualityColor} flex items-center justify-center text-white font-bold text-xl`}>
              {qualityScore}
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Quality Score</p>
              <p className="text-xs text-muted-foreground mt-1">
                Based on completeness of enrichment data
              </p>
            </div>
          </div>
          {enrichment.enriched_at && (
            <p className="text-xs text-muted-foreground mt-4">
              Last enriched: {new Date(enrichment.enriched_at).toLocaleString()}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Person Information */}
      <Card>
        <CardHeader>
          <CardTitle>Person</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {enrichment.full_name && (
              <div>
                <label className="text-sm font-medium text-muted-foreground">Full Name</label>
                <p className="text-sm">{enrichment.full_name}</p>
              </div>
            )}
            {enrichment.title && (
              <div>
                <label className="text-sm font-medium text-muted-foreground">Title</label>
                <p className="text-sm">{enrichment.title}</p>
              </div>
            )}
            {enrichment.seniority && (
              <div>
                <label className="text-sm font-medium text-muted-foreground">Seniority</label>
                <p className="text-sm">
                  <Badge variant="secondary">{enrichment.seniority}</Badge>
                </p>
              </div>
            )}
            {enrichment.linkedin && (
              <div>
                <label className="text-sm font-medium text-muted-foreground">LinkedIn</label>
                <p className="text-sm">
                  <a 
                    href={enrichment.linkedin} 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="text-blue-600 hover:underline flex items-center gap-1"
                  >
                    View Profile <ExternalLink className="h-3 w-3" />
                  </a>
                </p>
              </div>
            )}
            {(enrichment.city || enrichment.state || enrichment.country) && (
              <div className="md:col-span-2">
                <label className="text-sm font-medium text-muted-foreground">Location</label>
                <p className="text-sm">
                  {[enrichment.city, enrichment.state, enrichment.country]
                    .filter(Boolean)
                    .join(", ")}
                </p>
              </div>
            )}
            {enrichment.timezone && (
              <div>
                <label className="text-sm font-medium text-muted-foreground">Timezone</label>
                <p className="text-sm">{enrichment.timezone}</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Company Information */}
      <Card>
        <CardHeader>
          <CardTitle>Company</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {enrichment.company && (
              <div>
                <label className="text-sm font-medium text-muted-foreground">Company Name</label>
                <p className="text-sm font-medium">{enrichment.company}</p>
              </div>
            )}
            {enrichment.website && (
              <div>
                <label className="text-sm font-medium text-muted-foreground">Website</label>
                <p className="text-sm">
                  <a 
                    href={enrichment.website} 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="text-blue-600 hover:underline flex items-center gap-1"
                  >
                    {enrichment.website} <ExternalLink className="h-3 w-3" />
                  </a>
                </p>
              </div>
            )}
            {enrichment.domain && (
              <div>
                <label className="text-sm font-medium text-muted-foreground">Domain</label>
                <p className="text-sm">{enrichment.domain}</p>
              </div>
            )}
            {enrichment.industry && (
              <div>
                <label className="text-sm font-medium text-muted-foreground">Industry</label>
                <p className="text-sm">
                  <Badge variant="outline">{enrichment.industry}</Badge>
                </p>
              </div>
            )}
            {(enrichment.employee_count || enrichment.employee_range) && (
              <div>
                <label className="text-sm font-medium text-muted-foreground">Company Size</label>
                <p className="text-sm">
                  {enrichment.employee_range || 
                   (enrichment.employee_count ? `${enrichment.employee_count} employees` : null)}
                </p>
              </div>
            )}
            {enrichment.revenue && (
              <div>
                <label className="text-sm font-medium text-muted-foreground">Revenue</label>
                <p className="text-sm">{enrichment.revenue}</p>
              </div>
            )}
            {enrichment.founded_year && (
              <div>
                <label className="text-sm font-medium text-muted-foreground">Founded</label>
                <p className="text-sm">{enrichment.founded_year}</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Tech Stack */}
      {enrichment.tech_stack && Array.isArray(enrichment.tech_stack) && enrichment.tech_stack.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Tech Stack</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {enrichment.tech_stack.map((tech: string, idx: number) => (
                <Badge key={idx} variant="secondary">
                  {tech}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Source */}
      {enrichment.source && (
        <Card>
          <CardHeader>
            <CardTitle>Metadata</CardTitle>
          </CardHeader>
          <CardContent>
            <div>
              <label className="text-sm font-medium text-muted-foreground">Data Source</label>
              <p className="text-sm">
                <Badge variant="outline">{enrichment.source}</Badge>
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}



