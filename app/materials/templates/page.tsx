"use client";

// Block 89000 — Material Templates List Page

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Edit, Trash2 } from "lucide-react";
import Link from "next/link";

type Template = {
  id: string;
  name: string;
  manufacturer: string | null;
  shingle_line: string | null;
  waste_factor: number;
  roof_type: string | null;
  color: string | null;
  material_template_items: Array<{
    id: string;
    item_name: string;
    unit: string;
    quantity_per_sq: number;
    cost_per_unit: number | null;
  }>;
};

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadTemplates();
  }, []);

  const loadTemplates = async () => {
    try {
      const res = await fetch("/api/materials/templates");
      if (!res.ok) throw new Error("Failed to load templates");
      const json = await res.json();
      setTemplates(json.templates || []);
    } catch (error) {
      console.error("Error loading templates:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this template?")) return;

    try {
      const res = await fetch(`/api/materials/templates/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete template");
      loadTemplates();
    } catch (error) {
      console.error("Error deleting template:", error);
      alert("Failed to delete template");
    }
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="text-lg">Loading templates...</div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Material Templates</h1>
          <p className="text-gray-600 mt-1">
            Create reusable templates for different roof types and manufacturers
          </p>
        </div>
        <Link href="/materials/templates/new">
          <Button>
            <Plus className="w-4 h-4 mr-2" />
            New Template
          </Button>
        </Link>
      </div>

      {templates.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-gray-500 mb-4">No templates yet</p>
            <Link href="/materials/templates/new">
              <Button>Create Your First Template</Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {templates.map((template) => (
            <Card key={template.id} className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <CardTitle className="text-lg">{template.name}</CardTitle>
                <div className="text-sm text-gray-600 space-y-1 mt-2">
                  {template.manufacturer && (
                    <div>Manufacturer: {template.manufacturer}</div>
                  )}
                  {template.shingle_line && (
                    <div>Line: {template.shingle_line}</div>
                  )}
                  {template.roof_type && (
                    <div>Type: {template.roof_type}</div>
                  )}
                  {template.color && (
                    <div>Color: {template.color}</div>
                  )}
                  <div>Waste Factor: {(template.waste_factor * 100).toFixed(0)}%</div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="mb-4">
                  <div className="text-sm font-medium mb-2">
                    Materials ({template.material_template_items.length} items):
                  </div>
                  <div className="text-xs text-gray-600 space-y-1 max-h-32 overflow-y-auto">
                    {template.material_template_items.slice(0, 5).map((item) => (
                      <div key={item.id}>
                        {item.item_name} - {item.quantity_per_sq} {item.unit}/sq
                      </div>
                    ))}
                    {template.material_template_items.length > 5 && (
                      <div className="text-gray-400">
                        +{template.material_template_items.length - 5} more
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Link href={`/materials/templates/${template.id}`} className="flex-1">
                    <Button variant="outline" className="w-full">
                      <Edit className="w-4 h-4 mr-2" />
                      Edit
                    </Button>
                  </Link>
                  <Button
                    variant="outline"
                    onClick={() => handleDelete(template.id)}
                    className="text-red-600 hover:text-red-700"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}



























