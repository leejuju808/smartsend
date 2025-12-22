"use client";

import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type Variant = {
  id?: string;
  variant_key: 'A' | 'B';
  subject: string | null;
  body: string | null;
};

type ABVariantEditorProps = {
  stepId: string;
  stepNo: number;
  campaignId: string;
  defaultSubject?: string | null;
  defaultBody?: string | null;
};

export function ABVariantEditor({ 
  stepId, 
  stepNo, 
  campaignId,
  defaultSubject,
  defaultBody 
}: ABVariantEditorProps) {
  const [hasVariants, setHasVariants] = useState(false);
  const [variants, setVariants] = useState<Variant[]>([
    { variant_key: 'A', subject: defaultSubject || null, body: defaultBody || null },
    { variant_key: 'B', subject: null, body: null }
  ]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [viewMode, setViewMode] = useState<'side-by-side' | 'tabs'>('side-by-side');

  useEffect(() => {
    loadVariants();
  }, [stepId]);

  async function loadVariants() {
    if (!stepId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      // Load step to check if has_variants is enabled
      const stepRes = await fetch(`/api/campaigns/${campaignId}/steps`);
      const stepData = await stepRes.json();
      const step = stepData.steps?.find((s: any) => s.id === stepId);
      
      if (step?.has_variants) {
        setHasVariants(true);
        
        // Load existing variants
        const variantsRes = await fetch(`/api/campaigns/${campaignId}/steps/${stepId}/variants`);
        const variantsData = await variantsRes.json();
        
        if (variantsData.variants && variantsData.variants.length > 0) {
          const variantA = variantsData.variants.find((v: Variant) => v.variant_key === 'A');
          const variantB = variantsData.variants.find((v: Variant) => v.variant_key === 'B');
          
          setVariants([
            variantA || { variant_key: 'A', subject: step?.subject_template || defaultSubject || null, body: step?.body_html_template || defaultBody || null },
            variantB || { variant_key: 'B', subject: null, body: null }
          ]);
        } else {
          // Initialize with default step content for Variant A if no variants exist yet
          setVariants([
            { variant_key: 'A', subject: step?.subject_template || defaultSubject || null, body: step?.body_html_template || defaultBody || null },
            { variant_key: 'B', subject: null, body: null }
          ]);
        }
      } else {
        // Initialize with default step content for Variant A
        setVariants([
          { variant_key: 'A', subject: step?.subject_template || defaultSubject || null, body: step?.body_html_template || defaultBody || null },
          { variant_key: 'B', subject: null, body: null }
        ]);
      }
    } catch (error) {
      console.error("Failed to load variants", error);
    } finally {
      setLoading(false);
    }
  }

  async function saveVariants() {
    if (!stepId) {
      alert("Please save the step first before enabling A/B variants");
      return;
    }

    setSaving(true);
    try {
      // First, update the step's has_variants flag
      const stepRes = await fetch(`/api/campaigns/${campaignId}/steps`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ 
          id: stepId,
          has_variants: hasVariants 
        })
      });

      if (!stepRes.ok) {
        const error = await stepRes.json();
        throw new Error(error.error || "Failed to update step");
      }

      if (hasVariants) {
        // Save variants
        const variantsRes = await fetch(`/api/campaigns/${campaignId}/steps/${stepId}/variants`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ variants })
        });

        if (!variantsRes.ok) {
          const error = await variantsRes.json();
          throw new Error(error.error || "Failed to save variants");
        }
      } else {
        // If disabling variants, delete them
        await fetch(`/api/campaigns/${campaignId}/steps/${stepId}/variants`, {
          method: "DELETE"
        });
      }

      alert("A/B variants saved successfully!");
    } catch (error: any) {
      alert(`Failed to save: ${error.message}`);
    } finally {
      setSaving(false);
    }
  }

  function updateVariant(variantKey: 'A' | 'B', field: 'subject' | 'body', value: string) {
    setVariants(prev => prev.map(v => 
      v.variant_key === variantKey 
        ? { ...v, [field]: value || null }
        : v
    ));
  }

  if (loading) {
    return <div className="text-sm text-muted-foreground">Loading variants...</div>;
  }

  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Checkbox 
            checked={hasVariants} 
            onCheckedChange={(checked) => {
              setHasVariants(Boolean(checked));
              if (!checked) {
                // Reset to default when disabling
                setVariants([
                  { variant_key: 'A', subject: defaultSubject || null, body: defaultBody || null },
                  { variant_key: 'B', subject: null, body: null }
                ]);
              }
            }}
          />
          <Label className="text-sm font-medium">Enable A/B Variants</Label>
        </div>
        {hasVariants && (
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant={viewMode === 'side-by-side' ? 'default' : 'outline'}
              onClick={() => setViewMode('side-by-side')}
            >
              Side-by-side
            </Button>
            <Button
              size="sm"
              variant={viewMode === 'tabs' ? 'default' : 'outline'}
              onClick={() => setViewMode('tabs')}
            >
              Tabs
            </Button>
            <Button size="sm" onClick={saveVariants} disabled={saving}>
              {saving ? "Saving..." : "Save Variants"}
            </Button>
          </div>
        )}
      </div>

      {hasVariants && (
        <>
          {viewMode === 'side-by-side' ? (
            <div className="grid md:grid-cols-2 gap-4">
              {variants.map((variant) => (
                <Card key={variant.variant_key} className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <Label className="text-sm font-semibold">Variant {variant.variant_key}</Label>
                    {variant.variant_key === 'A' && (
                      <span className="text-xs text-muted-foreground">(Default)</span>
                    )}
                  </div>
                  <div className="space-y-3">
                    <div>
                      <Label className="text-xs">Subject</Label>
                      <Input
                        value={variant.subject || ""}
                        onChange={(e) => updateVariant(variant.variant_key, 'subject', e.target.value)}
                        placeholder="Email subject..."
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Body</Label>
                      <Textarea
                        value={variant.body || ""}
                        onChange={(e) => updateVariant(variant.variant_key, 'body', e.target.value)}
                        placeholder="Email body (HTML)..."
                        rows={8}
                        className="mt-1 font-mono text-xs"
                      />
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          ) : (
            <Tabs defaultValue="A" className="w-full">
              <TabsList>
                <TabsTrigger value="A">Variant A</TabsTrigger>
                <TabsTrigger value="B">Variant B</TabsTrigger>
              </TabsList>
              {variants.map((variant) => (
                <TabsContent key={variant.variant_key} value={variant.variant_key} className="space-y-3">
                  <div className="space-y-3">
                    <div>
                      <Label className="text-xs">Subject</Label>
                      <Input
                        value={variant.subject || ""}
                        onChange={(e) => updateVariant(variant.variant_key, 'subject', e.target.value)}
                        placeholder="Email subject..."
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Body</Label>
                      <Textarea
                        value={variant.body || ""}
                        onChange={(e) => updateVariant(variant.variant_key, 'body', e.target.value)}
                        placeholder="Email body (HTML)..."
                        rows={10}
                        className="mt-1 font-mono text-xs"
                      />
                    </div>
                  </div>
                </TabsContent>
              ))}
            </Tabs>
          )}
          
          <div className="text-xs text-muted-foreground bg-muted p-2 rounded">
            <strong>Note:</strong> Traffic will be split 50/50 between Variant A and Variant B. 
            Variant A is pre-loaded with your current step content.
          </div>
        </>
      )}
    </Card>
  );
}

