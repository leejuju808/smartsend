"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState } from "react";
import { Loader2 } from "lucide-react";

interface ScheduleEstimateModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lead: {
    id: string;
    address?: string | null;
    email?: string | null;
    first_name?: string | null;
    last_name?: string | null;
  };
  onScheduled?: () => void;
}

export function ScheduleEstimateModal({
  open,
  onOpenChange,
  lead,
  onScheduled,
}: ScheduleEstimateModalProps) {
  const [start, setStart] = useState("");
  const [location, setLocation] = useState(lead.address || "");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Format datetime-local input value
  const formatDateTimeLocal = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  };

  // Set default to tomorrow at 9 AM if not set
  if (!start && open) {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(9, 0, 0, 0);
    setStart(formatDateTimeLocal(tomorrow));
  }

  async function handleSubmit() {
    if (!start) {
      setError("Date & Time is required");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Convert datetime-local to ISO string
      const startTime = new Date(start).toISOString();

      const res = await fetch("/api/estimates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lead_id: lead.id,
          start_time: startTime,
          location: location || "On-site",
          notes: notes || "",
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        throw new Error(json?.error ?? "Failed to schedule estimate");
      }

      // Reset form
      setStart("");
      setLocation(lead.address || "");
      setNotes("");
      
      // Call callback and close
      if (onScheduled) {
        onScheduled();
      }
      onOpenChange(false);
      
      // Reload page to show updated estimate info
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to schedule estimate");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Schedule Estimate</DialogTitle>
          <DialogDescription>
            Book an estimate appointment for this lead
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 mt-4">
          <div className="space-y-2">
            <Label htmlFor="start-time">Date & Time</Label>
            <Input
              id="start-time"
              type="datetime-local"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              disabled={loading}
              className="w-full"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="location">Location</Label>
            <Input
              id="location"
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Job address or 'On-site'"
              disabled={loading}
              className="w-full"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes (optional)</Label>
            <Input
              id="notes"
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Additional notes about the estimate"
              disabled={loading}
              className="w-full"
            />
          </div>

          {error && (
            <div className="text-sm text-red-500 bg-red-50 p-2 rounded">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="outline"
              onClick={() => {
                setError(null);
                onOpenChange(false);
              }}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={loading || !start}
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Scheduling...
                </>
              ) : (
                "Schedule Estimate"
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}














































