"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type Template = {
  id: string;
  name: string;
  description: string | null;
  persona: string | null;
  visibility: string;
  created_at: string;
};

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export default function MarketplacePage() {
  const router = useRouter();
  const { data: templates, error } = useSWR<Template[]>(
    "/api/templates/public",
    fetcher
  );

  const previewTemplate = (templateId: string) => {
    router.push(`/templates/${templateId}`);
  };

  return (
    <div className="space-y-6 p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Template Marketplace</h1>
        <Button onClick={() => router.push("/templates/upload")}>
          Upload Template
        </Button>
      </div>

      {error && (
        <div className="text-red-500">Failed to load templates</div>
      )}

      {templates && templates.length === 0 && (
        <div className="text-center py-12 text-gray-500">
          <p>No public templates available yet.</p>
          <p className="text-sm mt-2">
            Be the first to share a template with the community!
          </p>
        </div>
      )}

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
        {templates?.map((t) => (
          <Card key={t.id} className="p-6 border rounded-xl">
            <CardHeader className="p-0 pb-4">
              <CardTitle className="font-bold text-lg">{t.name}</CardTitle>
            </CardHeader>
            <CardContent className="p-0 space-y-4">
              <p className="text-sm text-muted-foreground">
                {t.description || "No description available"}
              </p>
              {t.persona && (
                <Badge className="mt-2">{t.persona || "General"}</Badge>
              )}
              <Button
                className="mt-4 w-full"
                onClick={() => previewTemplate(t.id)}
              >
                Preview & Import
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}



