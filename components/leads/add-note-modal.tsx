"use client";

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
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface AddNoteModalProps {
  leadId: string;
  onClose: () => void;
  onSaved: () => void;
}

/**
 * Block 12200 — SmartSend Roofing Notes System v1
 * Modal for adding notes to a lead with next_step and follow_up_at
 */
export function AddNoteModal({ leadId, onClose, onSaved }: AddNoteModalProps) {
  const [noteText, setNoteText] = useState("");
  const [nextStep, setNextStep] = useState("");
  const [followUpDate, setFollowUpDate] = useState("");
  const [followUpTime, setFollowUpTime] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    if (!noteText.trim()) {
      setError("Please enter a note");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      // Combine date and time for follow_up_at
      let followUpAt: string | null = null;
      if (followUpDate) {
        if (followUpTime) {
          followUpAt = `${followUpDate}T${followUpTime}:00`;
        } else {
          followUpAt = `${followUpDate}T00:00:00`;
        }
      }

      const response = await fetch(`/api/leads/${leadId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          body: noteText.trim(),
          next_step: nextStep.trim() || null,
          follow_up_at: followUpAt || null,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to add note");
      }

      setNoteText("");
      setNextStep("");
      setFollowUpDate("");
      setFollowUpTime("");
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add note");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add Note</DialogTitle>
          <DialogDescription>
            Add an internal note about this homeowner. This will appear in the timeline.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="note">Note *</Label>
            <Textarea
              id="note"
              placeholder="Type note here... (e.g., 'Leak is over kitchen. Two-story. Wants estimate Friday after 4 PM.')"
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              rows={4}
              className="resize-none"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="next_step">Next Step (Optional)</Label>
            <Input
              id="next_step"
              placeholder="e.g., Call Monday, Send quote, Visit site"
              value={nextStep}
              onChange={(e) => setNextStep(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="follow_up_date">Follow-Up Date (Optional)</Label>
              <Input
                id="follow_up_date"
                type="date"
                value={followUpDate}
                onChange={(e) => setFollowUpDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="follow_up_time">Follow-Up Time (Optional)</Label>
              <Input
                id="follow_up_time"
                type="time"
                value={followUpTime}
                onChange={(e) => setFollowUpTime(e.target.value)}
              />
            </div>
          </div>

          {error && (
            <div className="text-sm text-destructive">{error}</div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || !noteText.trim()}>
            {saving ? "Saving..." : "Add Note"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}



