"use client";

// Block 9300 — Template Library v1
// Template Library Page: /dashboard/templates/library

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Search, Sparkles, FileText, Mail, Scissors, Eye, Copy, Loader2 } from "lucide-react";

type TemplateLibraryItem = {
  id: string;
  template_type: 'campaign' | 'email' | 'snippet';
  category: string;
  name: string;
  subject: string | null;
  body: string;
  placeholders: string[];
};

type Snippet = {
  id: string;
  content: string;
  placeholders: string[];
};

type SnippetsByCategory = Record<string, Snippet[]>;

const CATEGORY_LABELS: Record<string, string> = {
  storm_damage: "Storm Damage",
  tune_up: "Tune-Up & Maintenance",
  gutter_roof: "Gutter + Roof Bundle",
  weather: "Weather",
  urgency: "Urgency",
  credibility: "Credibility",
  value_prop: "Value Proposition",
  closing: "Closing",
};

export default function TemplateLibraryPage() {
  const router = useRouter();
  const [templates, setTemplates] = useState<TemplateLibraryItem[]>([]);
  const [snippets, setSnippets] = useState<SnippetsByCategory>({});
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'featured' | 'campaigns' | 'emails' | 'snippets'>('featured');
  const [searchQuery, setSearchQuery] = useState("");
  const [previewTemplate, setPreviewTemplate] = useState<TemplateLibraryItem | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [usingTemplate, setUsingTemplate] = useState<string | null>(null);

  useEffect(() => {
    loadTemplates();
    loadSnippets();
  }, []);

  const loadTemplates = async () => {
    try {
      const res = await fetch("/api/templates/library");
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

  const loadSnippets = async () => {
    try {
      const res = await fetch("/api/snippets");
      const data = await res.json();
      if (res.ok) {
        setSnippets(data.snippets || {});
      }
    } catch (error) {
      console.error("Failed to load snippets:", error);
    }
  };

  const handleUseTemplate = async (template: TemplateLibraryItem) => {
    setUsingTemplate(template.id);
    try {
      // Prompt user to select or create a campaign
      const campaignId = prompt("Enter campaign ID to use this template, or leave blank to create a new campaign:");
      
      if (!campaignId) {
        // Create new campaign - redirect to campaign creation
        router.push(`/campaigns/new?templateId=${template.id}`);
        return;
      }

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
        router.push(`/campaigns/${campaignId}`);
      } else {
        alert(`Failed to use template: ${data.error || "Unknown error"}`);
      }
    } catch (error: any) {
      console.error("Failed to use template:", error);
      alert(`Failed to use template: ${error.message}`);
    } finally {
      setUsingTemplate(null);
    }
  };

  const handlePreview = (template: TemplateLibraryItem) => {
    setPreviewTemplate(template);
    setPreviewOpen(true);
  };

  const filteredTemplates = templates.filter((t) => {
    const matchesSearch = searchQuery === "" || 
      t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.body.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.category.toLowerCase().includes(searchQuery.toLowerCase());
    
    if (activeTab === 'featured') {
      return matchesSearch && t.template_type === 'campaign';
    } else if (activeTab === 'campaigns') {
      return matchesSearch && t.template_type === 'campaign';
    } else if (activeTab === 'emails') {
      return matchesSearch && t.template_type === 'email';
    }
    
    return matchesSearch;
  });

  const categories = Array.from(new Set(templates.map(t => t.category)));

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="h-8 w-8 text-yellow-500" />
            <h1 className="text-3xl font-bold">Template Library</h1>
          </div>
          <p className="text-muted-foreground">
            Pre-written roofing campaigns, emails, and snippets — ready to personalize and send
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

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="mb-6">
          <TabsList>
            <TabsTrigger value="featured">
              <Sparkles className="h-4 w-4 mr-2" />
              Featured
            </TabsTrigger>
            <TabsTrigger value="campaigns">
              <FileText className="h-4 w-4 mr-2" />
              Full Campaigns
            </TabsTrigger>
            <TabsTrigger value="emails">
              <Mail className="h-4 w-4 mr-2" />
              Emails
            </TabsTrigger>
            <TabsTrigger value="snippets">
              <Scissors className="h-4 w-4 mr-2" />
              Snippets
            </TabsTrigger>
          </TabsList>

          {/* Featured Tab */}
          <TabsContent value="featured" className="space-y-4">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : filteredTemplates.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <p>No templates found.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredTemplates.map((template) => (
                  <Card key={template.id} className="hover:shadow-lg transition-shadow">
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <CardTitle className="text-lg">{template.name}</CardTitle>
                        <Badge variant="outline">{CATEGORY_LABELS[template.category] || template.category}</Badge>
                      </div>
                      <CardDescription className="line-clamp-2">
                        {template.subject || template.body.substring(0, 100)}...
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handlePreview(template)}
                        >
                          <Eye className="h-4 w-4 mr-1" />
                          Preview
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => handleUseTemplate(template)}
                          disabled={usingTemplate === template.id}
                        >
                          {usingTemplate === template.id ? (
                            <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                          ) : (
                            <Copy className="h-4 w-4 mr-1" />
                          )}
                          Use Template
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Campaigns Tab */}
          <TabsContent value="campaigns" className="space-y-4">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : filteredTemplates.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <p>No campaign templates found.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredTemplates.map((template) => (
                  <Card key={template.id} className="hover:shadow-lg transition-shadow">
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <CardTitle className="text-lg">{template.name}</CardTitle>
                        <Badge variant="outline">{CATEGORY_LABELS[template.category] || template.category}</Badge>
                      </div>
                      <CardDescription className="line-clamp-2">
                        {template.body.substring(0, 100)}...
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handlePreview(template)}
                        >
                          <Eye className="h-4 w-4 mr-1" />
                          Preview
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => handleUseTemplate(template)}
                          disabled={usingTemplate === template.id}
                        >
                          {usingTemplate === template.id ? (
                            <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                          ) : (
                            <Copy className="h-4 w-4 mr-1" />
                          )}
                          Use Template
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Emails Tab */}
          <TabsContent value="emails" className="space-y-4">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : filteredTemplates.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <p>No email templates found.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredTemplates.map((template) => (
                  <Card key={template.id} className="hover:shadow-lg transition-shadow">
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <CardTitle className="text-lg">{template.name}</CardTitle>
                        <Badge variant="outline">{CATEGORY_LABELS[template.category] || template.category}</Badge>
                      </div>
                      {template.subject && (
                        <CardDescription className="font-medium">
                          Subject: {template.subject}
                        </CardDescription>
                      )}
                      <CardDescription className="line-clamp-2 mt-2">
                        {template.body.substring(0, 100)}...
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handlePreview(template)}
                        >
                          <Eye className="h-4 w-4 mr-1" />
                          Preview
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => handleUseTemplate(template)}
                          disabled={usingTemplate === template.id}
                        >
                          {usingTemplate === template.id ? (
                            <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                          ) : (
                            <Copy className="h-4 w-4 mr-1" />
                          )}
                          Use Template
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Snippets Tab */}
          <TabsContent value="snippets" className="space-y-4">
            {Object.keys(snippets).length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <p>No snippets found.</p>
              </div>
            ) : (
              <div className="space-y-6">
                {Object.entries(snippets).map(([category, categorySnippets]) => (
                  <div key={category}>
                    <h3 className="text-lg font-semibold mb-3">
                      {CATEGORY_LABELS[category] || category}
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {categorySnippets.map((snippet) => (
                        <Card key={snippet.id} className="hover:shadow-md transition-shadow">
                          <CardContent className="pt-4">
                            <p className="text-sm">{snippet.content}</p>
                            {snippet.placeholders && snippet.placeholders.length > 0 && (
                              <div className="mt-2 flex flex-wrap gap-1">
                                {snippet.placeholders.map((placeholder, idx) => (
                                  <Badge key={idx} variant="secondary" className="text-xs">
                                    {placeholder}
                                  </Badge>
                                ))}
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>

        {/* Preview Modal */}
        <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{previewTemplate?.name}</DialogTitle>
              <DialogDescription>
                {previewTemplate && (
                  <Badge variant="outline" className="mt-2">
                    {CATEGORY_LABELS[previewTemplate.category] || previewTemplate.category}
                  </Badge>
                )}
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
                {previewTemplate.placeholders && previewTemplate.placeholders.length > 0 && (
                  <div>
                    <h4 className="font-semibold mb-2">Placeholders:</h4>
                    <div className="flex flex-wrap gap-2">
                      {previewTemplate.placeholders.map((placeholder, idx) => (
                        <Badge key={idx} variant="secondary">
                          {placeholder}
                        </Badge>
                      ))}
                    </div>
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
    </div>
  );
}
























































