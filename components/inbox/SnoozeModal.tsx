"use client";

// Block 11900 — Inbox Snooze & Reminders v1
// Snooze modal component with presets and custom date/time picker

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Clock } from "lucide-react";

interface SnoozeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  threadId: string;
  onSnoozed?: () => void;
}

type SnoozePreset = {
  label: string;
  getDate: () => Date;
};

export function SnoozeModal({
  open,
  onOpenChange,
  threadId,
  onSnoozed,
}: SnoozeModalProps) {
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);
  const [customDateTime, setCustomDateTime] = useState("");
  const [loading, setLoading] = useState(false);

  // Calculate preset dates
  const presets: Record<string, SnoozePreset> = {
    "1hour": {
      label: "1 hour",
      getDate: () => {
        const date = new Date();
        date.setHours(date.getHours() + 1);
        return date;
      },
    },
    "later_today": {
      label: "Later today",
      getDate: () => {
        const date = new Date();
        date.setHours(date.getHours() + 4); // 4 hours from now
        if (date.getHours() >= 17) {
          // If after 5 PM, set to 9 AM next day
          date.setDate(date.getDate() + 1);
          date.setHours(9, 0, 0, 0);
        }
        return date;
      },
    },
    "tomorrow_morning": {
      label: "Tomorrow morning",
      getDate: () => {
        const date = new Date();
        date.setDate(date.getDate() + 1);
        date.setHours(9, 0, 0, 0);
        return date;
      },
    },
    "tomorrow_afternoon": {
      label: "Tomorrow afternoon",
      getDate: () => {
        const date = new Date();
        date.setDate(date.getDate() + 1);
        date.setHours(15, 0, 0, 0);
        return date;
      },
    },
    "this_weekend": {
      label: "This weekend",
      getDate: () => {
        const date = new Date();
        const dayOfWeek = date.getDay();
        const daysUntilSaturday = (6 - dayOfWeek + 7) % 7 || 7;
        date.setDate(date.getDate() + daysUntilSaturday);
        date.setHours(9, 0, 0, 0);
        return date;
      },
    },
    "next_week": {
      label: "Next week",
      getDate: () => {
        const date = new Date();
        const dayOfWeek = date.getDay();
        const daysUntilMonday = (1 - dayOfWeek + 7) % 7 || 7;
        date.setDate(date.getDate() + daysUntilMonday);
        date.setHours(9, 0, 0, 0);
        return date;
      },
    },
  };

  const handlePresetSelect = (presetKey: string) => {
    setSelectedPreset(presetKey);
    setCustomDateTime("");
    
    // Set custom datetime input to the preset value for display
    const presetDate = presets[presetKey].getDate();
    const localDateTime = new Date(presetDate.getTime() - presetDate.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16);
    setCustomDateTime(localDateTime);
  };

  const handleSnooze = async () => {
    let untilDate: Date;

    if (selectedPreset && presets[selectedPreset]) {
      untilDate = presets[selectedPreset].getDate();
    } else if (customDateTime) {
      untilDate = new Date(customDateTime);
    } else {
      return; // No selection made
    }

    if (isNaN(untilDate.getTime())) {
      alert("Invalid date/time selected");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`/api/inbox/replies/${threadId}/snooze`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          until: untilDate.toISOString(),
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to snooze thread");
      }

      onSnoozed?.();
      onOpenChange(false);
      
      // Reset state
      setSelectedPreset(null);
      setCustomDateTime("");
    } catch (error) {
      console.error("Error snoozing thread:", error);
      alert(error instanceof Error ? error.message : "Failed to snooze thread");
    } finally {
      setLoading(false);
    }
  };

  const handleCustomDateTimeChange = (value: string) => {
    setCustomDateTime(value);
    setSelectedPreset(null);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Snooze Thread
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Preset options */}
          <div className="space-y-2">
            <Label>Quick Options</Label>
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(presets).map(([key, preset]) => (
                <Button
                  key={key}
                  type="button"
                  variant={selectedPreset === key ? "default" : "outline"}
                  onClick={() => handlePresetSelect(key)}
                  className="justify-start"
                >
                  {preset.label}
                </Button>
              ))}
            </div>
          </div>

          {/* Custom date/time picker */}
          <div className="space-y-2">
            <Label htmlFor="custom-datetime">Custom Date & Time</Label>
            <Input
              id="custom-datetime"
              type="datetime-local"
              value={customDateTime}
              onChange={(e) => handleCustomDateTimeChange(e.target.value)}
              min={new Date().toISOString().slice(0, 16)}
            />
            {customDateTime && (
              <p className="text-xs text-muted-foreground">
                Will resurface: {new Date(customDateTime).toLocaleString()}
              </p>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            onClick={() => {
              onOpenChange(false);
              setSelectedPreset(null);
              setCustomDateTime("");
            }}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSnooze}
            disabled={loading || (!selectedPreset && !customDateTime)}
          >
            {loading ? "Snoozing..." : "Snooze"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}




























































