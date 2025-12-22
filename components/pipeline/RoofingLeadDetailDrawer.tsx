// Block 24260 — SmartSend Roofing Lead Detail Drawer
// Shows full lead details and allows stage updates

"use client";

import { useState } from "react";
import { RoofingLead } from "./RoofingPipelineBoard";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import clsx from "clsx";

type RoofingLeadDetailDrawerProps = {
  lead: RoofingLead;
  open: boolean;
  onClose: () => void;
  onUpdate: () => void;
};

const ROOFING_STAGES = [
  { value: "lead_in", label: "Lead In" },
  { value: "inspection_set", label: "Inspection Set" },
  { value: "quote_sent", label: "Quote Sent" },
  { value: "approved", label: "Approved" },
  { value: "scheduled", label: "Scheduled" },
  { value: "installed", label: "Installed" },
];

export function RoofingLeadDetailDrawer({
  lead,
  open,
  onClose,
  onUpdate,
}: RoofingLeadDetailDrawerProps) {
  const [selectedStage, setSelectedStage] = useState(lead.pipeline_stage);
  const [estimatedValue, setEstimatedValue] = useState(
    lead.estimated_value?.toString() || ""
  );
  const [closeProbability, setCloseProbability] = useState(
    lead.close_probability?.toString() || ""
  );
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      // Update stage if changed
      if (selectedStage !== lead.pipeline_stage) {
        await fetch("/api/pipeline/roofing/move", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            lead_id: lead.id,
            new_stage: selectedStage,
            trigger_reason: "manual_update",
          }),
        });
      }

      // TODO: Update estimated_value and close_probability via API
      // This would require a separate endpoint or extending the move endpoint

      onUpdate();
      onClose();
    } catch (error) {
      console.error("Error updating lead:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const statusColors = {
    HOT: "bg-red-500/20 border-red-500/50 text-red-400",
    WARM: "bg-yellow-500/20 border-yellow-500/50 text-yellow-400",
    COLD: "bg-gray-500/20 border-gray-500/50 text-gray-400",
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span>{lead.homeowner_name}</span>
            <span
              className={clsx(
                "px-2 py-1 rounded text-xs font-medium border",
                statusColors[lead.lead_status]
              )}
            >
              {lead.lead_status}
            </span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 mt-4">
          {/* Contact Information */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-zinc-300">Contact Information</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-xs text-zinc-400">Email</Label>
                <Input value={lead.email} disabled className="mt-1" />
              </div>
              <div>
                <Label className="text-xs text-zinc-400">Phone</Label>
                <Input
                  value={lead.phone || ""}
                  disabled
                  className="mt-1"
                />
              </div>
              <div className="col-span-2">
                <Label className="text-xs text-zinc-400">Address</Label>
                <Input value={lead.address || ""} disabled className="mt-1" />
              </div>
            </div>
          </div>

          {/* Pipeline Stage */}
          <div className="space-y-2">
            <Label className="text-sm font-semibold text-zinc-300">
              Pipeline Stage
            </Label>
            <Select value={selectedStage} onValueChange={setSelectedStage}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROOFING_STAGES.map((stage) => (
                  <SelectItem key={stage.value} value={stage.value}>
                    {stage.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Job Details */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-zinc-300">Job Details</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-xs text-zinc-400">
                  Estimated Job Value ($)
                </Label>
                <Input
                  type="number"
                  value={estimatedValue}
                  onChange={(e) => setEstimatedValue(e.target.value)}
                  className="mt-1"
                  placeholder="0.00"
                />
              </div>
              <div>
                <Label className="text-xs text-zinc-400">
                  Close Probability (%)
                </Label>
                <Input
                  type="number"
                  value={closeProbability}
                  onChange={(e) => setCloseProbability(e.target.value)}
                  className="mt-1"
                  placeholder="0"
                  min="0"
                  max="100"
                />
              </div>
            </div>
          </div>

          {/* Tags */}
          {lead.tags && lead.tags.length > 0 && (
            <div className="space-y-2">
              <Label className="text-sm font-semibold text-zinc-300">Tags</Label>
              <div className="flex flex-wrap gap-2">
                {lead.tags.map((tag, idx) => (
                  <span
                    key={idx}
                    className="px-2 py-1 rounded text-xs bg-zinc-800 text-zinc-400 border border-zinc-700"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Timeline Information */}
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-zinc-300">Timeline</h3>
            <div className="space-y-1 text-xs text-zinc-400">
              <div>Days in current stage: {lead.days_in_stage}</div>
              {lead.days_since_last_contact !== null && (
                <div>
                  Days since last contact: {lead.days_since_last_contact}
                </div>
              )}
              {lead.stage_entered_at && (
                <div>
                  Stage entered:{" "}
                  {new Date(lead.stage_entered_at).toLocaleDateString()}
                </div>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 pt-4 border-t border-zinc-800">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}






































