"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

interface TemplateVariant {
  id: string;
  variant_body: string;
  variant_version: number;
  metrics: {
    sends?: number;
    opens?: number;
    clicks?: number;
    replies?: number;
    open_rate?: number;
    reply_rate?: number;
    click_rate?: number;
  };
  winner: boolean;
  created_at: string;
}

interface Template {
  id: string;
  name: string;
  version: number;
  body: string;
  performance: {
    sends?: number;
    opens?: number;
    clicks?: number;
    replies?: number;
    open_rate?: number;
    reply_rate?: number;
    click_rate?: number;
  };
  status: string;
  created_at: string;
  updated_at: string;
  variants: TemplateVariant[];
}

export default function TemplatePerformancePage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchTemplates();
  }, []);

  async function fetchTemplates() {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch("/api/templates/ai");
      if (!response.ok) {
        throw new Error("Failed to fetch templates");
      }
      const data = await response.json();
      setTemplates(data.templates || []);
    } catch (err: any) {
      setError(err.message || "Failed to load templates");
      console.error("Error fetching templates:", err);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="p-8">
        <div className="text-center text-muted-foreground">Loading template performance...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8">
        <div className="text-center text-red-500">Error: {error}</div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">AI Template Performance</h1>
        <p className="text-muted-foreground mt-2">
          Monitor template performance and AI-generated variants with automated A/B testing
        </p>
      </div>

      {templates.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            <p>No AI templates found. Templates will appear here once created.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {templates.map((template) => (
            <Card key={template.id} className="p-4">
              <CardHeader className="p-0 pb-3">
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-lg font-semibold">
                      {template.name || `Template v${template.version}`}
                    </CardTitle>
                    <CardDescription className="text-xs mt-1">
                      Version {template.version} • {template.status}
                    </CardDescription>
                  </div>
                  {template.status === "active" && (
                    <span className="px-2 py-1 text-xs rounded-lg bg-green-100 text-green-700">
                      Active
                    </span>
                  )}
                </div>
              </CardHeader>
              
              <CardContent className="p-0 space-y-3">
                <div className="text-sm text-muted-foreground line-clamp-3">
                  {template.body.slice(0, 100)}
                  {template.body.length > 100 ? "..." : ""}
                </div>

                <div className="space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Open rate:</span>
                    <span className="font-medium">
                      {template.performance?.open_rate?.toFixed(1) || 0}%
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Reply rate:</span>
                    <span className="font-medium">
                      {template.performance?.reply_rate?.toFixed(1) || 0}%
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Sends:</span>
                    <span className="font-medium">{template.performance?.sends || 0}</span>
                  </div>
                </div>

                {template.variants && template.variants.length > 0 && (
                  <div className="pt-2 border-t">
                    <div className="text-xs font-semibold text-muted-foreground mb-2">
                      Test Variants ({template.variants.length})
                    </div>
                    <div className="space-y-2">
                      {template.variants.map((variant) => (
                        <div
                          key={variant.id}
                          className={`text-xs p-2 rounded ${
                            variant.winner
                              ? "bg-green-50 border border-green-200"
                              : "bg-gray-50 border border-gray-200"
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-medium">v{variant.variant_version}</span>
                            {variant.winner && (
                              <span className="px-1.5 py-0.5 text-xs rounded bg-green-600 text-white">
                                Winner
                              </span>
                            )}
                          </div>
                          <div className="text-muted-foreground mt-1">
                            Reply: {variant.metrics.reply_rate?.toFixed(1) || 0}% • 
                            Sends: {variant.metrics.sends || 0}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <div className="mt-6 text-center text-sm text-muted-foreground">
        {templates.length} template{templates.length !== 1 ? "s" : ""} found
      </div>
    </div>
  );
}

