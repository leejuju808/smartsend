"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";

type TemplateCategory = {
  id: string;
  name: string;
  description: string | null;
  display_order: number;
};

type CampaignTemplate = {
  id: string;
  name: string;
  description: string | null;
  category_id: string | null;
  category?: TemplateCategory;
  step_count?: number;
};

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export default function CampaignTemplatesPage() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");

  // Fetch categories
  const { data: categoriesData } = useSWR<{ categories: TemplateCategory[] }>(
    "/api/campaign-templates/categories",
    fetcher
  );

  // Fetch templates
  const { data: templatesData, error } = useSWR<{ templates: CampaignTemplate[] }>(
    "/api/campaign-templates",
    fetcher
  );

  const categories = categoriesData?.categories || [];
  const templates = templatesData?.templates || [];

  // Filter templates
  const filteredTemplates = templates.filter((t) => {
    const matchesSearch = 
      t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.description?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = 
      selectedCategory === "all" || t.category_id === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const handleUseTemplate = (templateId: string) => {
    router.push(`/campaign-templates/${templateId}/editor`);
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Campaign Templates</h1>
          <p className="text-muted-foreground mt-2">
            Pre-built roofing campaigns with proven email sequences
          </p>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
        <Input
          placeholder="Search templates..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Categories Tabs */}
      <Tabs value={selectedCategory} onValueChange={setSelectedCategory}>
        <TabsList>
          <TabsTrigger value="all">All Templates</TabsTrigger>
          {categories
            .sort((a, b) => a.display_order - b.display_order)
            .map((cat) => (
              <TabsTrigger key={cat.id} value={cat.id}>
                {cat.name}
              </TabsTrigger>
            ))}
        </TabsList>
      </Tabs>

      {error && (
        <div className="text-red-500 p-4 bg-red-50 rounded-lg">
          Failed to load templates. Please try again.
        </div>
      )}

      {filteredTemplates.length === 0 && !error && (
        <div className="text-center py-12 text-muted-foreground">
          <p>No templates found matching your search.</p>
        </div>
      )}

      {/* Templates Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredTemplates.map((template) => (
          <Card 
            key={template.id} 
            className="hover:shadow-lg transition-shadow cursor-pointer"
            onClick={() => handleUseTemplate(template.id)}
          >
            <CardHeader>
              <div className="flex items-start justify-between">
                <CardTitle className="text-lg">{template.name}</CardTitle>
                {template.category && (
                  <Badge variant="secondary" className="text-xs">
                    {template.category.name}
                  </Badge>
                )}
              </div>
              {template.description && (
                <CardDescription className="mt-2">
                  {template.description}
                </CardDescription>
              )}
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>{template.step_count || 0} email steps</span>
                <Button size="sm" variant="outline">
                  Use Template
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}



























