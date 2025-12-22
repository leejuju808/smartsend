"use client";

import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";

interface ABVariantEditorProps {
  campaignId: string;
  variantId: string | null; // null = create new
  onClose: () => void;
}

export function ABVariantEditor({ campaignId, variantId, onClose }: ABVariantEditorProps) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    variant_label: "",
    subject: "",
    body: "",
    persona_id: null as string | null,
  });

  useEffect(() => {
    if (variantId) {
      loadVariant();
    } else {
      // Auto-generate next label
      generateNextLabel();
    }
  }, [variantId, campaignId]);

  const generateNextLabel = async () => {
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/ab-test/variants`);
      if (res.ok) {
        const variants = await res.json();
        const labels = variants.map((v: any) => v.variant_label).sort();
        let nextLabel = "A";
        if (labels.length > 0) {
          const lastLabel = labels[labels.length - 1];
          nextLabel = String.fromCharCode(lastLabel.charCodeAt(0) + 1);
        }
        setFormData(prev => ({ ...prev, variant_label: nextLabel }));
      }
    } catch (error) {
      console.error("Failed to generate label:", error);
    }
  };

  const loadVariant = async () => {
    if (!variantId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/ab-test/variants/${variantId}`);
      if (res.ok) {
        const variant = await res.json();
        setFormData({
          variant_label: variant.variant_label || "",
          subject: variant.subject || "",
          body: variant.body || "",
          persona_id: variant.persona_id || null,
        });
      }
    } catch (error) {
      console.error("Failed to load variant:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const url = variantId
        ? `/api/campaigns/${campaignId}/ab-test/variants/${variantId}`
        : `/api/campaigns/${campaignId}/ab-test/variants`;
      
      const method = variantId ? "PUT" : "POST";
      
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (res.ok) {
        onClose();
      } else {
        const error = await res.json();
        alert(error.error || "Failed to save variant");
      }
    } catch (error) {
      console.error("Failed to save variant:", error);
      alert("Failed to save variant");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {variantId ? "Edit Variant" : "Create A/B Test Variant"}
          </DialogTitle>
          <DialogDescription>
            {variantId 
              ? "Modify this variant to test different messaging."
              : "Create a new variant to test against your existing emails. Test subject lines, intros, CTAs, tone, and more."
            }
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="variant_label">Variant Label</Label>
                <Input
                  id="variant_label"
                  value={formData.variant_label}
                  onChange={(e) => setFormData(prev => ({ ...prev, variant_label: e.target.value.toUpperCase() }))}
                  placeholder="A, B, C..."
                  maxLength={1}
                  required
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Single letter identifier (A, B, C, etc.)
                </p>
              </div>
            </div>

            <div>
              <Label htmlFor="subject">Subject Line</Label>
              <Input
                id="subject"
                value={formData.subject}
                onChange={(e) => setFormData(prev => ({ ...prev, subject: e.target.value }))}
                placeholder="Quick question about your roof..."
                required
              />
              <p className="text-xs text-muted-foreground mt-1">
                Test different subject lines to see what gets the most opens.
              </p>
            </div>

            <div>
              <Label htmlFor="body">Email Body</Label>
              <Textarea
                id="body"
                value={formData.body}
                onChange={(e) => setFormData(prev => ({ ...prev, body: e.target.value }))}
                placeholder="Hey {{first_name}},&#10;&#10;I noticed your roof might need attention..."
                rows={12}
                required
              />
              <p className="text-xs text-muted-foreground mt-1">
                Test different intros, CTAs, tone, and length. Use variables like {"{{first_name}}"} for personalization.
              </p>
            </div>

            <div className="flex items-center justify-end gap-3 pt-4 border-t">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  variantId ? "Update Variant" : "Create Variant"
                )}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}



























