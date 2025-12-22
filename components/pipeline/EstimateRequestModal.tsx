"use client";

// Block 73000 — Estimate Request Modal
// Fast-track estimate request form

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

interface Lead {
  id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
}

interface EstimateRequestModalProps {
  open: boolean;
  onClose: () => void;
  lead: Lead;
  onSuccess: () => void;
}

export function EstimateRequestModal({
  open,
  onClose,
  lead,
  onSuccess,
}: EstimateRequestModalProps) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    job_type: "",
    urgency: "Medium",
    notes: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await fetch("/api/estimates/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lead_id: lead.id,
          job_type: formData.job_type,
          urgency: formData.urgency,
          notes: formData.notes,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to create estimate request");
      }

      toast.success("Estimate request created");
      onSuccess();
      setFormData({ job_type: "", urgency: "Medium", notes: "" });
    } catch (error: any) {
      console.error("Error creating estimate request:", error);
      toast.error(error.message || "Failed to create estimate request");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Create Estimate Request</DialogTitle>
          <DialogDescription>
            Fast-track estimate for {lead.first_name || lead.last_name || lead.email}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="job_type">Job Type</Label>
            <Select
              value={formData.job_type}
              onValueChange={(value) =>
                setFormData({ ...formData, job_type: value })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Select job type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Roof Repair">Roof Repair</SelectItem>
                <SelectItem value="Full Tear-Off">Full Tear-Off</SelectItem>
                <SelectItem value="Inspection">Inspection</SelectItem>
                <SelectItem value="Gutter Replacement">Gutter Replacement</SelectItem>
                <SelectItem value="Storm Damage">Storm Damage</SelectItem>
                <SelectItem value="Insurance Claim">Insurance Claim</SelectItem>
                <SelectItem value="Other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="urgency">Urgency</Label>
            <Select
              value={formData.urgency}
              onValueChange={(value) =>
                setFormData({ ...formData, urgency: value })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Low">Low</SelectItem>
                <SelectItem value="Medium">Medium</SelectItem>
                <SelectItem value="High">High</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              placeholder="Additional details, special instructions, etc."
              value={formData.notes}
              onChange={(e) =>
                setFormData({ ...formData, notes: e.target.value })
              }
              rows={4}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading || !formData.job_type}>
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Create Request
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}



























