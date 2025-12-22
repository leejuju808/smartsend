// Block 92000 — SmartSend Roofing Warranty Creation Dialog v1
// Dialog for creating warranties when jobs are completed

"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Shield, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface CreateWarrantyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  jobId: string;
  workspaceId: string;
  homeownerName: string;
  homeownerEmail?: string;
  homeownerPhone?: string;
  onSuccess?: () => void;
}

export function CreateWarrantyDialog({
  open,
  onOpenChange,
  jobId,
  workspaceId,
  homeownerName,
  homeownerEmail,
  homeownerPhone,
  onSuccess,
}: CreateWarrantyDialogProps) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    warranty_type: "",
    warranty_length_years: "",
    start_date: new Date().toISOString().split("T")[0],
    coverage_description: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await fetch("/api/warranties", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          workspace_id: workspaceId,
          job_id: jobId,
          homeowner_name: homeownerName,
          homeowner_email: homeownerEmail,
          homeowner_phone: homeownerPhone,
          warranty_type: formData.warranty_type,
          warranty_length_years: formData.warranty_length_years
            ? parseInt(formData.warranty_length_years)
            : null,
          start_date: formData.start_date,
          coverage_description: formData.coverage_description || null,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to create warranty");
      }

      toast.success("Warranty created successfully!");
      onOpenChange(false);
      setFormData({
        warranty_type: "",
        warranty_length_years: "",
        start_date: new Date().toISOString().split("T")[0],
        coverage_description: "",
      });
      onSuccess?.();
    } catch (error: any) {
      console.error("Error creating warranty:", error);
      toast.error(error.message || "Failed to create warranty");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Add Warranty for This Job
          </DialogTitle>
          <DialogDescription>
            Register a warranty for {homeownerName}. This will be visible in the homeowner portal and linked to service tickets.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="warranty_type">Warranty Type *</Label>
            <Select
              value={formData.warranty_type}
              onValueChange={(value) =>
                setFormData({ ...formData, warranty_type: value })
              }
              required
            >
              <SelectTrigger>
                <SelectValue placeholder="Select warranty type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="workmanship">Workmanship</SelectItem>
                <SelectItem value="manufacturer">Manufacturer</SelectItem>
                <SelectItem value="extended">Extended</SelectItem>
                <SelectItem value="lifetime">Lifetime</SelectItem>
                <SelectItem value="limited">Limited</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="warranty_length_years">Warranty Length (Years)</Label>
            <Input
              id="warranty_length_years"
              type="number"
              min="1"
              placeholder="e.g., 5, 10, 25 (leave blank for lifetime)"
              value={formData.warranty_length_years}
              onChange={(e) =>
                setFormData({ ...formData, warranty_length_years: e.target.value })
              }
            />
            <p className="text-xs text-muted-foreground">
              Leave blank for lifetime warranties
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="start_date">Start Date *</Label>
            <Input
              id="start_date"
              type="date"
              value={formData.start_date}
              onChange={(e) =>
                setFormData({ ...formData, start_date: e.target.value })
              }
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="coverage_description">Coverage Description</Label>
            <Textarea
              id="coverage_description"
              placeholder="Describe what is covered under this warranty..."
              value={formData.coverage_description}
              onChange={(e) =>
                setFormData({ ...formData, coverage_description: e.target.value })
              }
              rows={4}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                "Create Warranty"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}



























