"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/Textarea";
import {
  Navigation,
  MapPin,
  Wrench,
  UtensilsCrossed,
  CheckCircle2,
  Loader2,
} from "lucide-react";

interface CrewCheckInMobileProps {
  jobId: string;
  crewId: string;
  onCheckIn?: () => void;
}

const checkInStatuses = [
  {
    value: "on_the_way",
    label: "On the Way",
    icon: Navigation,
    color: "bg-blue-500",
  },
  {
    value: "arrived",
    label: "Arrived",
    icon: MapPin,
    color: "bg-green-500",
  },
  {
    value: "in_progress",
    label: "In Progress",
    icon: Wrench,
    color: "bg-yellow-500",
  },
  {
    value: "lunch",
    label: "Lunch Break",
    icon: UtensilsCrossed,
    color: "bg-orange-500",
  },
  {
    value: "completed",
    label: "Complete for the Day",
    icon: CheckCircle2,
    color: "bg-purple-500",
  },
];

export function CrewCheckInMobile({
  jobId,
  crewId,
  onCheckIn,
}: CrewCheckInMobileProps) {
  const [selectedStatus, setSelectedStatus] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [lastSubmitted, setLastSubmitted] = useState<string | null>(null);

  const handleCheckIn = async () => {
    if (!selectedStatus) {
      alert("Please select a status");
      return;
    }

    try {
      setSubmitting(true);
      const response = await fetch(`/api/jobs/${jobId}/checkin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          crew_id: crewId,
          status: selectedStatus,
          notes: notes.trim() || null,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to check in");
      }

      setLastSubmitted(selectedStatus);
      setNotes("");
      if (onCheckIn) {
        onCheckIn();
      }
    } catch (error: any) {
      alert(error.message || "Failed to check in");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-md mx-auto p-4 space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Crew Check-In</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Status Buttons */}
          <div className="grid grid-cols-2 gap-2">
            {checkInStatuses.map((status) => {
              const Icon = status.icon;
              const isSelected = selectedStatus === status.value;
              const isLastSubmitted = lastSubmitted === status.value;

              return (
                <Button
                  key={status.value}
                  onClick={() => setSelectedStatus(status.value)}
                  variant={isSelected ? "default" : "outline"}
                  className={`h-auto py-4 flex flex-col items-center gap-2 ${
                    isLastSubmitted ? "ring-2 ring-green-500" : ""
                  }`}
                  disabled={submitting}
                >
                  <Icon className={`h-6 w-6 ${isSelected ? "text-white" : ""}`} />
                  <span className="text-xs">{status.label}</span>
                  {isLastSubmitted && (
                    <CheckCircle2 className="h-4 w-4 text-green-500 absolute top-1 right-1" />
                  )}
                </Button>
              );
            })}
          </div>

          {/* Notes */}
          <div>
            <label className="text-sm font-medium mb-2 block">Notes (Optional)</label>
            <Textarea
              placeholder="Add any notes about the job status..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="resize-none"
            />
          </div>

          {/* Submit Button */}
          <Button
            onClick={handleCheckIn}
            disabled={!selectedStatus || submitting}
            className="w-full"
            size="lg"
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Submitting...
              </>
            ) : (
              "Check In"
            )}
          </Button>

          {lastSubmitted && (
            <div className="p-3 bg-green-50 border border-green-200 rounded-md">
              <p className="text-sm text-green-800">
                ✓ Check-in submitted:{" "}
                {checkInStatuses.find((s) => s.value === lastSubmitted)?.label}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Quick Actions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Button
            variant="outline"
            className="w-full justify-start"
            onClick={() => {
              // Navigate to photo upload
              window.location.href = `/jobs/${jobId}/photos`;
            }}
          >
            <span>📷</span>
            <span className="ml-2">Upload Photo</span>
          </Button>
          <Button
            variant="outline"
            className="w-full justify-start"
            onClick={() => {
              // Navigate to material verification
              window.location.href = `/jobs/${jobId}/materials`;
            }}
          >
            <span>📦</span>
            <span className="ml-2">Verify Materials</span>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

































