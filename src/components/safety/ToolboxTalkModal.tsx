"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";

interface ToolboxTalkModalProps {
  open: boolean;
  onClose: () => void;
}

const TOPICS = [
  "Fall Protection",
  "Ladder Safety",
  "Heat Exhaustion",
  "Tool Safety",
  "Material Handling",
  "Electrical Safety",
  "Weather Conditions",
  "Emergency Procedures",
];

export function ToolboxTalkModal({ open, onClose }: ToolboxTalkModalProps) {
  const [loading, setLoading] = useState(false);
  const [topic, setTopic] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [notes, setNotes] = useState("");
  const [jobId, setJobId] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await fetch("/api/safety/toolbox-talk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date,
          topic,
          notes,
          job_id: jobId || null,
        }),
      });

      const data = await res.json();
      if (data.ok) {
        onClose();
      } else {
        alert(data.error || "Failed to create toolbox talk");
      }
    } catch (error) {
      console.error("Error creating toolbox talk:", error);
      alert("Failed to create toolbox talk");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Start Toolbox Talk</DialogTitle>
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
            <Label htmlFor="topic">Topic</Label>
            <select
              id="topic"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              className="flex h-10 w-full rounded-2xl border border-input bg-background px-3 py-2 text-sm"
              required
            >
              <option value="">Select a topic</option>
              {TOPICS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
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
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add any additional notes about today's safety topic..."
              rows={4}
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Creating..." : "Create Toolbox Talk"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}



























