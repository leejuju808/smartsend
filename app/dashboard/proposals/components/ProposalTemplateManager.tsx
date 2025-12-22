// Block 57000 — Proposal Template Manager Component
// Create, edit, and manage proposal templates

"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import Link from "next/link";

type Template = {
  id: string;
  name: string;
  description: string;
  template_type: string;
  is_active: boolean;
  created_at: string;
};

export function ProposalTemplateManager() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadTemplates();
  }, []);

  const loadTemplates = async () => {
    try {
      const response = await fetch("/api/proposals/templates");
      if (response.ok) {
        const data = await response.json();
        setTemplates(data.templates || []);
      }
    } catch (error) {
      console.error("Error loading templates:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <Card key={i}>
            <CardContent className="pt-6">
              <Skeleton className="h-24 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Templates</h2>
        <Link href="/dashboard/proposals/templates/new">
          <Button>Create Template</Button>
        </Link>
      </div>

      {templates.length === 0 ? (
        <Card>
          <CardContent className="pt-6 text-center py-12">
            <p className="text-gray-500 mb-4">No templates yet</p>
            <Link href="/dashboard/proposals/templates/new">
              <Button>Create Your First Template</Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {templates.map((template) => (
            <Card key={template.id}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">{template.name}</CardTitle>
                  <Badge variant={template.is_active ? "default" : "secondary"}>
                    {template.is_active ? "Active" : "Inactive"}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-gray-600 mb-2">{template.description}</p>
                <Badge variant="outline" className="text-xs">
                  {template.template_type.replace("_", " ")}
                </Badge>
                <div className="mt-4 flex gap-2">
                  <Link href={`/dashboard/proposals/templates/${template.id}`} className="flex-1">
                    <Button variant="outline" size="sm" className="w-full">
                      Edit
                    </Button>
                  </Link>
                  <Link href={`/dashboard/proposals/new?template=${template.id}`} className="flex-1">
                    <Button size="sm" className="w-full">
                      Use
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
































