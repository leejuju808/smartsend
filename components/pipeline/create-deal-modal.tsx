"use client";

import { useState, useEffect } from "react";
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
import useSWR from "swr";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/src/components/ui/dialog";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function CreateDealModal({
  open,
  onOpenChange,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}) {
  const [formData, setFormData] = useState({
    lead_id: "",
    title: "",
    stage: "new",
    value: "",
    probability: 10,
    owner_id: "",
    next_action: "",
    next_action_due: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Fetch leads for dropdown
  const { data: leadsData } = useSWR(open ? "/api/leads/list?limit=100" : null, fetcher);
  
  // Fetch team members for owner dropdown
  const { data: teamData } = useSWR(open ? "/api/team/list" : null, fetcher);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/pipeline/deals/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          value: formData.value ? parseInt(formData.value as any) : null,
          probability: parseInt(formData.probability as any),
          owner_id: formData.owner_id || null,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to create deal");
      }

      onSuccess();
      // Reset form
      setFormData({
        lead_id: "",
        title: "",
        stage: "new",
        value: "",
        probability: 10,
        owner_id: "",
        next_action: "",
        next_action_due: "",
      });
    } catch (error: any) {
      console.error("Failed to create deal:", error);
      alert(error.message || "Failed to create deal");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Auto-fill title when lead is selected
  useEffect(() => {
    if (formData.lead_id && leadsData?.leads) {
      const lead = leadsData.leads.find((l: any) => l.id === formData.lead_id);
      if (lead && !formData.title) {
        const name =
          [lead.first_name, lead.last_name].filter(Boolean).join(" ") ||
          lead.company ||
          lead.email ||
          "Lead";
        setFormData({ ...formData, title: `${name} — Deal` });
      }
    }
  }, [formData.lead_id, leadsData]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create New Deal</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Lead Selection */}
          <div>
            <Label htmlFor="lead_id">Lead (Optional)</Label>
            <Select
              value={formData.lead_id}
              onValueChange={(v) => setFormData({ ...formData, lead_id: v })}
            >
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Select a lead" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">No lead</SelectItem>
                {leadsData?.leads?.map((lead: any) => (
                  <SelectItem key={lead.id} value={lead.id}>
                    {[lead.first_name, lead.last_name].filter(Boolean).join(" ") ||
                      lead.company ||
                      lead.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Title */}
          <div>
            <Label htmlFor="title">Title *</Label>
            <Input
              id="title"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              className="mt-1"
              required
              placeholder="e.g., Acme Corp — Deal"
            />
          </div>

          {/* Stage */}
          <div>
            <Label htmlFor="stage">Stage</Label>
            <Select
              value={formData.stage}
              onValueChange={(v) => setFormData({ ...formData, stage: v })}
            >
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="new">New</SelectItem>
                <SelectItem value="working">Working</SelectItem>
                <SelectItem value="meeting">Meeting</SelectItem>
                <SelectItem value="proposal">Proposal</SelectItem>
                <SelectItem value="closed_won">Closed Won</SelectItem>
                <SelectItem value="closed_lost">Closed Lost</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Value */}
          <div>
            <Label htmlFor="value">Value</Label>
            <Input
              id="value"
              type="number"
              value={formData.value}
              onChange={(e) => setFormData({ ...formData, value: e.target.value })}
              className="mt-1"
              placeholder="0"
            />
          </div>

          {/* Probability */}
          <div>
            <Label htmlFor="probability">Probability (%)</Label>
            <div className="mt-1">
              <Input
                id="probability"
                type="range"
                min="0"
                max="100"
                value={formData.probability}
                onChange={(e) =>
                  setFormData({ ...formData, probability: parseInt(e.target.value) })
                }
                className="w-full"
              />
              <p className="text-xs text-muted-foreground mt-1">{formData.probability}%</p>
            </div>
          </div>

          {/* Owner */}
          <div>
            <Label htmlFor="owner_id">Owner</Label>
            <Select
              value={formData.owner_id}
              onValueChange={(v) => setFormData({ ...formData, owner_id: v })}
            >
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Unassigned" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Unassigned</SelectItem>
                {teamData?.members?.map((member: any) => (
                  <SelectItem key={member.user_id} value={member.user_id}>
                    {member.email || member.full_name || "Unknown"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Next Action */}
          <div>
            <Label htmlFor="next_action">Next Action</Label>
            <Textarea
              id="next_action"
              value={formData.next_action}
              onChange={(e) => setFormData({ ...formData, next_action: e.target.value })}
              className="mt-1"
              placeholder="e.g., Send proposal"
            />
          </div>

          {/* Next Action Due */}
          {formData.next_action && (
            <div>
              <Label htmlFor="next_action_due">Due Date</Label>
              <Input
                id="next_action_due"
                type="date"
                value={formData.next_action_due}
                onChange={(e) => setFormData({ ...formData, next_action_due: e.target.value })}
                className="mt-1"
              />
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Creating..." : "Create Deal"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

