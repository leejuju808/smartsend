"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/Textarea";

interface IncidentReportModalProps {
  open: boolean;
  onClose: () => void;
}

const INCIDENT_TYPES = ["Injury", "Property Damage", "Near Miss"];
const SEVERITY_LEVELS = ["Low", "Medium", "High", "Critical"];

export function IncidentReportModal({ open, onClose }: IncidentReportModalProps) {
  const [loading, setLoading] = useState(false);
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [jobId, setJobId] = useState("");
  const [type, setType] = useState("");
  const [severity, setSeverity] = useState("");
  const [description, setDescription] = useState("");
  const [immediateAction, setImmediateAction] = useState("");
  const [followUpRequired, setFollowUpRequired] = useState(false);
  const [followUpNotes, setFollowUpNotes] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await fetch("/api/safety/incident", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date,
          job_id: jobId || null,
          type,
          severity,
          description,
          immediate_action: immediateAction,
          follow_up_required: followUpRequired,
          follow_up_notes: followUpNotes || null,
          images: [], // TODO: Add image upload
        }),
      });

      const data = await res.json();
      if (data.ok) {
        if (severity === "High" || severity === "Critical") {
          alert(
            `Incident reported. URGENT: ${severity} severity incident. Owner has been notified immediately.`
          );
        }
        onClose();
      } else {
        alert(data.error || "Failed to create incident report");
      }
    } catch (error) {
      console.error("Error creating incident report:", error);
      alert("Failed to create incident report");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Report Safety Incident</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="date">Date</Label>
            <Input
              id="date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
            />
          </div>

          <div>
            <Label htmlFor="job_id">Job ID (Optional)</Label>
            <Input
              id="job_id"
              value={jobId}
              onChange={(e) => setJobId(e.target.value)}
              placeholder="Enter job ID if applicable"
            />
          </div>

          <div>
            <Label htmlFor="type">Incident Type</Label>
            <select
              id="type"
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="flex h-10 w-full rounded-2xl border border-input bg-background px-3 py-2 text-sm"
              required
            >
              <option value="">Select type</option>
              {INCIDENT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          <div>
            <Label htmlFor="severity">Severity</Label>
            <select
              id="severity"
              value={severity}
              onChange={(e) => setSeverity(e.target.value)}
              className="flex h-10 w-full rounded-2xl border border-input bg-background px-3 py-2 text-sm"
              required
            >
              <option value="">Select severity</option>
              {SEVERITY_LEVELS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          <div>
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe what happened..."
              rows={4}
              required
            />
          </div>

          <div>
            <Label htmlFor="immediate_action">Immediate Action Taken</Label>
            <Textarea
              id="immediate_action"
              value={immediateAction}
              onChange={(e) => setImmediateAction(e.target.value)}
              placeholder="What immediate action was taken?"
              rows={3}
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="follow_up_required"
              checked={followUpRequired}
              onChange={(e) => setFollowUpRequired(e.target.checked)}
              className="h-4 w-4"
            />
            <Label htmlFor="follow_up_required">Follow-up Required</Label>
          </div>

          {followUpRequired && (
            <div>
              <Label htmlFor="follow_up_notes">Follow-up Notes</Label>
              <Textarea
                id="follow_up_notes"
                value={followUpNotes}
                onChange={(e) => setFollowUpNotes(e.target.value)}
                placeholder="What follow-up actions are needed?"
                rows={3}
              />
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Submitting..." : "Submit Incident Report"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}



























