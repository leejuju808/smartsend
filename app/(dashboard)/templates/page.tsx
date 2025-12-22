"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type Template = {
  id: string;
  name: string;
  category: string | null;
  body: string;
  shared: boolean;
  created_by: string;
  created_at: string;
};

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export default function TemplatesPage() {
  const router = useRouter();
  const { data, error, mutate } = useSWR<{ templates: Template[] }>(
    "/api/templates",
    fetcher
  );

  const templates = data?.templates || [];

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this template?")) return;

    const res = await fetch(`/api/templates/${id}/delete`, {
      method: "DELETE",
    });

    if (res.ok) {
      mutate();
    } else {
      alert("Failed to delete template");
    }
  };

  return (
    <div className="p-6 space-y-4 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Templates</h1>
        <Button onClick={() => router.push("/templates/new")}>
          New Template
        </Button>
      </div>

      {error && (
        <div className="text-red-500">Failed to load templates</div>
      )}

      {templates.length === 0 && !error && (
        <div className="text-center py-12 text-gray-500">
          <p>No templates yet. Create your first template to get started.</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {templates.map((t) => (
          <Card key={t.id} className="p-4">
            <CardHeader className="p-0 pb-2">
              <div className="flex items-start justify-between">
                <CardTitle className="text-lg font-bold">{t.name}</CardTitle>
                {!t.shared && (
                  <Badge variant="outline" className="text-xs">
                    Personal
                  </Badge>
                )}
              </div>
              {t.category && (
                <p className="text-xs opacity-60 mt-1">{t.category}</p>
              )}
            </CardHeader>
            <CardContent className="p-0">
              <p className="text-sm mt-2 line-clamp-3 text-gray-300">
                {t.body.replace(/<[^>]*>/g, "").substring(0, 150)}
                {t.body.length > 150 ? "..." : ""}
              </p>
              <div className="flex gap-2 mt-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => router.push(`/templates/${t.id}`)}
                >
                  Edit
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleDelete(t.id)}
                  className="text-red-500 hover:text-red-700"
                >
                  Delete
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}










