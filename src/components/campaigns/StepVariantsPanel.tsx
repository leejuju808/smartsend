"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

type Variant = {
  id: string;
  step_id: string;
  variant_key: string;
  subject: string | null;
  body: string | null;
  delay_hours: number | null;
};

type StepVariantsPanelProps = {
  stepId: string;
  stepNo: number;
};

export function StepVariantsPanel({ stepId, stepNo }: StepVariantsPanelProps) {
  const [variants, setVariants] = useState<Variant[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newVariantKey, setNewVariantKey] = useState("");

  useEffect(() => {
    loadVariants();
  }, [stepId]);

  async function loadVariants() {
    setLoading(true);
    try {
      const r = await fetch(`/api/campaigns/steps/variants/list?step_id=${stepId}`);
      const j = await r.json();
      if (r.ok) {
        setVariants(j.data || []);
      }
    } catch (e) {
      console.error("Failed to load variants", e);
    } finally {
      setLoading(false);
    }
  }

  async function addVariant() {
    if (!newVariantKey.trim()) {
      alert("Please enter a variant key (A, B, C, etc.)");
      return;
    }

    setLoading(true);
    try {
      const r = await fetch("/api/campaigns/steps/variants/add", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          step_id: stepId,
          variant_key: newVariantKey.trim().toUpperCase(),
        }),
      });
      const j = await r.json();
      if (!r.ok) {
        alert(j.error || "Failed to add variant");
        return;
      }
      setNewVariantKey("");
      setShowAddModal(false);
      await loadVariants();
    } catch (e) {
      alert("Failed to add variant: " + String(e));
    } finally {
      setLoading(false);
    }
  }

  async function deleteVariant(variantId: string) {
    if (!confirm("Are you sure you want to delete this variant?")) return;

    setLoading(true);
    try {
      const r = await fetch("/api/campaigns/steps/variants/delete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: variantId }),
      });
      const j = await r.json();
      if (!r.ok) {
        alert(j.error || "Failed to delete variant");
        return;
      }
      await loadVariants();
    } catch (e) {
      alert("Failed to delete variant: " + String(e));
    } finally {
      setLoading(false);
    }
  }

  async function updateVariant(variantId: string, field: "subject" | "body" | "delay_hours", value: string | number) {
    setLoading(true);
    try {
      const updateData: any = {};
      updateData[field] = value;
      
      const r = await fetch("/api/campaigns/steps/variants/update", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: variantId, ...updateData }),
      });
      const j = await r.json();
      if (!r.ok) {
        alert(j.error || "Failed to update variant");
        return;
      }
      await loadVariants();
    } catch (e) {
      alert("Failed to update variant: " + String(e));
    } finally {
      setLoading(false);
    }
  }

  if (loading && variants.length === 0) {
    return <div className="text-sm text-muted-foreground">Loading variants...</div>;
  }

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Variants (A/B Testing)</h3>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setShowAddModal(!showAddModal)}
          disabled={loading}
        >
          Add Variant
        </Button>
      </div>

      {showAddModal && (
        <Card className="p-3 bg-muted">
          <div className="space-y-2">
            <Label>Variant Key (A, B, C, etc.)</Label>
            <div className="flex gap-2">
              <Input
                value={newVariantKey}
                onChange={(e) => setNewVariantKey(e.target.value)}
                placeholder="B"
                className="w-24"
              />
              <Button size="sm" onClick={addVariant} disabled={loading}>
                Create
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setShowAddModal(false);
                  setNewVariantKey("");
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        </Card>
      )}

      <div className="space-y-3">
        {variants.length === 0 ? (
          <div className="text-sm text-muted-foreground">
            No variants yet. Add a variant to enable A/B testing for this step.
          </div>
        ) : (
          variants.map((v) => (
            <Card key={v.id} className="p-3 bg-muted">
              <div className="flex justify-between items-center mb-3">
                <div className="font-medium">Variant {v.variant_key}</div>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => deleteVariant(v.id)}
                  disabled={loading}
                >
                  Delete
                </Button>
              </div>

              <div className="space-y-2">
                <div>
                  <Label className="text-xs">Subject</Label>
                  <Input
                    defaultValue={v.subject || ""}
                    onBlur={(e) => updateVariant(v.id, "subject", e.target.value)}
                    disabled={loading}
                  />
                </div>

                <div>
                  <Label className="text-xs">Body</Label>
                  <Textarea
                    defaultValue={v.body || ""}
                    onBlur={(e) => updateVariant(v.id, "body", e.target.value)}
                    rows={4}
                    disabled={loading}
                  />
                </div>

                <div>
                  <Label className="text-xs">Delay (hours)</Label>
                  <Input
                    type="number"
                    defaultValue={v.delay_hours || ""}
                    onBlur={(e) =>
                      updateVariant(v.id, "delay_hours", e.target.value ? Number(e.target.value) : null)
                    }
                    disabled={loading}
                  />
                </div>
              </div>
            </Card>
          ))
        )}
      </div>
    </Card>
  );
}



