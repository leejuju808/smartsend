"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Phone, Calendar } from "lucide-react";

interface LogCallModalProps {
  open: boolean;
  onClose: () => void;
  onCallLogged: () => void;
  contactId?: string;
  defaultPhone?: string;
}

const OUTCOMES = [
  { value: "talked", label: "Talked" },
  { value: "no_answer", label: "No Answer" },
  { value: "left_voicemail", label: "Left Voicemail" },
  { value: "missed", label: "Missed Call" },
  { value: "declined", label: "Declined" },
  { value: "scheduled_inspection", label: "Scheduled Inspection" },
  { value: "estimate_discussed", label: "Estimate Discussed" },
  { value: "interested", label: "Interested" },
];

export function LogCallModal({
  open,
  onClose,
  onCallLogged,
  contactId,
  defaultPhone,
}: LogCallModalProps) {
  const [direction, setDirection] = useState<"inbound" | "outbound">("outbound");
  const [phone, setPhone] = useState(defaultPhone || "");
  const [outcome, setOutcome] = useState("talked");
  const [notes, setNotes] = useState("");
  const [followUpDate, setFollowUpDate] = useState("");
  const [followUpTime, setFollowUpTime] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!phone.trim()) {
      alert("Phone number is required");
      return;
    }

    setLoading(true);
    try {
      const followUpAt =
        followUpDate && followUpTime
          ? new Date(`${followUpDate}T${followUpTime}`).toISOString()
          : undefined;

      const res = await fetch("/api/call-log/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contactId: contactId || null,
          phone: phone.trim(),
          direction,
          outcome,
          notes: notes.trim() || undefined,
          followUpAt,
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        throw new Error(json.error || "Failed to log call");
      }

      // Reset form
      setPhone(defaultPhone || "");
      setOutcome("talked");
      setNotes("");
      setFollowUpDate("");
      setFollowUpTime("");
      setDirection("outbound");

      onCallLogged();
    } catch (error) {
      console.error("Error logging call:", error);
      alert(error instanceof Error ? error.message : "Failed to log call");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Log Phone Call</DialogTitle>
          <DialogDescription>
            Record a phone call with this contact
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Direction */}
          <div className="space-y-2">
            <Label>Direction</Label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="direction"
                  value="outbound"
                  checked={direction === "outbound"}
                  onChange={(e) => setDirection(e.target.value as "outbound")}
                  className="w-4 h-4"
                />
                <span>Outbound</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="direction"
                  value="inbound"
                  checked={direction === "inbound"}
                  onChange={(e) => setDirection(e.target.value as "inbound")}
                  className="w-4 h-4"
                />
                <span>Inbound</span>
              </label>
            </div>
          </div>

          {/* Phone Number */}
          <div className="space-y-2">
            <Label htmlFor="phone">
              <Phone className="h-4 w-4 inline mr-1" />
              Phone Number
            </Label>
            <Input
              id="phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="(555) 123-4567"
              required
            />
          </div>

          {/* Outcome */}
          <div className="space-y-2">
            <Label htmlFor="outcome">Outcome</Label>
            <select
              id="outcome"
              value={outcome}
              onChange={(e) => setOutcome(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              required
            >
              {OUTCOMES.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add call notes..."
              rows={4}
            />
          </div>

          {/* Follow-Up */}
          <div className="space-y-2">
            <Label>
              <Calendar className="h-4 w-4 inline mr-1" />
              Follow-Up (Optional)
            </Label>
            <div className="grid grid-cols-2 gap-2">
              <Input
                type="date"
                value={followUpDate}
                onChange={(e) => setFollowUpDate(e.target.value)}
                placeholder="Date"
              />
              <Input
                type="time"
                value={followUpTime}
                onChange={(e) => setFollowUpTime(e.target.value)}
                placeholder="Time"
              />
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Saving..." : "Save Call Log"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}



























































