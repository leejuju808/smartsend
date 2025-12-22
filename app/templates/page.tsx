"use client";

// Block 13000 — SmartSend Template Library v1
// Templates Page: /templates
// The Roofing Email Template Library Filled With Proven Angles, Openers & Follow-Ups

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Search, Sparkles, Eye, Copy, Loader2, FileText, RefreshCw, Calendar, AlertCircle, Home, DollarSign, MessageSquare, Zap } from "lucide-react";

type Template = {
  id: string;
  title: string;
  category: string;
  subject: string | null;
  body: string;
  cta: string | null;
  created_by: string;
  premium_flag: boolean;
  is_custom?: boolean;
};

type Category = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  display_order: number;
};

const CATEGORY_ICONS: Record<string, any> = {
  roofing_outreach: FileText,
  roofing_followups: RefreshCw,
  old_quotes: MessageSquare,
  insurance_storm: AlertCircle,
  seasonal_campaigns: Calendar,
  specials_promotions: DollarSign,
  re_engagement: RefreshCw,
  short_messages: Zap,
  test_templates: FileText,
  custom_templates: FileText,
};

export default function TemplatesPage() {
  const router = useRouter();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [previewTemplate, setPreviewTemplate] = useState<Template | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [usingTemplate, setUsingTemplate] = useState<string | null>(null);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);

  useEffect(() => {
    loadCategories();
    loadTemplates();
  }, []);

  const loadCategories = async () => {
    try {
      const res = await fetch("/api/templates/categories");
      const data = await res.json();
      if (res.ok) {
        setCategories(data.categories || []);
      }
    } catch (error) {
      console.error("Failed to load categories:", error);
    }
  };

  const loadTemplates = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/templates?include_custom=true");
      const data = await res.json();
      if (res.ok) {
        setTemplates(data.templates || []);
      }
    } catch (error) {
      console.error("Failed to load templates:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleUseTemplate = async (template: Template) => {
    setUsingTemplate(template.id);
    try {
      // Prompt user to select or create a campaign
      const campaignId = prompt("Enter campaign ID to use this template, or leave blank to create a new campaign:");
      
      if (!campaignId) {
        // Create new campaign - redirect to campaign creation
        router.push(`/campaigns/new?templateId=${template.id}`);
        return;
      }

      setSelectedCampaignId(campaignId);

      const res = await fetch("/api/templates/use", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateId: template.id,
          campaignId: campaignId,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        // Redirect to campaign steps page
        router.push(`/campaigns/${campaignId}/steps`);
      } else {
        alert(`Failed to use template: ${data.error || "Unknown error"}`);
      }
    } catch (error: any) {
      console.error("Failed to use template:", error);
      alert(`Failed to use template: ${error.message}`);
    } finally {
      setUsingTemplate(null);
      setSelectedCampaignId(null);
    }
  };

  const handlePreview = (template: Template) => {
    setPreviewTemplate(template);
    setPreviewOpen(true);
  };

  const filteredTemplates = templates.filter((t) => {
    const matchesCategory = selectedCategory === "all" || t.category === selectedCategory;
    const matchesSearch = searchQuery === "" || 
      t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.body.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (t.subject && t.subject.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesCategory && matchesSearch;
  });

  const selectedCategoryName = categories.find(c => c.slug === selectedCategory)?.name || "All Templates";

  return (
    <div className="min-h-screen bg-background">
      <div className="flex">
        {/* Left Sidebar */}
        <div className="hidden lg:block w-64 border-r bg-muted/30 p-4">
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="h-6 w-6 text-yellow-500" />
              <h2 className="text-lg font-bold">Template Library</h2>
            </div>
            <p className="text-sm text-muted-foreground">
              Pre-built, professionally written templates
            </p>
          </div>

          <nav className="space-y-1">
            <button
              onClick={() => setSelectedCategory("all")}
              className={`w-full text-left px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                selectedCategory === "all"
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-muted"
              }`}
            >
              All Templates
            </button>
            {categories.map((category) => {
              const Icon = CATEGORY_ICONS[category.slug] || FileText;
              return (
                <button
                  key={category.id}
                  onClick={() => setSelectedCategory(category.slug)}
                  className={`w-full text-left px-3 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2 ${
                    selectedCategory === category.slug
                      ? "bg-primary text-primary-foreground"
                      : "hover:bg-muted"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {category.name}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Main Content */}
        <div className="flex-1 p-6">
          <div className="max-w-7xl mx-auto">
            {/* Header */}
            <div className="mb-8">
              <div className="flex items-center gap-2 mb-2">
                <Sparkles className="h-8 w-8 text-yellow-500" />
                <h1 className="text-3xl font-bold">SmartSend Template Library</h1>
              </div>
              <p className="text-muted-foreground">
                {selectedCategoryName} — Ready-to-send roofing outreach templates optimized for homeowner replies
              </p>
            </div>

            {/* Search */}
            <div className="mb-6">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search templates..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>

            {/* Mobile Category Selector */}
            <div className="lg:hidden mb-6">
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="w-full px-4 py-2 border rounded-lg bg-background"
              >
                <option value="all">All Templates</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.slug}>
                    {category.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Template Grid */}
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : filteredTemplates.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <p>No templates found.</p>
                <p className="text-sm mt-2">Try adjusting your search or category filter.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredTemplates.map((template) => {
                  const categoryInfo = categories.find(c => c.slug === template.category);
                  return (
                    <Card key={template.id} className="hover:shadow-lg transition-shadow">
                      <CardHeader>
                        <div className="flex items-start justify-between">
                          <CardTitle className="text-lg">{template.title}</CardTitle>
                          {template.is_custom && (
                            <Badge variant="secondary">Custom</Badge>
                          )}
                          {template.premium_flag && (
                            <Badge variant="default">Premium</Badge>
                          )}
                        </div>
                        {categoryInfo && (
                          <CardDescription>
                            {categoryInfo.name}
                          </CardDescription>
                        )}
                        {template.subject && (
                          <CardDescription className="font-medium mt-2">
                            Subject: {template.subject}
                          </CardDescription>
                        )}
                        <CardDescription className="line-clamp-2 mt-2">
                          {template.body}
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handlePreview(template)}
                            className="flex-1"
                          >
                            <Eye className="h-4 w-4 mr-1" />
                            Preview
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => handleUseTemplate(template)}
                            disabled={usingTemplate === template.id}
                            className="flex-1"
                          >
                            {usingTemplate === template.id ? (
                              <>
                                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                                Using...
                              </>
                            ) : (
                              <>
                                <Copy className="h-4 w-4 mr-1" />
                                Use Template
                              </>
                            )}
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Preview Modal */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{previewTemplate?.title}</DialogTitle>
            <DialogDescription>
              {previewTemplate && categories.find(c => c.slug === previewTemplate.category)?.name}
            </DialogDescription>
          </DialogHeader>
          {previewTemplate && (
            <div className="space-y-4">
              {previewTemplate.subject && (
                <div>
                  <h4 className="font-semibold mb-1">Subject:</h4>
                  <p className="text-sm bg-muted p-2 rounded">{previewTemplate.subject}</p>
                </div>
              )}
              <div>
                <h4 className="font-semibold mb-1">Body:</h4>
                <div className="text-sm bg-muted p-4 rounded whitespace-pre-wrap">
                  {previewTemplate.body}
                </div>
              </div>
              {previewTemplate.cta && (
                <div>
                  <h4 className="font-semibold mb-1">Call-to-Action:</h4>
                  <p className="text-sm bg-muted p-2 rounded">{previewTemplate.cta}</p>
                </div>
              )}
              <div className="flex justify-end gap-2 pt-4">
                <Button variant="outline" onClick={() => setPreviewOpen(false)}>
                  Close
                </Button>
                <Button onClick={() => {
                  setPreviewOpen(false);
                  handleUseTemplate(previewTemplate);
                }}>
                  Use Template
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
