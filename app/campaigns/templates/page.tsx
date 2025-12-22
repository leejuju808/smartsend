"use client";

// Block 15800 — SmartSend Campaign Templates v2
// (High-Converting Roofing Templates: Storm, Insurance Claims, Old Quotes, Neighborhood Jobs, Repairs & Seasonal Playbooks)
// Path: /campaigns/templates

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Home, 
  AlertCircle, 
  DollarSign, 
  Calendar, 
  MessageSquare,
  Sparkles,
  Loader2,
  Zap,
  TrendingUp
} from "lucide-react";

type TemplateStep = {
  stepNumber: number;
  subject: string;
  body: string;
  delayDays: number;
  tone?: string;
};

type Template = {
  id: string;
  slug: string;
  title: string;
  description: string;
  steps: TemplateStep[];
  stepsByTone?: Record<string, TemplateStep[]>;
  category: string;
  goal: string;
  recommendedSteps: number;
  personalizationRequired: boolean;
  toneOptions: string[];
  recommendedListTypes: string[];
  promoTag?: string;
  tags: string[];
};

// Block 15800 Categories (v2)
const CATEGORIES = [
  { id: "storm_damage", label: "Storm Damage", icon: AlertCircle },
  { id: "insurance_claims", label: "Insurance Claims", icon: DollarSign },
  { id: "old_quotes", label: "Old Quotes", icon: MessageSquare },
  { id: "neighborhood_outreach", label: "Neighborhood Outreach", icon: Home },
  { id: "repairs", label: "Repairs", icon: Zap },
  { id: "replacements", label: "Replacements", icon: TrendingUp },
  { id: "seasonal", label: "Seasonal", icon: Calendar },
];

export default function CampaignsTemplatesPage() {
  const router = useRouter();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [usingTemplate, setUsingTemplate] = useState<string | null>(null);

  useEffect(() => {
    loadTemplates();
  }, []);

  const loadTemplates = async () => {
    try {
      // Load v2 templates from campaign_templates table
      const res = await fetch("/api/templates/campaigns-v2");
      const data = await res.json();
      if (res.ok) {
        setTemplates(data.templates || []);
      } else {
        // Fallback to v1 templates
        const fallbackRes = await fetch("/api/templates/campaigns");
        const fallbackData = await fallbackRes.json();
        if (fallbackRes.ok) {
          setTemplates(fallbackData.templates || []);
        }
      }
    } catch (error) {
      console.error("Failed to load templates:", error);
    } finally {
      setLoading(false);
    }
  };

  const filteredTemplates = templates.filter((t) => {
    return selectedCategory === "all" || t.category === selectedCategory;
  });

  const handleUseTemplate = async (template: Template) => {
    setUsingTemplate(template.id);
    try {
      const campaignName = `${template.title} Campaign`;
      
      // For v2 templates, use the new clone endpoint
      const res = await fetch("/api/templates/clone-to-campaign-v2", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateId: template.id,
          campaignName,
        }),
      });

      const data = await res.json();
      if (res.ok && data.campaignId) {
        // Load into Campaign Builder automatically
        router.push(data.next || `/campaigns/${data.campaignId}/review`);
      } else {
        // Fallback to v1 endpoint
        const fallbackRes = await fetch("/api/templates/clone-to-campaign", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            templateId: template.id,
            campaignName,
          }),
        });
        const fallbackData = await fallbackRes.json();
        if (fallbackRes.ok && fallbackData.campaignId) {
          router.push(fallbackData.next || `/campaigns/${fallbackData.campaignId}/review`);
        } else {
          alert(`Failed to create campaign: ${data.error || fallbackData.error || "Unknown error"}`);
        }
      }
    } catch (error: any) {
      console.error("Failed to use template:", error);
      alert(`Failed to create campaign: ${error.message}`);
    } finally {
      setUsingTemplate(null);
    }
  };

  const getCategoryIcon = (categoryId: string) => {
    const category = CATEGORIES.find(c => c.id === categoryId);
    return category?.icon || Home;
  };

  const getCategoryLabel = (categoryId: string) => {
    const category = CATEGORIES.find(c => c.id === categoryId);
    return category?.label || categoryId;
  };

  // Get preview text (first 2-3 lines of body)
  const getPreview = (template: Template) => {
    if (!template.steps || template.steps.length === 0) return "";
    const firstStep = template.steps[0];
    const lines = firstStep.body.split("\n").filter(l => l.trim());
    return lines.slice(0, 3).join(" ").substring(0, 150) + (lines.length > 3 ? "..." : "");
  };

  const getToneBadgeColor = (tone: string) => {
    switch (tone) {
      case 'urgent': return 'destructive';
      case 'friendly': return 'default';
      case 'professional': return 'secondary';
      case 'simple': return 'outline';
      default: return 'secondary';
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto p-6">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="h-8 w-8 text-yellow-500" />
            <h1 className="text-3xl font-bold">SmartSend Campaign Templates v2</h1>
            <Badge variant="default" className="ml-2">High Reply Rate</Badge>
          </div>
          <p className="text-muted-foreground text-lg">
            Elite, high-converting campaign templates built for roofing — not generic marketing garbage.
          </p>
          <p className="text-sm text-muted-foreground mt-2">
            Templates plug directly into the personalization engine, adapt to list intelligence, and boost reply rates.
          </p>
        </div>

        {/* Seasonal Playbooks Section */}
        <Card className="mb-8">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-yellow-500" />
              <CardTitle>Seasonal Playbooks</CardTitle>
            </div>
            <CardDescription>
              SmartSend knows roofing seasonality. Use these templates at the right time for maximum impact.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="p-4 border rounded-lg">
                <h3 className="font-semibold mb-2 text-green-600">Spring</h3>
                <p className="text-sm text-muted-foreground mb-2">Leak season, rain, moss</p>
                <div className="text-xs space-y-1">
                  <div>• Repairs Sequence</div>
                  <div>• Neighborhood Outreach</div>
                  <div>• Old Quote Revival</div>
                </div>
              </div>
              <div className="p-4 border rounded-lg">
                <h3 className="font-semibold mb-2 text-orange-600">Summer</h3>
                <p className="text-sm text-muted-foreground mb-2">Hail, wind, storm period</p>
                <div className="text-xs space-y-1">
                  <div>• Storm Damage Outreach</div>
                  <div>• Insurance Claim Sequence</div>
                  <div>• Repairs Sequence</div>
                </div>
              </div>
              <div className="p-4 border rounded-lg">
                <h3 className="font-semibold mb-2 text-amber-600">Fall</h3>
                <p className="text-sm text-muted-foreground mb-2">Pre-winter checks</p>
                <div className="text-xs space-y-1">
                  <div>• Full Roof Replacement</div>
                  <div>• Neighborhood Outreach</div>
                  <div>• Old Quote Revival</div>
                </div>
              </div>
              <div className="p-4 border rounded-lg">
                <h3 className="font-semibold mb-2 text-blue-600">Winter</h3>
                <p className="text-sm text-muted-foreground mb-2">Ice, snow load, emergency repairs</p>
                <div className="text-xs space-y-1">
                  <div>• Repairs Sequence</div>
                  <div>• Insurance Claim Sequence</div>
                  <div>• Storm Damage Outreach</div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex gap-6">
          {/* Categories Sidebar (Left) */}
          <div className="w-64 flex-shrink-0">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Categories</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="space-y-1">
                  <button
                    onClick={() => setSelectedCategory("all")}
                    className={`w-full text-left px-4 py-2 text-sm transition-colors ${
                      selectedCategory === "all"
                        ? "bg-primary text-primary-foreground font-medium"
                        : "hover:bg-muted"
                    }`}
                  >
                    All Templates
                  </button>
                  {CATEGORIES.map((category) => {
                    const Icon = category.icon;
                    const count = templates.filter(t => t.category === category.id).length;
                    if (count === 0) return null;
                    
                    return (
                      <button
                        key={category.id}
                        onClick={() => setSelectedCategory(category.id)}
                        className={`w-full text-left px-4 py-2 text-sm transition-colors flex items-center gap-2 ${
                          selectedCategory === category.id
                            ? "bg-primary text-primary-foreground font-medium"
                            : "hover:bg-muted"
                        }`}
                      >
                        <Icon className="h-4 w-4" />
                        <span>{category.label}</span>
                        <Badge variant="secondary" className="ml-auto text-xs">
                          {count}
                        </Badge>
                      </button>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Templates Grid (Right) */}
          <div className="flex-1">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                <span className="ml-2 text-muted-foreground">Loading templates...</span>
              </div>
            ) : filteredTemplates.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                No templates found in this category
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {filteredTemplates.map((template) => {
                  const Icon = getCategoryIcon(template.category);
                  const preview = getPreview(template);
                  
                  return (
                    <Card 
                      key={template.id} 
                      className="hover:shadow-lg transition-shadow cursor-pointer group"
                      onClick={() => handleUseTemplate(template)}
                    >
                      <CardHeader>
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-2 flex-1">
                            <Icon className="h-5 w-5 text-yellow-500" />
                            <CardTitle className="text-lg">{template.title}</CardTitle>
                            {template.promoTag && (
                              <Badge variant="default" className="ml-2 text-xs">
                                {template.promoTag}
                              </Badge>
                            )}
                          </div>
                        </div>
                        <CardDescription className="mt-2">
                          {template.description}
                        </CardDescription>
                        {/* Tone options */}
                        {template.toneOptions && template.toneOptions.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {template.toneOptions.map((tone) => (
                              <Badge
                                key={tone}
                                variant={getToneBadgeColor(tone)}
                                className="text-xs"
                              >
                                {tone}
                              </Badge>
                            ))}
                          </div>
                        )}
                        {/* Recommended list types */}
                        {template.recommendedListTypes && template.recommendedListTypes.length > 0 && (
                          <div className="mt-2 text-xs text-muted-foreground">
                            Best for: {template.recommendedListTypes.join(', ')}
                          </div>
                        )}
                      </CardHeader>
                      <CardContent>
                        {/* 2-3 line preview */}
                        <div className="mb-4 p-3 bg-muted/50 rounded-lg text-sm text-muted-foreground min-h-[60px]">
                          {preview || "No preview available"}
                        </div>
                        
                        {/* Steps count */}
                        <div className="mb-3 text-xs text-muted-foreground">
                          {template.steps?.length || 0} steps • {template.recommendedSteps || 0} recommended
                        </div>
                        
                        {/* Use This Template Button */}
                        <Button
                          className="w-full"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleUseTemplate(template);
                          }}
                          disabled={usingTemplate === template.id}
                        >
                          {usingTemplate === template.id ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              Loading...
                            </>
                          ) : (
                            "Use This Template"
                          )}
                        </Button>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

