"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/Textarea";

interface PPECheckModalProps {
  open: boolean;
  onClose: () => void;
}

export function PPECheckModal({ open, onClose }: PPECheckModalProps) {
  const [loading, setLoading] = useState(false);
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [jobId, setJobId] = useState("");
  const [hardHat, setHardHat] = useState(false);
  const [harness, setHarness] = useState(false);
  const [boots, setBoots] = useState(false);
  const [vest, setVest] = useState(false);
  const [goggles, setGoggles] = useState(false);
  const [gloves, setGloves] = useState(false);
  const [notes, setNotes] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await fetch("/api/safety/ppe-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date,
          job_id: jobId || null,
          hard_hat: hardHat,
          harness,
          boots,
          vest,
          goggles,
          gloves,
          notes,
        }),
      });

      const data = await res.json();
      if (data.ok) {
        if (data.missingItems > 0) {
          alert(
            `PPE check saved. Warning: ${data.missingItems} item(s) missing. Owner has been notified.`
          );
        }
        onClose();
      } else {
        alert(data.error || "Failed to create PPE check");
      }
    } catch (error) {
      console.error("Error creating PPE check:", error);
      alert("Failed to create PPE check");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>PPE Compliance Check</DialogTitle>
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

          <div className="space-y-3">
            <Label>PPE Items</Label>
            <div className="space-y-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox
                  checked={hardHat}
                  onCheckedChange={(checked) => setHardHat(checked === true)}
                />
                <span>Hard Hat</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox
                  checked={harness}
                  onCheckedChange={(checked) => setHarness(checked === true)}
                />
                <span>Harness</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox
                  checked={boots}
                  onCheckedChange={(checked) => setBoots(checked === true)}
                />
                <span>Safety Boots</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox
                  checked={vest}
                  onCheckedChange={(checked) => setVest(checked === true)}
                />
                <span>Safety Vest</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox
                  checked={goggles}
                  onCheckedChange={(checked) => setGoggles(checked === true)}
                />
                <span>Safety Goggles</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox
                  checked={gloves}
                  onCheckedChange={(checked) => setGloves(checked === true)}
                />
                <span>Gloves</span>
              </label>
            </div>
          </div>

          <div>
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add any additional notes..."
              rows={3}
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Saving..." : "Save PPE Check"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}



























