// Block 92000 — SmartSend Roofing Service Request Button v1
// Button in homeowner portal to request service/warranty help

"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
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
import { Wrench, Upload, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface ServiceRequestButtonProps {
  jobId: string;
  workspaceId?: string;
  homeownerName: string;
  homeownerEmail?: string;
  homeownerPhone?: string;
  homeownerAddress?: string;
  warrantyId?: string;
  token: string;
}

export function ServiceRequestButton({
  jobId,
  workspaceId,
  homeownerName,
  homeownerEmail,
  homeownerPhone,
  homeownerAddress,
  warrantyId,
  token,
}: ServiceRequestButtonProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    issue_description: "",
    issue_category: "",
    priority: "normal",
    photos: [] as File[],
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Get workspace_id from portal if not provided
      let finalWorkspaceId = workspaceId;
      if (!finalWorkspaceId) {
        // Fetch from portal token
        const portalResponse = await fetch(
          `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/homeowner-job-feed`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ token }),
          }
        );
        if (portalResponse.ok) {
          const portalData = await portalResponse.json();
          finalWorkspaceId = portalData.workspace_id;
        }
      }

      if (!finalWorkspaceId) {
        throw new Error("Could not determine workspace");
      }

      // Upload photos if any
      let photoUrls: string[] = [];
      if (formData.photos.length > 0) {
        // In a real implementation, you'd upload to Supabase Storage
        // For now, we'll skip photo uploads or use a placeholder
        toast.info("Photo upload will be implemented");
      }

      const response = await fetch("/api/service-tickets", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          workspace_id: finalWorkspaceId,
          job_id: jobId,
          warranty_id: warrantyId || null,
          homeowner_name: homeownerName,
          homeowner_email: homeownerEmail,
          homeowner_phone: homeownerPhone,
          homeowner_address: homeownerAddress,
          issue_description: formData.issue_description,
          issue_category: formData.issue_category || null,
          priority: formData.priority,
          photos: photoUrls.map((url) => ({ url, type: "damage" })),
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to create service ticket");
      }

      toast.success("Service request submitted! We'll be in touch soon.");
      setOpen(false);
      setFormData({
        issue_description: "",
        issue_category: "",
        priority: "normal",
        photos: [],
      });
    } catch (error: any) {
      console.error("Error creating service ticket:", error);
      toast.error(error.message || "Failed to submit service request");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        className="w-full"
        variant="outline"
      >
        <Wrench className="h-4 w-4 mr-2" />
        Request Service / Warranty Help
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Request Service or Warranty Help</DialogTitle>
            <DialogDescription>
              Describe the issue you're experiencing and we'll create a service ticket.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="issue_category">Issue Type</Label>
              <Select
                value={formData.issue_category}
                onValueChange={(value) =>
                  setFormData({ ...formData, issue_category: value })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select issue type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="nail_pop">Nail Pop</SelectItem>
                  <SelectItem value="missing_shingle">Missing Shingle</SelectItem>
                  <SelectItem value="leak">Leak</SelectItem>
                  <SelectItem value="vent_issue">Vent Issue</SelectItem>
                  <SelectItem value="flashing_failure">Flashing Failure</SelectItem>
                  <SelectItem value="storm_damage">Storm Damage</SelectItem>
                  <SelectItem value="warranty_claim">Warranty Claim</SelectItem>
                  <SelectItem value="maintenance">Maintenance</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="issue_description">Description *</Label>
              <Textarea
                id="issue_description"
                placeholder="Describe the issue in detail..."
                value={formData.issue_description}
                onChange={(e) =>
                  setFormData({ ...formData, issue_description: e.target.value })
                }
                required
                rows={4}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="priority">Priority</Label>
              <Select
                value={formData.priority}
                onValueChange={(value) =>
                  setFormData({ ...formData, priority: value })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="emergency">Emergency</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="photos">Photos (Optional)</Label>
              <Input
                id="photos"
                type="file"
                accept="image/*"
                multiple
                onChange={(e) => {
                  const files = Array.from(e.target.files || []);
                  setFormData({ ...formData, photos: files });
                }}
              />
              <p className="text-xs text-muted-foreground">
                Upload photos of the issue if available
              </p>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={loading}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={loading || !formData.issue_description}>
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  "Submit Request"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}



























