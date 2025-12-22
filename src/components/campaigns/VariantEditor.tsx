"use client";

import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Trash2, Save } from "lucide-react";

interface Variant {
  id?: string;
  name: string;
  subject: string;
  body: string;
  weight: number;
  sends?: number;
  opens?: number;
  clicks?: number;
  replies?: number;
}

interface VariantEditorProps {
  campaignId: string;
}

export function VariantEditor({ campaignId }: VariantEditorProps) {
  const [variants, setVariants] = useState<Variant[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadVariants();
  }, [campaignId]);

  async function loadVariants() {
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/variants/list`);
      const data = await res.json();
      if (data.ok) {
        setVariants(data.variants || []);
      }
    } catch (error) {
      console.error("Failed to load variants:", error);
    } finally {
      setLoading(false);
    }
  }

  async function addVariant() {
    const newVariant: Variant = {
      name: String.fromCharCode(65 + variants.length), // A, B, C, etc.
      subject: "",
      body: "",
      weight: 50,
    };
    setVariants([...variants, newVariant]);
  }

  async function saveVariant(variant: Variant, index: number) {
    setSaving(true);
    try {
      const url = `/api/campaigns/${campaignId}/variants/create`;
      const method = variant.id ? "PUT" : "POST";
      const body = variant.id
        ? { variant_id: variant.id, ...variant }
        : variant;

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (data.ok) {
        const updated = [...variants];
        updated[index] = data.variant;
        setVariants(updated);
      } else {
        alert(`Failed to save: ${data.error}`);
      }
    } catch (error) {
      console.error("Failed to save variant:", error);
      alert("Failed to save variant");
    } finally {
      setSaving(false);
    }
  }

  async function deleteVariant(variantId: string, index: number) {
    if (!confirm("Delete this variant?")) return;

    try {
      const res = await fetch(
        `/api/campaigns/${campaignId}/variants/create?variant_id=${variantId}`,
        { method: "DELETE" }
      );

      const data = await res.json();
      if (data.ok) {
        const updated = variants.filter((_, i) => i !== index);
        setVariants(updated);
      } else {
        alert(`Failed to delete: ${data.error}`);
      }
    } catch (error) {
      console.error("Failed to delete variant:", error);
      alert("Failed to delete variant");
    }
  }

  function updateVariant(index: number, field: keyof Variant, value: any) {
    const updated = [...variants];
    updated[index] = { ...updated[index], [field]: value };
    setVariants(updated);
  }

  if (loading) {
    return <div className="text-sm text-muted-foreground">Loading variants...</div>;
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Variants</CardTitle>
        <Button onClick={addVariant} size="sm" variant="outline">
          <Plus className="h-4 w-4 mr-2" />
          Add Variant
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {variants.length === 0 ? (
          <div className="text-sm text-muted-foreground text-center py-8">
            No variants yet. Click "Add Variant" to create one.
          </div>
        ) : (
          variants.map((variant, index) => (
            <div
              key={variant.id || index}
              className="border rounded-lg p-4 space-y-3"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Input
                    className="w-20"
                    value={variant.name}
                    onChange={(e) =>
                      updateVariant(index, "name", e.target.value)
                    }
                    placeholder="A"
                  />
                  <Input
                    type="number"
                    className="w-24"
                    value={variant.weight}
                    onChange={(e) =>
                      updateVariant(index, "weight", parseInt(e.target.value) || 0)
                    }
                    placeholder="50"
                  />
                  <Label className="text-xs text-muted-foreground">% weight</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => saveVariant(variant, index)}
                    disabled={saving}
                  >
                    <Save className="h-3 w-3 mr-1" />
                    Save
                  </Button>
                  {variant.id && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => deleteVariant(variant.id!, index)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-xs">Subject</Label>
                <Input
                  value={variant.subject}
                  onChange={(e) =>
                    updateVariant(index, "subject", e.target.value)
                  }
                  placeholder="Email subject line"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-xs">Body</Label>
                <Textarea
                  rows={6}
                  value={variant.body}
                  onChange={(e) =>
                    updateVariant(index, "body", e.target.value)
                  }
                  placeholder="Email body (HTML or plain text)"
                />
              </div>

              {(variant.sends !== undefined ||
                variant.opens !== undefined ||
                variant.clicks !== undefined ||
                variant.replies !== undefined) && (
                <div className="text-xs text-muted-foreground grid grid-cols-4 gap-2 pt-2 border-t">
                  <div>Sends: {variant.sends || 0}</div>
                  <div>Opens: {variant.opens || 0}</div>
                  <div>Clicks: {variant.clicks || 0}</div>
                  <div>Replies: {variant.replies || 0}</div>
                </div>
              )}
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}










